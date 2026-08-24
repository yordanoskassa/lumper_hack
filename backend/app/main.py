"""Lumper Sentinel — Fortified Enterprise Fleet demo backend."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import tools  # noqa: F401  (registers every tool with the Gateway)
from .config import settings
from .data import seed
from .platform import registry
from .platform.memory import bank
from .platform.observability import TraceEvent, hub
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    registry.bootstrap()
    driver = await bank.connect()
    seeded = await seed.load(bank)
    s = settings()
    live = [n for n, on in (("Gemini", s.has_gemini), ("Maps", s.has_maps),
                            ("EIA", s.has_eia), ("FMCSA", s.has_fmcsa)) if on]
    hub.emit(TraceEvent(
        run_id="system", agent="YARD BOSS", agent_name="Yard Boss",
        msg=(f"fleet online · {len(registry.REGISTRY) - 1} specialists + orchestrator · "
             f"Memory Bank: {driver} · live integrations: {', '.join(live) or 'none (labeled fallbacks)'}"
             + (" · sandbox seeded" if seeded else "")),
    ))
    yield


app = FastAPI(title="Lumper Sentinel", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.get("/api")
async def index():
    return {"service": "Lumper Sentinel", "track": "Fortified Enterprise Fleet"}
