"""Agent Runtime: long-running async execution. A run is a state machine that
survives for simulated days — stages advance on events (human action, geofence
hit, mail arrival) and on scheduled wakeups. Simulated time is compressed
(sim_seconds_per_hour) and every compression is disclosed in the trace."""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, Awaitable, Callable

from ..config import settings
from .memory import bank
from .observability import TraceEvent, hub

STAGES = ["Queued", "Dispatch", "In transit", "Delivered", "Invoiced", "Factored", "Paid"]


class RunManager:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        self._waiters: dict[str, asyncio.Event] = {}
        self._human_actions: dict[str, dict] = {}

    def new_run_id(self) -> str:
        return f"R-{uuid.uuid4().hex[:6].upper()}"

    async def create(self, kind: str, payload: dict[str, Any]) -> dict:
        run_id = self.new_run_id()
        run = {
            "run_id": run_id, "kind": kind, "created": time.time(),
            "stage": "running", "payload": payload, "status": {}, "result": None,
        }
        await bank.put("runs", run_id, run)
        return run

    def launch(self, run_id: str, coro: Awaitable) -> None:
        task = asyncio.create_task(self._guard(run_id, coro))
        self._tasks[run_id] = task

    async def _guard(self, run_id: str, coro: Awaitable) -> None:
        try:
            await coro
        except asyncio.CancelledError:
            hub.emit(TraceEvent(run_id=run_id, agent="Yard Boss", tone="warn",
                                msg="run cancelled by operator"))
        except Exception as e:  # surface crashes into the trace, never die silent
            hub.emit(TraceEvent(run_id=run_id, agent="Yard Boss", tone="fail",
                                msg=f"run crashed: {type(e).__name__}: {e}"))
            await bank.patch("runs", run_id, {"stage": "crashed"})

    def cancel(self, run_id: str) -> bool:
        task = self._tasks.get(run_id)
        if task and not task.done():
            task.cancel()
            return True
        return False

    # ---- simulated time -------------------------------------------------

    async def sleep_sim_hours(self, run_id: str, agent: str, hours: float, why: str) -> None:
        wall = hours * settings().sim_seconds_per_hour
        hub.emit(TraceEvent(
            run_id=run_id, agent=agent, kind="state", tone="ok",
            msg=f"wakeup scheduled +{hours:g}h ({why}) · compressed to {wall:.1f}s",
        ))
        await asyncio.sleep(wall)

    async def beat(self) -> None:
        """Small pacing delay so trace beats read on stage."""
        await asyncio.sleep(settings().trace_beat_delay)

    # ---- human-in-the-loop ----------------------------------------------

    async def await_human(self, run_id: str, prompt: dict) -> dict:
        """Park the run until the desk acts (book / counter / refuse)."""
        ev = asyncio.Event()
        self._waiters[run_id] = ev
        await bank.patch("runs", run_id, {"stage": "awaiting_human", "prompt": prompt})
        hub.emit_state(run_id, {"stage": "awaiting_human", "prompt": prompt})
        await ev.wait()
        await bank.patch("runs", run_id, {"stage": "running", "prompt": None})
        return self._human_actions.pop(run_id, {})

    def resolve_human(self, run_id: str, action: dict) -> bool:
        ev = self._waiters.pop(run_id, None)
        if ev is None:
            return False
        self._human_actions[run_id] = action
        ev.set()
        return True

    def pending_human(self, run_id: str) -> bool:
        return run_id in self._waiters


runs = RunManager()
