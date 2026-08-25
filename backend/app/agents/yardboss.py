"""Yard Boss — the orchestrator and the chat you talk to. It routes events and
natural-language commands (Gemini function calling, keyword fallback with no
key) to one of four specialists, holds run state, and narrates the handoff
chain. It is the one agent a human addresses directly; the rest it dispatches.

The fleet is deliberately four, not eight: Finder (is there money in it),
Verifier (are they real, is the paper honest), Closer (get it booked and
driven), Payday (get paid, including the fight over waiting time). A bundle of
API calls is not an agent — each of these owns a decision, keeps memory, and
retries on its own judgement."""
from __future__ import annotations

import re

from .base import Agent
from .closer import Closer
from .finder import Finder
from .payday import Payday
from .verifier import Verifier, blacklist_add, _blacklist
from ..platform.memory import bank
from ..platform.observability import hub
from ..platform.runtime import runs
from ..tools import llm

ROUTES = [
    {"name": "scan_board",
     "description": "Scan the load board for the truck: Finder pulls postings and does the money math, Verifier screens the survivors. Use for 'find loads', 'scan the board', 'what's available'.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "screen_broker",
     "description": "Run Verifier fraud screening on one broker MC number or one posting id. Use for 'screen MC-1680087', 'is this broker legit', 'check P-90431'.",
     "parameters": {"type": "object", "properties": {"mc": {"type": "string", "description": "the MC number, e.g. MC-1680087, or a posting id"}}, "required": ["mc"]}},
    {"name": "book_load",
     "description": "Book a specific posting end to end: verify, negotiate, audit the rate con, run the trip, get paid. Use for 'book P-90412', 'take the Columbus load'.",
     "parameters": {"type": "object", "properties": {"posting_id": {"type": "string"}, "rate": {"type": "integer", "description": "agreed rate if the human named one"}}, "required": ["posting_id"]}},
    {"name": "audit_injection",
     "description": "Audit an incoming broker rate-con PDF that contains a hidden prompt-injection attack, to demonstrate Model Armor blocking it inline. Use for 'show the injection', 'test model armor', 'the suspicious PDF'.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "detention_status",
     "description": "Report the detention clock: how long the truck has been sitting at a dock, what is owed, and whether the claim was filed. Use for 'how long have I been waiting', 'what's my detention', 'am I getting paid to sit here'.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "run_scenario",
     "description": "Run a full pre-scripted end-to-end scenario. 'clean' = clean load booked/hauled/paid; 'ghost' = shell-ring double-brokering caught and refused; 'callback' = a load posted under a real broker's MC with an impostor's phone number on it; 'detention' = truck stuck on a dock, clock run and claim filed; 'injection' = prompt injection blocked.",
     "parameters": {"type": "object", "properties": {"which": {"type": "string", "enum": ["clean", "ghost", "callback", "detention", "injection"]}}, "required": ["which"]}},
]

SYSTEM = ("You are Yard Boss, the orchestrator of an autonomous freight desk with four "
          "specialist agents: Finder (finds loads and proves they clear a profit), "
          "Verifier (proves the broker is real and audits the paper), Closer (negotiates, "
          "books and runs the trip), Payday (detention clock, invoice, collections). "
          "Route the operator's request to exactly one tool. Be terse.")


class YardBoss(Agent):
    key = "YARD BOSS"

    def __init__(self) -> None:
        super().__init__()
        self.finder = Finder()
        self.verifier = Verifier()
        self.closer = Closer()
        self.payday = Payday()

    # ---- chat routing ---------------------------------------------------

    async def chat(self, run_id: str, message: str, history: list[dict]) -> dict:
        hub.emit_misc("chat", {"run_id": run_id, "role": "user", "text": message})
        fc = await llm.function_call(message, system=SYSTEM, tools=ROUTES, history=history)
        route = fc.get("call")
        if route is None:
            route = self._keyword_route(message)
            backend = "keyword"
        else:
            backend = "live"
        if route is None:
            reply = ("I route freight ops. Try: “scan the board”, “screen MC-1680087”, "
                     "“book P-90412”, “what's my detention”, or “run the callback scenario”.")
            self.say(run_id, "no matching route · asked operator to rephrase", "warn")
            hub.emit_misc("chat", {"run_id": run_id, "role": "assistant", "text": reply})
            return {"reply": reply, "route": None}

        self.say(run_id, f"routing “{message[:48]}” → {route['name']} ({backend})", "ok",
                 route=route["name"])
        result = await self.dispatch(run_id, route["name"], route.get("args", {}))
        reply = result.get("reply", f"Ran {route['name']}.")
        hub.emit_misc("chat", {"run_id": run_id, "role": "assistant", "text": reply})
        return {"reply": reply, "route": route["name"], "result": result}

    async def _resolve_mc(self, ident: str) -> tuple[str, dict | None]:
        """Gemini sometimes hands screen_broker a posting id instead of an MC.
        Resolve it to the posting's broker AND keep the posting, because the
        callback cross-check needs the contact printed on the posting."""
        ident = ident.upper().replace(" ", "-").strip()
        if ident.startswith("MC"):
            return ident, None
        posting = await bank.get("board", ident)
        if posting:
            return posting["mc"], posting
        return ident, None

    def _keyword_route(self, msg: str) -> dict | None:
        m = msg.lower()
        mc = re.search(r"mc[-\s]?\d{4,7}", m)
        pid = re.search(r"\b[pf]-\d{4,6}b?\b", m)
        if "inject" in m or "armor" in m or "suspicious" in m:
            return {"name": "audit_injection", "args": {}}
        if "detention" in m or "waiting" in m or "sitting" in m or "dock" in m:
            if "scenario" in m or "run" in m or "demo" in m:
                return {"name": "run_scenario", "args": {"which": "detention"}}
            return {"name": "detention_status", "args": {}}
        if mc and ("screen" in m or "check" in m or "legit" in m or "verify" in m or "broker" in m):
            return {"name": "screen_broker", "args": {"mc": mc.group(0).upper().replace(" ", "-")}}
        if pid and ("book" in m or "take" in m):
            return {"name": "book_load", "args": {"posting_id": pid.group(0).upper()}}
        if pid and ("screen" in m or "check" in m or "verify" in m):
            return {"name": "screen_broker", "args": {"mc": pid.group(0).upper()}}
        if "callback" in m or "lookalike" in m or "impostor" in m:
            return {"name": "run_scenario", "args": {"which": "callback"}}
        if "clean" in m and ("scenario" in m or "run" in m):
            return {"name": "run_scenario", "args": {"which": "clean"}}
        if "ghost" in m or "double" in m or "fraud" in m or "shell" in m:
            return {"name": "run_scenario", "args": {"which": "ghost"}}
        if "scan" in m or "find" in m or "load" in m or "board" in m:
            return {"name": "scan_board", "args": {}}
        return None

    async def dispatch(self, run_id: str, name: str, args: dict) -> dict:
        # Fast routes resolve inline so the chat reply carries the result.
        if name == "scan_board":
            return await self.scan_board(run_id)
        if name == "screen_broker":
            mc, posting = await self._resolve_mc(args.get("mc", ""))
            g = await self.verifier.screen(run_id, mc, posting=posting)
            return {"reply": f"{g['broker']} ({g['mc']}): {g['verdict']} — {g['summary']}",
                    "verifier": g, "ghost": g}
        if name == "audit_injection":
            return await self.scenario_injection(run_id)
        if name == "detention_status":
            return await self.detention_status(run_id)
        # Long-running routes launch in the Runtime and stream to the trace;
        # the chat returns immediately rather than blocking for simulated days.
        if name == "book_load":
            pid = args["posting_id"]
            runs.launch(run_id, self.book_load(run_id, pid, args.get("rate")))
            return {"reply": f"Dispatching {pid} — Finder→Verifier→Closer→Payday now. "
                             f"Watch the live trace."}
        if name == "run_scenario":
            which = args.get("which", "clean")
            if which == "injection":
                return await self.scenario_injection(run_id)
            coro = {"ghost": self.scenario_ghost, "callback": self.scenario_callback,
                    "detention": self.scenario_detention}.get(which, self.scenario_clean)(run_id)
            runs.launch(run_id, coro)
            label = {"ghost": "shell-ring refusal",
                     "callback": "callback-mismatch interception",
                     "detention": "detention clock and claim"}.get(which, "clean end-to-end cycle")
            return {"reply": f"Running the {label} — watch the fleet hand off in the live trace."}
        return {"reply": f"Unknown route {name}."}

    # ---- orchestration --------------------------------------------------

    async def scan_board(self, run_id: str) -> dict:
        tenant = await bank.get("settings", "tenant")
        blacklist = await _blacklist()
        self.say(run_id, "event truck_empty_2h · run doc created · routing to Finder")
        await runs.beat()
        board = await self.finder.scan(run_id, tenant, blacklist)
        truck = board["truck"]
        await runs.beat()
        # Verifier screens every non-filler row so the desk shows a verdict per
        # row — and the callback check sees the contact on that exact posting.
        for m in board["all_rows"]:
            g = await self.verifier.screen(run_id, m["mc"], posting=m["posting"], quiet=True)
            m["ghost"] = {"verdict": g["verdict"], "score": g["score"], "failed": g["failed"],
                          "callback_mismatch": g["callback"].get("mismatch", False)}
        desk = await desk_snapshot(board, truck, tenant, len(board["postings"]))
        hub.emit_state(run_id, {"desk": desk})
        best = board["top"][0] if board["top"] else None
        reply = (f"Finder pulled {len(board['postings'])}, killed {board['kills']}, "
                 f"{len(board['survivors'])} survive. "
                 + (f"Best: {best['posting']['o']}→{best['posting']['d']} at ${best['rpm']:.2f}/mi, "
                    f"broker {best.get('ghost', {}).get('verdict', '?')}." if best else "No survivors."))
        if board.get("reasoning"):
            reply += f" {board['reasoning']}"
        return {"reply": reply, "desk": desk}

    async def book_load(self, run_id: str, posting_id: str, rate: int | None = None) -> dict:
        posting = await bank.get("board", posting_id)
        if not posting:
            return {"reply": f"No posting {posting_id} on the board."}
        broker = await bank.get("brokers", posting["mc"]) or {}
        g = await self.verifier.screen(run_id, posting["mc"], posting=posting)
        if g["verdict"] in ("REFUSE", "BLACKLISTED"):
            await self._refuse(run_id, posting["mc"], g)
            return {"reply": f"Refused {posting_id}: {g['summary']}", "ghost": g,
                    "verifier": g, "refused": True}

        route = await self.finder.call(run_id, "maps.route", origin=posting["o"], dest=posting["d"])
        miles = round(route.value["miles"])
        agreed = rate or posting.get("rate") or round(2.1 * miles)
        load = {"load_id": posting_id, "broker": broker.get("name", posting["mc"]),
                "mc": posting["mc"], "origin": posting["o"], "dest": posting["d"],
                "miles": miles, "eq": posting.get("eq", "Dry van"),
                "broker_email": broker.get("email", "dispatch@broker.example")}
        hs = await self.closer.negotiate(run_id, load, agreed)
        if hs.get("abandoned"):
            return {"reply": f"{load['broker']} never answered on {posting_id} after "
                             f"{hs['attempts']} attempts over {hs['waited_h']:g}h. "
                             f"Truck handed back to Finder.", "abandoned": True}
        await runs.beat()
        # broker returns its own rate con → Verifier screens + audits it
        rc = await self._make_broker_rc(run_id, hs["terms"])
        audit = await self.verifier.audit(run_id, posting_id, rc, injected=False)
        await runs.beat()
        await self.closer.run_trip(run_id, hs["terms"])
        pay_days = broker.get("avg_pay_days") or 19
        settle = await self.payday.settle(run_id, hs["terms"], pay_days=pay_days)
        return {"reply": f"Booked {posting_id}, hauled, "
                         + (f"paid day {settle['pay_days']} (${settle['invoice_total']:,.2f})."
                            if settle["paid"] else
                            f"unpaid — ${settle['invoice_total']:,.2f} sent to recourse.")
                         + " Written back to the graph.",
                "settle": settle, "audit": audit}

    async def detention_status(self, run_id: str) -> dict:
        doc = await bank.get("detention", "current")
        if not doc:
            return {"reply": "No detention clock running. The app starts one the moment "
                             "the driver hits ARRIVED at a dock."}
        owed = doc.get("owed", 0)
        mins = doc.get("minutes_on_site", 0)
        state = "still on site" if doc.get("active") else "closed out"
        reply = (f"{doc['posting_id']} at {doc['stop']}: {mins // 60}h{mins % 60:02d}m on site, "
                 f"${owed:,.2f} owed by {doc['broker']} ({state}, {doc['status']}).")
        self.say(run_id, reply, "warn" if owed else "ok")
        return {"reply": reply, "detention": doc}

    async def _make_broker_rc(self, run_id, terms, injected=False):
        # The broker's inbound rate con is sandbox-produced (no fleet agent owns
        # the broker), so it is generated directly rather than through an agent.
        from ..tools import docs
        rc = await docs.make_rate_con(load=terms, inject=injected)
        return rc.value["pdf"]

    async def _refuse(self, run_id, mc, screen=None):
        col = await bank.broker_collisions(mc)
        neighbors = list({x["_key"] for x in col["phone"] + col["ach"]})
        # an impostor caught by the callback check gets flagged too, even though
        # the MC it hid behind is legitimate
        impostors = [o["_key"] for o in ((screen or {}).get("callback", {}).get("owners") or [])]
        targets = ([mc] if not impostors else impostors) + neighbors
        bl = await blacklist_add(targets)
        self.verifier.say(run_id,
                          f"flagged {', '.join(targets[:3])}"
                          + (f" + {len(targets) - 3} more" if len(targets) > 3 else "")
                          + " → Finder pre-filter", "fail")
        self.say(run_id, "run halted before Closer · carrier warning drafted", "fail")
        return bl

    # ---- scenarios ------------------------------------------------------

    async def scenario_clean(self, run_id: str) -> dict:
        self.say(run_id, "scenario: clean run · CHI→CMH · Meridian Logistics")
        await self.scan_board(run_id)
        return await self.book_load(run_id, "P-90412")

    async def scenario_ghost(self, run_id: str) -> dict:
        self.say(run_id, "scenario: shell ring · Apex Freight Solutions")
        await self.scan_board(run_id)
        return await self.book_load(run_id, "P-90418")

    async def scenario_callback(self, run_id: str) -> dict:
        self.say(run_id, "scenario: callback mismatch · a load posted under Meridian's MC "
                         "with somebody else's phone number on it")
        return await self.book_load(run_id, "P-90431")

    async def scenario_detention(self, run_id: str) -> dict:
        """Truck sits on a dock at Cardinal Dispatch — the broker that denied
        three claims because nobody ever sent them a timestamped notice."""
        self.say(run_id, "scenario: detention · truck stuck at the Indianapolis dock")
        posting_id = "P-90428"
        posting = await bank.get("board", posting_id) or {}
        broker = await bank.get("brokers", posting.get("mc", "")) or {}
        from ..data.seed import coords_for_city
        dest = posting.get("d", "Indianapolis IN")
        lat, lng = coords_for_city(dest)
        await bank.put("locked_terms", posting_id, {
            "load_id": posting_id, "broker": broker.get("name", "the broker"),
            "mc": posting.get("mc"), "rate": posting.get("rate", 800),
            "miles": posting.get("mi", 205), "origin": posting.get("o", "Joliet IL"),
            "dest": dest, "eq": posting.get("eq", "Dry van"),
            "broker_email": broker.get("email", "dispatch@broker.example"),
            "detention_rate": 75.0, "free_hours": 2.0, "terms": "Net 30 / factoring OK"})
        await self.payday.watch_detention(run_id, posting_id, lat + 0.004, lng + 0.004)
        out = await self.payday.close_detention(run_id, posting_id, lat + 0.004, lng + 0.004)
        return {"reply": f"Detention claim filed: ${out.get('owed', 0):,.2f} on {posting_id}.",
                "detention": out}

    async def scenario_injection(self, run_id: str) -> dict:
        self.say(run_id, "scenario: prompt injection · Gmail attachment routed to Verifier")
        terms = {"load_id": "P-90311", "broker": "Bluegrass Carriers LLC",
                 "mc": "MC-990008", "origin": "Louisville KY", "dest": "Nashville TN",
                 "miles": 175, "rate": 950, "detention_rate": 75, "free_hours": 2,
                 "broker_email": "billing@bluegrass-carriers.example.co"}
        await bank.put("locked_terms", terms["load_id"], terms)
        rc = await self._make_broker_rc(run_id, terms, injected=True)
        await self.verifier.call(run_id, "mail.watch", expect="rate con PDF")
        audit = await self.verifier.audit(run_id, terms["load_id"], rc, injected=True)
        reply = ("Model Armor caught a white-on-white injected instruction on page 2 "
                 "before any model read the PDF. Quarantined; broker record untouched.")
        return {"reply": reply, "audit": audit}


async def desk_snapshot(board, truck, tenant, pulled) -> dict:
    """Flatten a Finder board result into the row shape the Desk UI renders."""
    blacklist = await _blacklist()
    rows = []
    for m in board["all_rows"]:
        p = m["posting"]
        broker = await bank.get("brokers", p["mc"]) or {}
        gv = m.get("ghost", {})
        rows.append({
            "id": p["id"], "mc": p["mc"], "broker": broker.get("name", p["mc"]),
            "src": p["src"], "origin": p["o"], "dest": p["d"], "eq": p.get("eq", "Dry van"),
            "rate": p.get("rate"), "posted_min": p.get("posted_min", 0),
            "miles": m["miles"], "deadhead": m["deadhead"], "rpm": m["rpm"],
            "lane_avg": m["lane_avg"], "fuel": m["fuel"], "fixed": m["fixed"],
            "net": m["net"], "drive_h": m["drive_h"], "kill": m["kill"], "hot": m["hot"],
            "ghost": gv, "verifier": gv, "blacklisted": p["mc"] in blacklist,
            "broker_email": broker.get("email"),
        })
    best_rpm = max((r["rpm"] for r in rows if not r["kill"]), default=0)
    return {"pulled": pulled, "kills": board["kills"], "survivors": len(board["survivors"]),
            "floor_rpm": tenant["floor_rpm"], "best_rpm": round(best_rpm, 2),
            "truck": truck, "detention": tenant["detention"], "rows": rows}
