"""Verifier — proves the broker is who the posting says it is, then audits the
paper they send back. Nothing calls a broker before this agent says so.

Eight checks, three sources, one memory:
  * FMCSA QCMobile — authority, insurance, out-of-service.
  * RDAP — how old the domain actually is.
  * the memory graph — phone and ACH reuse across entities, payment history,
    detention behaviour.
  * **the callback cross-check** — the load posting carries a contact phone and
    email. Verifier looks up the registered contact for the claimed MC
    *independently*, compares them, and if they differ it reverse-looks-up who
    really owns the number on the posting. A load posted under a good broker's
    MC with a stranger's phone on it is double-brokering, and it is invisible to
    every check that only reads the MC.

Then it recalls what happened to this carrier before — the specific $4,000, the
specific denied detention claim — and cites it, because "risk 74" persuades
nobody and "this is the bank account that already took $4,000 off you three
weeks ago" ends the conversation.

Its second job is paper: Model Armor screens an inbound rate con BEFORE any
model reads it; if clean, Document AI extracts it and every field is diffed
against the terms Closer locked."""
from __future__ import annotations

import re

from .base import Agent
from ..platform import armor
from ..platform.memory import bank
from ..platform.observability import TraceEvent, hub
from . import llm_helper

CHECK_WEIGHTS = {
    # the callback mismatch is the single strongest tell we have — on its own
    # it is enough to refuse, because there is no innocent explanation for it.
    "callback": 40,
    "authority": 22, "insurance": 14, "oos": 18, "domain": 14,
    "phone": 16, "ach": 10, "payment": 36, "detention": 12,
}


class Verifier(Agent):
    key = "VERIFIER"

    # ---- screening ------------------------------------------------------

    async def screen(self, run_id: str, mc: str, *, posting: dict | None = None,
                     quiet: bool = False, silent: bool = False) -> dict:
        """`quiet` = bulk board screening: no narration, but a callback mismatch
        still shouts. `silent` = the driver app polling every few seconds: run
        the identical checks and emit nothing at all."""
        quiet = quiet or silent
        broker = await bank.get("brokers", mc)
        name = (broker or {}).get("name", mc)
        if not quiet:
            self.say(run_id, f"screening {mc} · {name}"
                     + (f" · posting {posting['id']}" if posting else ""))

        t = (lambda s: None) if silent else (lambda s: s)
        fmcsa = await self.call(run_id, "fmcsa.screen", mc_number=mc,
                                trace=t("FMCSA QCMobile — {detail}"))
        f = fmcsa.value
        domain = (broker or {}).get("domain", "")
        rdap = await self.call(run_id, "rdap.domain_age", domain=domain, mc_number=mc,
                               trace=t("RDAP — {detail}"))
        graph = await self.call(run_id, "graph.query", mc_number=mc,
                                trace=t("graph — {detail}"))
        col = graph.value["collisions"]

        checks: list[dict] = []

        def add(k, ok, evidence, warn=False, skipped=False):
            checks.append({"key": k, "name": _NAME[k], "ok": ok, "warn": warn,
                           "skipped": skipped, "evidence": evidence})

        # --- 1. the callback cross-check ---
        cb = await self._callback_check(run_id, mc, broker, posting, quiet, silent)
        add("callback", cb["ok"], cb["evidence"], skipped=cb["skipped"])

        add("authority", f.get("authority_active", False),
            f"active {f.get('authority_age_days', 0)//365}y+" if f.get("authority_active")
            else (f"registered {f.get('authority_age_days')} days ago" if f.get("authority_age_days")
                  else "not allowed to operate / unverified"))
        add("insurance", f.get("insurance_on_file", False),
            "BIPD + cargo on file" if f.get("insurance_on_file") else "no insurance filing")
        add("oos", not f.get("out_of_service", False),
            "clear" if not f.get("out_of_service") else "OUT-OF-SERVICE ORDER ACTIVE")
        age = rdap.value.get("age_days")
        add("domain", age is not None and age >= 60,
            f"{domain} · {_age(age)}" if age is not None else f"{domain} · no registration record")
        add("phone", not col["phone"],
            (broker or {}).get("phone", "?") + " · unique" if not col["phone"]
            else f"{(broker or {}).get('phone')} also on " + ", ".join(x["name"] for x in col["phone"]))
        add("ach", not col["ach"],
            "routing unique" if not col["ach"]
            else f"routing shared with {len(col['ach'])} other entit{'ies' if len(col['ach'])>1 else 'y'}")
        unpaid = (broker or {}).get("unpaid", 0)
        prior = (broker or {}).get("prior_loads", 0)
        avg = (broker or {}).get("avg_pay_days", 0)
        add("payment", unpaid == 0 and avg <= 45,
            f"${unpaid:,} unpaid to this carrier" if unpaid
            else (f"{prior} loads · avg pay {avg}d" if prior else "no history in graph"),
            warn=(unpaid == 0 and avg > 45))
        denied = (broker or {}).get("detention_denied", 0)
        det_owed = (broker or {}).get("detention_unpaid", 0)
        filed = (broker or {}).get("detention_claims", 0)
        add("detention", denied == 0,
            (f"{denied} of {filed} detention claims denied · ${det_owed:,.0f} still owed"
             if denied else
             (f"{filed} detention claims, all settled" if filed else "no detention history")))

        # --- 2. what do we actually remember about them ---
        memories = await self._recall(run_id, mc, broker, cb, quiet, silent)

        scored = [c for c in checks if not c["skipped"]]
        score = round(sum(0 if c["ok"] else (CHECK_WEIGHTS[c["key"]] / 2 if c["warn"]
                          else CHECK_WEIGHTS[c["key"]]) for c in scored))
        score = min(100, score + cb.get("extra_risk", 0))
        failed = [c for c in scored if not c["ok"] and not c["warn"]]
        blacklisted = mc in (await _blacklist())
        if blacklisted:
            verdict, tone = "BLACKLISTED", "fail"
        elif score >= 40:
            verdict, tone = "REFUSE", "fail"
        elif score >= 15:
            verdict, tone = "REVIEW", "warn"
        else:
            verdict, tone = "CLEAR", "pass"

        result = {"mc": mc, "broker": name, "verdict": verdict, "score": score,
                  "checks": checks, "failed": len(failed), "collisions": col,
                  "callback": cb, "memories": memories, "tone": tone,
                  "posting_id": (posting or {}).get("id")}
        # Bulk board screening uses the deterministic template summary; only an
        # interactive single screen spends a live Gemini call on the prose.
        if quiet:
            neighbors = {x["_key"]: x for x in col["phone"] + col["ach"]}
            result["summary"] = _template_summary(result, neighbors, memories)
        else:
            result["summary"] = await self._summary(run_id, result, broker, memories)

        if not quiet:
            self.say(run_id,
                     f"{mc} → {verdict} · risk {score}/100 · {len(failed)}/{len(scored)} checks failed",
                     tone, verdict=verdict, score=score)
        return result

    async def _callback_check(self, run_id: str, mc: str, broker: dict | None,
                              posting: dict | None, quiet: bool,
                              silent: bool = False) -> dict:
        """Compare the contact on the posting against the contact on file for
        the MC it claims to be. Independent lookup, then a literal diff."""
        posted_phone = (posting or {}).get("cph")
        posted_email = (posting or {}).get("cem")
        if not posting or not (posted_phone or posted_email):
            return {"ok": True, "skipped": True, "mismatch": False, "extra_risk": 0,
                    "evidence": "no contact on the posting to cross-check"}

        reg = await self.call(run_id, "fmcsa.contact", mc_number=mc,
                              trace=None if quiet else "registry callback lookup — {detail}",
                              tone="ok")
        r = reg.value
        if not r.get("found"):
            return {"ok": True, "skipped": True, "mismatch": False, "extra_risk": 0,
                    "evidence": "no registered contact on file to compare against"}

        reg_phone, reg_email = r.get("phone"), r.get("email")
        phone_bad = bool(posted_phone and reg_phone and posted_phone != reg_phone)
        email_bad = bool(posted_email and reg_email and posted_email != reg_email)
        lines: list[str] = []
        if posted_phone and reg_phone:
            lines.append(f"posting says {posted_phone} · FMCSA registry says {reg_phone} · "
                         + ("MISMATCH" if phone_bad else "match"))
        if posted_email and reg_email:
            lines.append(f"posting says {posted_email} · FMCSA registry says {reg_email} · "
                         + ("MISMATCH" if email_bad else "match"))

        if not (phone_bad or email_bad):
            if not quiet and not silent:
                for line in lines:
                    self.say(run_id, line, "pass")
            return {"ok": True, "skipped": False, "mismatch": False, "extra_risk": 0,
                    "lines": lines,
                    "evidence": "posting contact matches the registered contact"}

        # A mismatch is always worth a trace line, even in bulk screening.
        if not silent:
            for line in lines:
                self.say(run_id, line, "fail" if "MISMATCH" in line else "ok")

        # Who actually owns the number on the posting?
        owner = await self.call(run_id, "graph.who_owns", phone=posted_phone,
                                email=posted_email, tone="fail",
                                trace=None if silent else "reverse lookup — {detail}")
        owners = owner.value.get("owners") or []
        extra = 0
        if owners:
            o = owners[0]
            age_d = o.get("domain_age_days", 0)
            if not silent:
                self.say(run_id,
                         f"{posted_phone or posted_email} belongs to {o['name']} ({o['_key']}) — "
                         f"an entity registered {age_d} days ago, not "
                         f"{(broker or {}).get('name', mc)}", "fail")
            extra += 8
            if age_d and age_d < 60:
                extra += 8
        evidence = " · ".join(lines)
        if owners:
            evidence += f" · number belongs to {owners[0]['name']} ({owners[0]['_key']})"
        return {"ok": False, "skipped": False, "mismatch": True, "extra_risk": extra,
                "lines": lines, "owners": owners, "evidence": evidence}

    async def _recall(self, run_id: str, mc: str, broker: dict | None,
                      cb: dict, quiet: bool, silent: bool = False) -> list[dict]:
        """Read the Memory Bank for this MC, its bank account, and — if the
        callback check found an impostor — the impostor's bank account too."""
        seen: dict[str, dict] = {}
        probes = [{"mc_number": mc, "ach": (broker or {}).get("ach"),
                   "phone": (broker or {}).get("phone")}]
        for o in cb.get("owners", []) or []:
            probes.append({"mc_number": o["_key"], "ach": o.get("ach"),
                           "phone": o.get("phone")})
        for probe in probes:
            rec = await self.call(run_id, "memory.recall", **probe,
                                  trace=None if quiet else "Memory Bank — {detail}")
            for m in rec.value.get("memories", []):
                seen[m["_key"]] = m
        mems = sorted(seen.values(), key=lambda m: m.get("days_ago", 999))
        # Cite the two sharpest memories in plain English. Bulk board screening
        # stays quiet unless the callback check already blew the whistle.
        if not silent and (not quiet or cb.get("mismatch")):
            for m in mems[:2]:
                self.say(run_id, f"memory · {m['text']}",
                         "pass" if m["kind"] == "paid_well" else "fail")
        return mems

    async def _summary(self, run_id, result, broker, memories) -> str:
        col = result["collisions"]
        neighbors = {x["_key"]: x for x in col["phone"] + col["ach"]}
        neighbor_str = "; ".join(f"{v['name']} ({v['_key']}"
                                 + (f", ${v['unpaid']:,} unpaid" if v.get("unpaid") else "") + ")"
                                 for v in neighbors.values())
        cb = result["callback"]
        cb_str = ("callback cross-check: " + " ; ".join(cb.get("lines", []))
                  if cb.get("lines") else "callback cross-check: not applicable")
        mem_str = " ".join(f"[{_ago(m['days_ago'])}] {m['text']}" for m in memories[:3]) or "nothing remembered"
        facts = (f"verdict {result['verdict']}, risk {result['score']}, "
                 f"failed checks: {', '.join(c['name'] for c in result['checks'] if not c['ok'] and not c['skipped']) or 'none'}. "
                 f"{cb_str}. graph neighbors sharing phone/ACH: {neighbor_str or 'none'}. "
                 f"what this carrier remembers: {mem_str}")
        template = _template_summary(result, neighbors, memories)
        return await llm_helper.explain(
            run_id, self,
            system=("You are Verifier, a freight-fraud screening agent for a 3-truck "
                    "carrier. In 1-2 blunt sentences explain the verdict to the owner. If "
                    "the memory contains a specific past event (an amount, a broker, a "
                    "denied claim), cite that concrete fact rather than the risk number. "
                    "No preamble, no jargon."),
            prompt=f"Broker {result['broker']} ({result['mc']}). Facts: {facts}",
            template=template)

    # ---- paper ----------------------------------------------------------

    async def audit(self, run_id: str, load_id: str, pdf_bytes: bytes,
                    injected: bool = False) -> dict:
        locked = await bank.get("locked_terms", load_id) or {}
        self.say(run_id, f"auditing rate con for {load_id} against locked terms")

        # 1) Model Armor BEFORE extraction — the whole point of the ordering
        text_layer = _extract_raw_text(pdf_bytes)
        verdict = armor.screen_pdf(pdf_bytes, text_layer)
        hub.emit(TraceEvent(run_id=run_id, agent="Model Armor", agent_name="Model Armor",
                            kind="armor", backend="live",
                            tone="block" if not verdict.allowed else "pass",
                            msg=(f"BLOCKED — {verdict.detail}" if not verdict.allowed
                                 else "screen PASS · no hidden layer, no injection")))
        if not verdict.allowed:
            for f in verdict.findings[:2]:
                hub.emit(TraceEvent(run_id=run_id, agent="Model Armor",
                                    agent_name="Model Armor", kind="armor",
                                    tone="block", msg=f))
            quarantine = {"load_id": load_id, "threat": verdict.threat,
                          "findings": verdict.findings}
            await bank.put("quarantine", load_id, quarantine)
            self.say(run_id, "document quarantined · extraction aborted · broker record untouched",
                     "block")
            return {"blocked": True, "verdict": verdict.to_dict()}

        # 2) Document AI extraction (Gemini multimodal)
        ext = await self.call(run_id, "doc.extract", pdf_bytes=pdf_bytes, template=locked,
                              trace="Document AI — {detail}")
        parsed = ext.value

        # 3) diff vs locked terms. $75 and 75.0 are the same number — only a
        # real difference is an exception, or every clean run cries wolf.
        diffs = []
        for field in ("rate", "detention_rate", "free_hours"):
            want, got = locked.get(field), parsed.get(field)
            if want is not None and got is not None and not _same(want, got):
                diffs.append({"field": field, "agreed": want, "on_paper": got})

        if not diffs:
            self.say(run_id, "diff vs locked terms: rate ✓ detention ✓ · no exceptions", "pass")
            return {"blocked": False, "exceptions": [], "parsed": parsed}

        short = next((d for d in diffs if d["field"] == "rate"), diffs[0])
        template = (f"Rate con shows {short['field']} {short['on_paper']} but we agreed "
                    f"{short['agreed']}. Please correct and resend.")
        draft = await llm_helper.explain(
            run_id, self,
            system="You are Verifier. Draft a 2-sentence, firm-but-polite correction email to the broker.",
            prompt=f"Load {load_id}. Discrepancies: {diffs}. Agreed terms are the reference.",
            template=template)
        await self.call(run_id, "mail.send",
                        to=locked.get("broker_email", "dispatch@broker.example"),
                        subject=f"Correction needed — rate con {load_id}",
                        body=draft, kind="correction", trace="Gmail — {detail}")
        # a caught short is worth remembering the next time this MC posts
        await self.call(run_id, "memory.write", key=f"MEM-SHORT-{load_id}",
                        kind="short_paper", mc_number=locked.get("mc"),
                        amount=float(short.get("agreed") or 0),
                        text=(f"{locked.get('broker', 'This broker')} sent a rate con that "
                              f"shorted the agreed {short['field']} on {load_id}."))
        self.say(run_id, f"caught {len(diffs)} exception(s) · correction drafted and sent", "warn")
        return {"blocked": False, "exceptions": diffs, "parsed": parsed}


_NAME = {"callback": "Callback cross-check", "authority": "FMCSA authority",
         "insurance": "Insurance on file", "oos": "Out-of-service check",
         "domain": "Domain age (RDAP)", "phone": "Phone collision",
         "ach": "ACH collision", "payment": "Payment history",
         "detention": "Detention behaviour"}


_NUM = re.compile(r"-?\d+(?:\.\d+)?")


def _same(a, b) -> bool:
    """$75, 75.0 and '75/hr after 2h' all mean the same rate. Extraction is a
    language model — compare the number it found, not the string it wrote."""
    sa, sb = str(a).replace(",", ""), str(b).replace(",", "")
    ma, mb = _NUM.search(sa), _NUM.search(sb)
    if ma and mb:
        return abs(float(ma.group()) - float(mb.group())) < 0.01
    return sa.strip().lower() == sb.strip().lower()


def _age(days: int) -> str:
    return f"{days/365:.1f}y old" if days >= 365 else f"{days}d old"


def _ago(days: int) -> str:
    if days <= 1:
        return "yesterday"
    if days < 14:
        return f"{days} days ago"
    if days < 45:
        return f"{round(days / 7)} weeks ago"
    return f"{round(days / 30)} months ago"


def _template_summary(result, neighbors, memories=()) -> str:
    v = result["verdict"]
    cb = result.get("callback", {})
    if v == "BLACKLISTED":
        return "Flagged by this desk. Finder filters this broker and its graph neighbours from future scans."
    if cb.get("mismatch"):
        owners = cb.get("owners") or []
        who = f" The number on it belongs to {owners[0]['name']}." if owners else ""
        base = (f"The posting's contact details are not the ones {result['broker']} has on file "
                f"with FMCSA.{who} That is what double-brokering looks like.")
        hit = next((m for m in memories if m["kind"] in ("unpaid", "shell_ring")), None)
        if hit:
            base += f" {hit['text']}"
        return base
    if v == "REFUSE":
        owed = sum(n.get("unpaid", 0) for n in neighbors.values())
        base = f"{result['failed']} of {len([c for c in result['checks'] if not c['skipped']])} checks failed."
        if neighbors:
            base += " Graph ties it to " + " and ".join(n["name"] for n in neighbors.values())
            if owed:
                base += f", which owes this carrier ${owed:,}."
        return base
    if v == "REVIEW":
        hit = next((m for m in memories if m["kind"] == "detention_denied"), None)
        if hit:
            return hit["text"]
        return "Nothing disqualifying, but thin history or slow pay — worth a human look."
    good = next((m for m in memories if m["kind"] == "paid_well"), None)
    if good:
        return good["text"]
    return "Clean: active authority, contact matches the registry, no collisions, pays on time."


def _extract_raw_text(pdf_bytes: bytes) -> str:
    try:
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


async def _blacklist() -> set[str]:
    doc = await bank.get("settings", "blacklist")
    return set((doc or {}).get("mcs", []))


async def blacklist_add(mcs: list[str]) -> list[str]:
    current = await _blacklist()
    current.update(mcs)
    await bank.put("settings", "blacklist", {"mcs": sorted(current)})
    return sorted(current)
