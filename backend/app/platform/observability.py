"""Agent Observability: every agent utterance, tool call, policy decision and
armor verdict lands here as a structured trace event, is persisted to an audit
log (JSONL), and is fanned out live to any number of SSE subscribers."""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field, asdict
from itertools import count
from typing import Any, AsyncIterator

from ..config import RUNTIME_DIR

_seq = count(1)


@dataclass
class TraceEvent:
    run_id: str
    agent: str            # agent ID: "FINDER", "VERIFIER", "Gateway", "Model Armor"
    msg: str
    agent_name: str = ""  # display name: "Finder", "Verifier", ... (defaults to id)
    tone: str = "ok"      # ok | pass | warn | fail | block | skip
    kind: str = "trace"   # trace | tool | policy | armor | state | chat | mail | doc
    tool: str | None = None
    backend: str | None = None   # live | sandbox | cached | template
    latency_ms: float | None = None
    data: dict[str, Any] | None = None
    ts: float = field(default_factory=time.time)
    seq: int = field(default_factory=lambda: next(_seq))

    def __post_init__(self) -> None:
        # infrastructure emitters (Gateway, Gmail, Model Armor) have no separate
        # display name — never ship an empty label to the UI
        if not self.agent_name:
            self.agent_name = self.agent

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["clock"] = time.strftime("%H:%M:%S", time.localtime(self.ts))
        return d


class TraceHub:
    """In-process pub/sub for trace + state events, with a bounded replay buffer
    so a page refresh mid-demo still shows the whole run."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()
        self._buffer: list[dict[str, Any]] = []
        self._buffer_max = 4000
        self._audit_path = RUNTIME_DIR / "audit.jsonl"

    def emit(self, event: TraceEvent) -> dict[str, Any]:
        payload = {"type": "trace", **event.to_dict()}
        self._push(payload)
        return payload

    def emit_state(self, run_id: str, state: dict[str, Any]) -> None:
        """Push a full or partial run-state snapshot (drives the UI panels)."""
        self._push({"type": "state", "run_id": run_id, "state": state,
                    "ts": time.time(), "seq": next(_seq)})

    def emit_misc(self, type_: str, data: dict[str, Any]) -> None:
        self._push({"type": type_, **data, "ts": time.time(), "seq": next(_seq)})

    def _push(self, payload: dict[str, Any]) -> None:
        self._buffer.append(payload)
        if len(self._buffer) > self._buffer_max:
            self._buffer = self._buffer[-self._buffer_max:]
        try:
            with self._audit_path.open("a") as f:
                f.write(json.dumps(payload, default=str) + "\n")
        except OSError:
            pass
        dead = []
        for q in self._subscribers:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._subscribers.discard(q)

    def replay(self, run_id: str | None = None, limit: int = 400) -> list[dict[str, Any]]:
        events = self._buffer
        if run_id:
            events = [e for e in events if e.get("run_id") == run_id]
        return events[-limit:]

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        self._subscribers.add(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subscribers.discard(q)


hub = TraceHub()
