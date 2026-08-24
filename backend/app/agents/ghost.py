"""Ghost — the villain-killer. Runs seven checks against FMCSA (authority,
insurance, OOS), RDAP (domain age), and the memory graph (phone collision,
ACH collision, payment history), scores the risk, and asks Gemini to write the
verdict in plain English. Refusing here halts the run before anyone calls the
broker and blacklists the whole shell ring."""
from __future__ import annotations

from .base import Agent
from ..platform.memory import bank
from . import llm_helper


CHECK_WEIGHTS = {
    "authority": 22, "insurance": 14, "oos": 18, "domain": 14,
    "phone": 16, "ach": 10, "payment": 36,
}


class Ghost(Agent):
    key = "GHOST"

    async def screen(self, run_id: str, mc: str, *, quiet: bool = False) -> dict:
        broker = await bank.get("brokers", mc)
        name = (broker or {}).get("name", mc)
        if not quiet:
            self.say(run_id, f"screening {mc} · {name}")

        fmcsa = await self.call(run_id, "fmcsa.screen", mc_number=mc,
                                trace="FMCSA QCMobile — {detail}",
                                tone="ok" if not quiet else "ok")
        f = fmcsa.value
        domain = (broker or {}).get("domain", "")
        rdap = await self.call(run_id, "rdap.domain_age", domain=domain, mc_number=mc,
                               trace="RDAP — {detail}")
        graph = await self.call(run_id, "graph.query", mc_number=mc,
                                trace="graph — {detail}")
        col = graph.value["collisions"]

        checks = []

        def add(k, ok, evidence, warn=False):
            checks.append({"key": k, "name": _NAME[k], "ok": ok, "warn": warn,
                           "evidence": evidence})

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

        score = round(sum(0 if c["ok"] else (CHECK_WEIGHTS[c["key"]] / 2 if c["warn"]
                          else CHECK_WEIGHTS[c["key"]]) for c in checks))
        failed = [c for c in checks if not c["ok"] and not c["warn"]]
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
                  "tone": tone}
        result["summary"] = await self._summary(run_id, result, broker)

        if not quiet:
            self.say(run_id, f"{mc} → {verdict} · risk {score}/100 · {len(failed)}/7 checks failed",
                     tone, verdict=verdict, score=score)
        return result

    async def _summary(self, run_id, result, broker) -> str:
        col = result["collisions"]
        neighbors = {x["_key"]: x for x in col["phone"] + col["ach"]}
        neighbor_str = "; ".join(f"{v['name']} ({v['_key']}"
                                 + (f", ${v['unpaid']:,} unpaid" if v.get("unpaid") else "") + ")"
                                 for v in neighbors.values())
        facts = (f"verdict {result['verdict']}, risk {result['score']}, "
                 f"failed checks: {', '.join(c['name'] for c in result['checks'] if not c['ok']) or 'none'}. "
                 f"graph neighbors sharing phone/ACH: {neighbor_str or 'none'}.")
        template = _template_summary(result, neighbors)
        text = await llm_helper.explain(
            run_id, self,
            system=("You are Ghost, a freight-fraud screening agent. In 1-2 blunt "
                    "sentences explain the verdict to a small carrier. No preamble."),
            prompt=f"Broker {result['broker']} ({result['mc']}). Facts: {facts}",
            template=template)
        return text


_NAME = {"authority": "FMCSA authority", "insurance": "Insurance on file",
         "oos": "Out-of-service check", "domain": "Domain age (RDAP)",
         "phone": "Phone collision", "ach": "ACH collision", "payment": "Payment history"}


def _age(days: int) -> str:
    return f"{days/365:.1f}y old" if days >= 365 else f"{days}d old"


def _template_summary(result, neighbors) -> str:
    v = result["verdict"]
    if v == "BLACKLISTED":
        return "Flagged by this desk. Scout filters this broker and its graph neighbours from future scans."
    if v == "REFUSE":
        owed = sum(n.get("unpaid", 0) for n in neighbors.values())
        base = f"{result['failed']} of 7 checks failed."
        if neighbors:
            base += " Graph ties it to " + " and ".join(n["name"] for n in neighbors.values())
            if owed:
                base += f", which owes this carrier ${owed:,}."
        return base
    if v == "REVIEW":
        return "Nothing disqualifying, but thin history or slow pay — worth a human look."
    return "Clean: active authority, no collisions, pays on time."


async def _blacklist() -> set[str]:
    doc = await bank.get("settings", "blacklist")
    return set((doc or {}).get("mcs", []))


async def blacklist_add(mcs: list[str]) -> list[str]:
    current = await _blacklist()
    current.update(mcs)
    await bank.put("settings", "blacklist", {"mcs": sorted(current)})
    return sorted(current)
