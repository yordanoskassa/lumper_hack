"""Yard Boss — the orchestrator and the chat you talk to. It routes events and
natural-language commands (Gemini function calling, keyword fallback with no
key) to the right agent, holds run state, and narrates the handoff chain. It is
the one agent a human addresses directly; the rest it dispatches."""
from __future__ import annotations

import re

from .base import Agent
from .fineprint import FinePrint
from .ghost import Ghost, blacklist_add, _blacklist
from .handshake import Handshake
from .margin import Margin
from .milemarker import MileMarker
from .payday import Payday
from .scout import Scout
from ..platform.memory import bank
from ..platform.observability import hub
from ..platform.runtime import runs
from ..tools import llm

ROUTES = [
    {"name": "scan_board",
     "description": "Scan the load board for the truck: Scout pulls postings, Margin does the money math, Ghost screens the survivors. Use for 'find loads', 'scan the board', 'what's available'.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "screen_broker",
     "description": "Run Ghost fraud screening on one broker MC number. Use for 'screen MC-1687203', 'is this broker legit', 'check this broker'.",
     "parameters": {"type": "object", "properties": {"mc": {"type": "string", "description": "the MC number, e.g. MC-1687203"}}, "required": ["mc"]}},
    {"name": "book_load",
     "description": "Book a specific posting end to end: screen, negotiate, audit the rate con, run the trip, get paid. Use for 'book P-90412', 'take the Columbus load'.",
     "parameters": {"type": "object", "properties": {"posting_id": {"type": "string"}, "rate": {"type": "integer", "description": "agreed rate if the human named one"}}, "required": ["posting_id"]}},
    {"name": "audit_injection",
     "description": "Audit an incoming broker rate-con PDF that contains a hidden prompt-injection attack, to demonstrate Model Armor blocking it inline. Use for 'show the injection', 'test model armor', 'the suspicious PDF'.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "run_scenario",
     "description": "Run a full pre-scripted end-to-end scenario. 'clean' = clean load booked/hauled/paid; 'ghost' = double-brokering caught and refused; 'injection' = prompt injection blocked.",
     "parameters": {"type": "object", "properties": {"which": {"type": "string", "enum": ["clean", "ghost", "injection"]}}, "required": ["which"]}},
]

SYSTEM = ("You are Yard Boss, the orchestrator of an autonomous freight desk with a "
          "fleet of specialist agents (Scout, Margin, Ghost, Handshake, Fine Print, "
          "Mile Marker, Payday). Route the operator's request to exactly one tool. "
          "Be terse.")


class YardBoss(Agent):
    key = "YARD"

    def __init__(self) -> None:
        super().__init__()
        self.scout = Scout()
        self.margin = Margin()
        self.ghost = Ghost()
        self.handshake = Handshake()
        self.fineprint = FinePrint()
        self.milemarker = MileMarker()
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
            reply = ("I route freight ops. Try: “scan the board”, “screen MC-1687203”, "
                     "“book P-90412”, or “run the injection scenario”.")
            self.say(run_id, "no matching route · asked operator to rephrase", "warn")
            hub.emit_misc("chat", {"run_id": run_id, "role": "assistant", "text": reply})
            return {"reply": reply, "route": None}

        self.say(run_id, f"routing “{message[:48]}” → {route['name']} ({backend})", "ok",
                 route=route["name"])
        result = await self.dispatch(run_id, route["name"], route.get("args", {}))
        reply = result.get("reply", f"Ran {route['name']}.")
        hub.emit_misc("chat", {"run_id": run_id, "role": "assistant", "text": reply})
        return {"reply": reply, "route": route["name"], "result": result}

    async def _resolve_mc(self, ident: str) -> str:
        """Gemini sometimes hands screen_broker a posting id instead of an MC —
        resolve it to the posting's broker so we screen a real record."""
        ident = ident.upper().replace(" ", "-").strip()
        if ident.startswith("MC"):
            return ident
        posting = await bank.get("board", ident)
        if posting:
            return posting["mc"]
        return ident

    def _keyword_route(self, msg: str) -> dict | None:
        m = msg.lower()
        mc = re.search(r"mc[-\s]?\d{4,7}", m)
        pid = re.search(r"\b[pf]-\d{4,6}b?\b", m)
        if "inject" in m or "armor" in m or "suspicious" in m:
            return {"name": "audit_injection", "args": {}}
        if mc and ("screen" in m or "check" in m or "legit" in m or "ghost" in m or "broker" in m):
            return {"name": "screen_broker", "args": {"mc": mc.group(0).upper().replace(" ", "-")}}
        if pid and ("book" in m or "take" in m):
            return {"name": "book_load", "args": {"posting_id": pid.group(0).upper()}}
        if "clean" in m and ("scenario" in m or "run" in m):
            return {"name": "run_scenario", "args": {"which": "clean"}}
        if "ghost" in m or "double" in m or "fraud" in m:
            return {"name": "run_scenario", "args": {"which": "ghost"}}
        if "scan" in m or "find" in m or "load" in m or "board" in m:
            return {"name": "scan_board", "args": {}}
        return None

    async def dispatch(self, run_id: str, name: str, args: dict) -> dict:
        # Fast routes resolve inline so the chat reply carries the result.
        if name == "scan_board":
            return await self.scan_board(run_id)
        if name == "screen_broker":
            mc = await self._resolve_mc(args.get("mc", ""))
            g = await self.ghost.screen(run_id, mc)
            return {"reply": f"{g['broker']} ({g['mc']}): {g['verdict']} — {g['summary']}",
                    "ghost": g}
        if name == "audit_injection":
            return await self.scenario_injection(run_id)
        # Long-running routes launch in the Runtime and stream to the trace;
        # the chat returns immediately rather than blocking for simulated days.
        if name == "book_load":
            pid = args["posting_id"]
            runs.launch(run_id, self.book_load(run_id, pid, args.get("rate")))
            return {"reply": f"Dispatching {pid} — Scout→Margin→Ghost→Handshake→"
                             f"Fine Print→Mile Marker→Payday now. Watch the live trace."}
        if name == "run_scenario":
            which = args.get("which", "clean")
            if which == "injection":
                return await self.scenario_injection(run_id)
            coro = self.scenario_ghost(run_id) if which == "ghost" else self.scenario_clean(run_id)
            runs.launch(run_id, coro)
            label = "double-brokering refusal" if which == "ghost" else "clean end-to-end cycle"
            return {"reply": f"Running the {label} — watch the fleet hand off in the live trace."}
        return {"reply": f"Unknown route {name}."}

    # ---- orchestration --------------------------------------------------

    async def scan_board(self, run_id: str) -> dict:
        tenant = await bank.get("settings", "tenant")
        blacklist = await _blacklist()
        self.say(run_id, "event truck_empty_2h · run doc created · routing to Scout")
        await runs.beat()
        hunt = await self.scout.hunt(run_id, blacklist)
        await runs.beat()
        board = await self.margin.evaluate_board(
            run_id, hunt["postings"], hunt["truck"], tenant["floor_rpm"], blacklist)
        await runs.beat()
        # Ghost screens every non-filler survivor so the desk shows a verdict per row
        for m in board["all_rows"]:
            g = await self.ghost.screen(run_id, m["mc"], quiet=True)
            m["ghost"] = {"verdict": g["verdict"], "score": g["score"], "failed": g["failed"]}
        desk = await desk_snapshot(board, hunt["truck"], tenant, len(hunt["postings"]))
        hub.emit_state(run_id, {"desk": desk})
        best = board["top"][0] if board["top"] else None
        reply = (f"Scout pulled {len(hunt['postings'])}, Margin killed {board['kills']}, "
                 f"{len(board['survivors'])} survive. "
                 + (f"Best: {best['posting']['o']}→{best['posting']['d']} at ${best['rpm']:.2f}/mi, "
                    f"broker {best.get('ghost', {}).get('verdict', '?')}." if best else "No survivors."))
        return {"reply": reply, "desk": desk}

    async def book_load(self, run_id: str, posting_id: str, rate: int | None = None) -> dict:
        posting = await bank.get("board", posting_id)
        if not posting:
            return {"reply": f"No posting {posting_id} on the board."}
        broker = await bank.get("brokers", posting["mc"]) or {}
        g = await self.ghost.screen(run_id, posting["mc"])
        if g["verdict"] in ("REFUSE", "BLACKLISTED"):
            await self._refuse(run_id, posting["mc"])
            return {"reply": f"Refused {posting_id}: {g['summary']}", "ghost": g, "refused": True}

        route = await self.margin.call(run_id, "maps.route", origin=posting["o"], dest=posting["d"])
        miles = round(route.value["miles"])
        agreed = rate or posting.get("rate") or round(2.1 * miles)
        load = {"load_id": posting_id, "broker": broker.get("name", posting["mc"]),
                "mc": posting["mc"], "origin": posting["o"], "dest": posting["d"],
                "miles": miles, "eq": posting.get("eq", "Dry van"),
                "broker_email": broker.get("email", "dispatch@broker.example")}
        hs = await self.handshake.negotiate(run_id, load, agreed)
        await runs.beat()
        # broker returns its own rate con → Fine Print screens + audits it
        rc = await self._make_broker_rc(run_id, hs["terms"])
        audit = await self.fineprint.audit(run_id, posting_id, rc, injected=False)
        await runs.beat()
        await self.milemarker.run_trip(run_id, hs["terms"])
        pay_days = broker.get("avg_pay_days") or 19
        settle = await self.payday.settle(run_id, hs["terms"], pay_days=pay_days)
        await bank.patch("runs", run_id, {"stage": "paid"})
        return {"reply": f"Booked {posting_id}, hauled, paid day {settle['pay_days']} "
                         f"(${settle['invoice_total']:,}). Written back to the graph.",
                "settle": settle, "audit": audit}

    async def _make_broker_rc(self, run_id, terms, injected=False):
        # The broker's inbound rate con is sandbox-produced (no fleet agent owns
        # the broker), so it is generated directly rather than through an agent.
        from ..tools import docs
        rc = await docs.make_rate_con(load=terms, inject=injected)
        return rc.value["pdf"]

    async def _refuse(self, run_id, mc):
        col = await bank.broker_collisions(mc)
        neighbors = list({x["_key"] for x in col["phone"] + col["ach"]})
        bl = await blacklist_add([mc] + neighbors)
        self.ghost.say(run_id,
                       f"flagged {mc}" + (f" + {len(neighbors)} graph neighbour(s)" if neighbors else "")
                       + " → Scout pre-filter", "fail")
        self.say(run_id, "run halted before Handshake · carrier warning drafted", "fail")
        return bl

    # ---- scenarios ------------------------------------------------------

    async def scenario_clean(self, run_id: str) -> dict:
        self.say(run_id, "scenario: clean run · CHI→CMH · Meridian Logistics")
        await self.scan_board(run_id)
        return await self.book_load(run_id, "P-90412")

    async def scenario_ghost(self, run_id: str) -> dict:
        self.say(run_id, "scenario: double-brokering · Apex Freight Solutions")
        await self.scan_board(run_id)
        return await self.book_load(run_id, "P-90418")

    async def scenario_injection(self, run_id: str) -> dict:
        self.say(run_id, "scenario: prompt injection · Gmail attachment routed to Fine Print")
        terms = {"load_id": "P-90311", "broker": "Bluegrass Carriers LLC",
                 "mc": "MC-990100", "origin": "Louisville KY", "dest": "Nashville TN",
                 "miles": 175, "rate": 950, "detention_rate": 75, "free_hours": 2,
                 "broker_email": "billing@bluegrass-carriers.example.co"}
        await bank.put("locked_terms", terms["load_id"], terms)
        rc = await self._make_broker_rc(run_id, terms, injected=True)
        await self.fineprint.call(run_id, "mail.watch", expect="rate con PDF")
        audit = await self.fineprint.audit(run_id, terms["load_id"], rc, injected=True)
        reply = ("Model Armor caught a white-on-white injected instruction on page 2 "
                 "before any model read the PDF. Quarantined; broker record untouched.")
        return {"reply": reply, "audit": audit}

async def desk_snapshot(board, truck, tenant, pulled) -> dict:
    """Flatten a Margin board result into the row shape the Desk UI renders."""
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
            "ghost": gv, "blacklisted": p["mc"] in blacklist,
            "broker_email": broker.get("email"),
        })
    best_rpm = max((r["rpm"] for r in rows if not r["kill"]), default=0)
    return {"pulled": pulled, "kills": board["kills"], "survivors": len(board["survivors"]),
            "floor_rpm": tenant["floor_rpm"], "best_rpm": round(best_rpm, 2),
            "truck": truck, "detention": tenant["detention"], "rows": rows}
