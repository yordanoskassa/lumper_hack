"""HTTP + SSE surface. The frontend talks only to these endpoints; every
interesting thing that happens is also streamed on /api/stream as trace/state
events, which is what makes the fleet legible on stage."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse

from .agents.ghost import _blacklist, blacklist_add
from .agents.yardboss import YardBoss, desk_snapshot
from .data import seed
from .platform.memory import bank
from .platform.observability import TraceEvent, hub
from .platform.registry import cards
from .platform.runtime import runs

router = APIRouter(prefix="/api")
_boss: YardBoss | None = None
_chat_history: list[dict] = []


def boss() -> YardBoss:
    global _boss
    if _boss is None:
        _boss = YardBoss()
    return _boss


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
    result = await boss().chat(run_id, message, _chat_history[-8:])
    _chat_history.append({"role": "user", "text": message})
    _chat_history.append({"role": "model", "text": result["reply"]})
    return {"run_id": run_id, **result}


@router.post("/scan")
async def scan():
    run_id = runs.new_run_id()
    result = await boss().scan_board(run_id)
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
    board = await boss().margin.evaluate_board(
        run_id, postings, tenant_doc["truck"], tenant_doc["floor_rpm"], blacklist)
    for m in board["all_rows"]:
        g = await boss().ghost.screen(run_id, m["mc"], quiet=True)
        m["ghost"] = {"verdict": g["verdict"], "score": g["score"], "failed": g["failed"]}
    snap = await desk_snapshot(board, tenant_doc["truck"], tenant_doc, len(postings))
    return snap


@router.post("/screen")
async def screen(body: dict = Body(...)):
    run_id = body.get("run_id") or runs.new_run_id()
    g = await boss().ghost.screen(run_id, body["mc"])
    return {"run_id": run_id, "ghost": g}


@router.post("/book")
async def book(body: dict = Body(...)):
    posting_id = body["posting_id"]
    rate = body.get("rate")
    run = await runs.create("book", {"posting_id": posting_id})
    run_id = run["run_id"]
    runs.launch(run_id, boss().book_load(run_id, posting_id, rate))
    return {"run_id": run_id, "started": True}


@router.post("/refuse")
async def refuse(body: dict = Body(...)):
    run_id = body.get("run_id") or runs.new_run_id()
    mc = body["mc"]
    bl = await boss()._refuse(run_id, mc)
    return {"run_id": run_id, "blacklist": bl}


@router.post("/scenario")
async def scenario(body: dict = Body(...)):
    which = body.get("which", "clean")
    run = await runs.create("scenario", {"which": which})
    run_id = run["run_id"]
    coro = {"ghost": boss().scenario_ghost, "injection": boss().scenario_injection}.get(
        which, boss().scenario_clean)(run_id)
    runs.launch(run_id, coro)
    return {"run_id": run_id, "started": True, "which": which}


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
    _chat_history.clear()
    hub.emit(TraceEvent(run_id="system", agent="Yard Boss",
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
