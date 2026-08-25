"""HTTP + SSE surface. Two consumers: the web console (desk, chat, registry,
live trace) and the driver's phone (`/api/loads`, `/api/arrive`, `/api/pod`,
`/api/depart`, `/api/detention`). Everything interesting that happens is also
streamed on /api/stream as trace/state events, which is what makes the fleet
legible on stage.

The phone endpoints speak plain English on purpose: a driver reading a load
card should never meet an acronym, and the reasons a load was blocked have to
make sense to someone who has never heard of double-brokering."""
from __future__ import annotations

import json

from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse

from .agents.verifier import _blacklist
from .agents.dispatch import Dispatch, desk_snapshot
from .data import seed
from .data.seed import coords_for_city
from .platform.memory import bank
from .platform.observability import TraceEvent, hub
from .platform.registry import cards
from .platform.runtime import runs

router = APIRouter(prefix="/api")
_dispatch: Dispatch | None = None
_chat_history: list[dict] = []


def dispatch() -> Dispatch:
    global _dispatch
    if _dispatch is None:
        _dispatch = Dispatch()
    return _dispatch


@router.get("/health")
async def health():
    from .config import settings
    s = settings()
    return {"ok": True, "memory": bank.driver,
            "integrations": {"gemini": s.has_gemini, "maps": s.has_maps,
                             "eia": s.has_eia, "fmcsa": s.has_fmcsa,
                             "loadboard": s.loadboard_adapter},
            "model": s.gemini_model}


@router.get("/registry")
async def registry():
    return {"agents": cards()}


@router.get("/tenant")
async def tenant():
    t = await bank.get("settings", "tenant")
    bl = await _blacklist()
    brokers = await bank.all("brokers")
    lanes = await bank.all("lanes")
    unpaid = sum(b.get("unpaid", 0) for b in brokers)
    shared_ach: dict[str, int] = {}
    for b in brokers:
        if b.get("ach"):
            shared_ach[b["ach"]] = shared_ach.get(b["ach"], 0) + 1
    return {"tenant": t, "blacklist": sorted(bl),
            "graph": {"brokers": len(brokers), "lanes": len(lanes),
                      "flagged": len(bl), "unpaid": unpaid,
                      "shared_ach_nodes": sum(1 for v in shared_ach.values() if v > 1)}}


@router.post("/chat")
async def chat(body: dict = Body(...)):
    message = body.get("message", "")
    run_id = body.get("run_id") or runs.new_run_id()
    result = await dispatch().chat(run_id, message, _chat_history[-8:])
    _chat_history.append({"role": "user", "text": message})
    _chat_history.append({"role": "model", "text": result["reply"]})
    return {"run_id": run_id, **result}


@router.post("/scan")
async def scan():
    run_id = runs.new_run_id()
    result = await dispatch().scan_board(run_id)
    return {"run_id": run_id, **result}


@router.get("/desk")
async def desk():
    """Recompute the desk board synchronously (no trace spam) for initial load."""
    tenant_doc = await bank.get("settings", "tenant")
    blacklist = await _blacklist()
    run_id = "desk-init"
    from .tools.loadboards import adapter
    postings = await adapter().search(tenant_doc["truck"]["city"])
    postings = [p for p in postings if p["mc"] not in blacklist]
    board = await dispatch().finder.evaluate_board(
        run_id, postings, tenant_doc["truck"], tenant_doc["floor_rpm"], blacklist)
    for m in board["all_rows"]:
        g = await dispatch().verifier.screen(run_id, m["mc"], posting=m["posting"], quiet=True)
        m["ghost"] = {"verdict": g["verdict"], "score": g["score"], "failed": g["failed"],
                      "callback_mismatch": g["callback"].get("mismatch", False)}
    snap = await desk_snapshot(board, tenant_doc["truck"], tenant_doc, len(postings))
    return snap


@router.post("/screen")
async def screen(body: dict = Body(...)):
    run_id = body.get("run_id") or runs.new_run_id()
    mc, posting = await dispatch()._resolve_mc(body["mc"])
    g = await dispatch().verifier.screen(run_id, mc, posting=posting)
    return {"run_id": run_id, "ghost": g, "verifier": g}


@router.post("/book")
async def book(body: dict = Body(...)):
    posting_id = body["posting_id"]
    rate = body.get("rate")
    run = await runs.create("book", {"posting_id": posting_id})
    run_id = run["run_id"]
    runs.launch(run_id, dispatch().book_load(run_id, posting_id, rate))
    return {"run_id": run_id, "started": True}


@router.post("/refuse")
async def refuse(body: dict = Body(...)):
    run_id = body.get("run_id") or runs.new_run_id()
    mc = body["mc"]
    bl = await dispatch()._refuse(run_id, mc)
    return {"run_id": run_id, "blacklist": bl}


@router.post("/scenario")
async def scenario(body: dict = Body(...)):
    which = body.get("which", "clean")
    run = await runs.create("scenario", {"which": which})
    run_id = run["run_id"]
    b = dispatch()
    coro = {"ghost": b.scenario_ghost, "injection": b.scenario_injection,
            "callback": b.scenario_callback,
            "detention": b.scenario_detention}.get(which, b.scenario_clean)(run_id)
    runs.launch(run_id, coro)
    return {"run_id": run_id, "started": True, "which": which}


# ======================= the driver's phone =============================

@router.get("/loads")
async def loads():
    """Driver-shaped board: what it pays after fuel, and whether to trust it.
    Blocked loads are returned too — the point of the app is watching one get
    stopped, not quietly hiding it."""
    tenant_doc = await bank.get("settings", "tenant")
    truck = tenant_doc["truck"]
    blacklist = await _blacklist()
    from .tools.loadboards import adapter
    postings = [p for p in await adapter().search(truck["city"]) if not p.get("filler")]
    board = await dispatch().finder.evaluate_board(
        "driver-app", postings, truck, tenant_doc["floor_rpm"], set(), verbose=False)

    claims = await bank.all("detention_claims")
    out: list[dict] = []
    for m in board["all_rows"]:
        p = m["posting"]
        # dupes and "call for rate" postings are noise on a phone
        if p.get("dup_of") or not p.get("rate"):
            continue
        broker = await bank.get("brokers", p["mc"]) or {}
        g = await dispatch().verifier.screen("driver-app", p["mc"], posting=p, silent=True)
        verdict, risk = _driver_verdict(g, p["mc"] in blacklist)
        # a load that doesn't clear the floor is not a load; it only stays on
        # the phone if it is here to be shown getting stopped
        if m["kill"] and verdict != "BLOCKED":
            continue
        o_lat, o_lng = coords_for_city(p["o"])
        d_lat, d_lng = coords_for_city(p["d"])
        row = {
            "id": p["id"], "broker": broker.get("name", p["mc"]), "mc": p["mc"],
            "origin": p["o"], "origin_lat": o_lat, "origin_lng": o_lng,
            "dest": p["d"], "dest_lat": d_lat, "dest_lng": d_lng,
            "rate": p["rate"], "miles": m["miles"], "rpm": m["rpm"],
            "net": m["net"], "deadhead": m["deadhead"], "eq": p.get("eq", "Dry van"),
            "drive_h": m["drive_h"], "lane_avg": round(m["lane_avg"], 2),
            "verdict": verdict, "risk": risk, "blocked": verdict == "BLOCKED",
            "reasons": _driver_reasons(m, g, broker, verdict, tenant_doc),
        }
        owed = round(sum(float(c.get("owed", 0) or 0) for c in claims
                         if c.get("mc") == p["mc"] and not c.get("paid")), 2)
        if owed:
            row["detention_owed"] = owed
        out.append(row)

    out.sort(key=lambda r: (r["blocked"], -r["net"]))
    return {"truck": {"city": truck["city"], "lat": truck["lat"], "lng": truck["lon"],
                      "driver": truck["driver"]},
            "loads": out}


@router.post("/arrive")
async def arrive(body: dict = Body(...)):
    """Driver hit ARRIVED at a dock. Payday arms the detention clock."""
    posting_id = body["posting_id"]
    run = await runs.create("detention", {"posting_id": posting_id})
    run_id = run["run_id"]
    runs.launch(run_id, dispatch().payday.watch_detention(
        run_id, posting_id, float(body["lat"]), float(body["lng"])))
    return {"run_id": run_id, "started": True}


@router.post("/depart")
async def depart(body: dict = Body(...)):
    """Driver rolled off the property. Close the clock, total it, file it."""
    posting_id = body["posting_id"]
    run_id = body.get("run_id") or runs.new_run_id()
    out = await dispatch().payday.close_detention(
        run_id, posting_id, float(body["lat"]), float(body["lng"]))
    if out.get("error"):
        return {"run_id": run_id, "minutes_on_site": 0, "billable_minutes": 0,
                "owed": 0.0, "claim_filed": False, "error": out["error"]}
    return out


@router.get("/detention")
async def detention():
    doc = await bank.get("detention", "current")
    if not doc:
        return {"active": False}
    return {
        "active": bool(doc.get("active")), "posting_id": doc.get("posting_id"),
        "stop": doc.get("stop"), "broker": doc.get("broker"),
        "arrived_at": doc.get("arrived_at"), "departed_at": doc.get("departed_at"),
        "free_minutes": doc.get("free_minutes", 120),
        "minutes_on_site": doc.get("minutes_on_site", 0),
        "billable_minutes": doc.get("billable_minutes", 0),
        "rate_per_hour": doc.get("rate_per_hour", 75.0),
        "owed": doc.get("owed", 0.0), "notice_sent": bool(doc.get("notice_sent")),
        "status": doc.get("status", "WAITING"),
        "timeline": doc.get("timeline", []),
    }


@router.post("/pod")
async def pod(body: dict = Body(...)):
    """Proof of delivery off the phone. Payday checks the photo's GPS against
    the load's delivery point before anything reaches an invoice."""
    posting_id = body["posting_id"]
    run = await runs.create("pod", {"posting_id": posting_id})
    run_id = run["run_id"]
    runs.launch(run_id, _pod_flow(run_id, posting_id, body.get("image_b64", ""),
                                 float(body.get("lat", 0)), float(body.get("lng", 0))))
    return {"run_id": run_id, "started": True}


async def _pod_flow(run_id: str, posting_id: str, image_b64: str,
                    lat: float, lng: float) -> dict:
    terms = await bank.get("locked_terms", posting_id)
    if not terms:
        # POD can arrive for a load this process never booked (the phone is the
        # source of truth on the road) — rebuild the terms from the board.
        posting = await bank.get("board", posting_id) or {}
        broker = await bank.get("brokers", posting.get("mc", "")) or {}
        det = (await bank.get("settings", "tenant"))["detention"]
        terms = {"load_id": posting_id, "broker": broker.get("name", posting.get("mc", "broker")),
                 "mc": posting.get("mc", ""), "rate": posting.get("rate") or 0,
                 "miles": posting.get("mi", 0), "origin": posting.get("o", "Joliet IL"),
                 "dest": posting.get("d", "Columbus OH"), "eq": posting.get("eq", "Dry van"),
                 "broker_email": broker.get("email", "dispatch@broker.example"),
                 "detention_rate": det["rate_per_hour"], "free_hours": det["free_hours"],
                 "terms": "Net 30 / factoring OK"}
        await bank.put("locked_terms", posting_id, terms)
    pd = dispatch().payday
    await pd.capture_pod(run_id, terms, image_b64, lat, lng)
    broker = await bank.get("brokers", terms["mc"]) or {}
    return await pd.settle(run_id, terms, pay_days=broker.get("avg_pay_days") or 19,
                           chase_pod=False)


# ---- driver-facing wording ---------------------------------------------

def _weeks(days: int) -> str:
    if days <= 1:
        return "yesterday"
    if days < 14:
        return f"{days} days ago"
    if days < 45:
        return f"{round(days / 7)} weeks ago"
    return f"{round(days / 30)} months ago"


def _driver_verdict(g: dict, blacklisted: bool) -> tuple[str, int]:
    v = g["verdict"]
    if blacklisted or v in ("REFUSE", "BLACKLISTED"):
        return "BLOCKED", g["score"]
    return ("REVIEW" if v == "REVIEW" else "CLEAR"), g["score"]


def _driver_reasons(m: dict, g: dict, broker: dict, verdict: str,
                    tenant_doc: dict) -> list[str]:
    """Two to four short lines a non-trucker understands. No acronyms, no
    industry words — 'per mile after fuel', not 'RPM'."""
    r: list[str] = []
    cb = g.get("callback", {})
    mems = g.get("memories", [])

    money = next((x for x in mems if x["kind"] == "unpaid" and x.get("amount")), None)
    ring = next((x for x in mems if x["kind"] == "shell_ring"), None)

    if verdict == "BLOCKED":
        if cb.get("mismatch"):
            r.append("The phone number on this load isn't the one this company registered")
            owners = cb.get("owners") or []
            if owners:
                r.append(f"It belongs to a business set up {owners[0].get('domain_age_days', 0)} "
                         f"days ago")
        # keep the last slot for the thing that actually lands: the money
        room = 3 if (money or ring) else 4
        for c in g.get("checks", []):
            if len(r) >= room:
                break
            if c["skipped"] or c["ok"]:
                continue
            if c["key"] == "authority":
                d = broker.get("authority_age_days")
                r.append(f"Only licensed to broker freight {d} days ago" if d
                         else "Not licensed to broker freight")
            elif c["key"] == "insurance":
                r.append("No insurance on file")
            elif c["key"] == "oos":
                r.append("Regulators have ordered them to stop operating")
            elif c["key"] == "domain":
                r.append("Their website was registered a few weeks ago")
            elif c["key"] == "phone":
                r.append("Another company is using the same phone number")
            elif c["key"] == "ach":
                r.append("Their bank account is shared with other companies")
        if money and money.get("mc") == g["mc"]:
            r.append(f"They already took ${money['amount']:,.0f} off you "
                     f"{_weeks(money.get('days_ago', 0))} and never paid")
        elif money:
            r.append(f"Shares a bank account with a company that never paid you "
                     f"${money['amount']:,.0f}")
        elif ring:
            r.append("Tied to a company that took a load from us and went quiet")
        return r[:4] or ["Too many warning signs — not worth the risk"]

    if broker.get("prior_loads"):
        r.append(f"Real company, {broker['prior_loads']} loads with us")
    else:
        r.append("We haven't hauled for them before")
    if broker.get("avg_pay_days"):
        r.append(f"Pays in {broker['avg_pay_days']} days")
    if m["net"]:
        r.append(f"Clears ${m['net']:,} after fuel and truck costs")
    if verdict == "REVIEW":
        denied = broker.get("detention_denied", 0)
        if denied:
            r.insert(0, f"They fought {denied} waiting-time claims — "
                        f"hit ARRIVED the second you're on their property")
        elif broker.get("avg_pay_days", 0) > 45:
            r.insert(0, "Slow to pay — expect to wait")
    if m["kill"]:
        r.append(f"Below your ${tenant_doc['floor_rpm']:.2f} a mile floor after fuel")
    return r[:4]


# ======================= console plumbing ===============================

@router.get("/runs")
async def list_runs():
    r = await bank.all("runs")
    r.sort(key=lambda x: x.get("created", 0), reverse=True)
    return {"runs": r[:20]}


@router.get("/outbox")
async def outbox():
    msgs = await bank.all("outbox")
    msgs.sort(key=lambda m: m.get("ts", 0))
    return {"messages": msgs}


@router.get("/quarantine")
async def quarantine():
    return {"items": await bank.all("quarantine")}


@router.post("/reset")
async def reset():
    await seed.load(bank, force=True)
    await bank.clear("locked_terms")
    await bank.clear("outbox")
    await bank.clear("quarantine")
    await bank.clear("detention")
    _chat_history.clear()
    hub.emit(TraceEvent(run_id="system", agent="DISPATCH", agent_name="Dispatch",
                        msg="desk reset · sandbox reseeded · graph restored"))
    return {"ok": True}


@router.get("/trace")
async def trace(run_id: str | None = None):
    return {"events": hub.replay(run_id)}


@router.get("/stream")
async def stream():
    async def gen():
        # replay recent buffer so a fresh page paints immediately
        for ev in hub.replay(limit=200):
            yield f"data: {json.dumps(ev, default=str)}\n\n"
        async for ev in hub.subscribe():
            yield f"data: {json.dumps(ev, default=str)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
