"""Agent Gateway: the single choke point every tool invocation passes through.
Order of operations on each call:
  1. Identity — verify the agent's token signature/expiry and required scope.
  2. Policy — registry is the source of truth for who may call what.
  3. Invoke — run the tool, timing it.
  4. Observe — trace the call with its backend label (live/sandbox/cached).
Denied calls are traced too; that's the audit trail."""
from __future__ import annotations

import inspect
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from . import identity
from .observability import TraceEvent, hub


class PolicyDenied(Exception):
    pass


@dataclass
class ToolResult:
    value: Any
    backend: str          # live | sandbox | cached | template
    latency_ms: float
    detail: str = ""      # short human-readable summary for the trace


TOOLS: dict[str, dict] = {}


def tool(name: str, scope: str):
    """Register an async tool with the gateway. The wrapped function must
    return a ToolResult."""
    def deco(fn: Callable[..., Awaitable[ToolResult]]):
        TOOLS[name] = {"fn": fn, "scope": scope, "name": name}
        return fn
    return deco


async def invoke(*, run_id: str, agent_name: str, agent_key: str, token: str,
                 tool_name: str, trace_msg: str | None = None,
                 tone: str = "ok", **kwargs) -> ToolResult:
    spec = TOOLS.get(tool_name)
    if spec is None:
        raise PolicyDenied(f"unknown tool '{tool_name}'")
    try:
        identity.check_scope(token, spec["scope"])
    except identity.IdentityError as e:
        hub.emit(TraceEvent(
            run_id=run_id, agent="Gateway", agent_name="Gateway",
            kind="policy", tone="block", tool=tool_name,
            msg=f"DENIED {agent_key} → {tool_name}: {e}",
            data={"agent": agent_key, "scope": spec["scope"]},
        ))
        raise PolicyDenied(str(e)) from e

    # tools that record which run they belong to declare a `run_id` param;
    # inject it here so agents never pass it (and never collide with call()).
    params = inspect.signature(spec["fn"]).parameters
    if "run_id" in params and "run_id" not in kwargs:
        kwargs["run_id"] = run_id

    start = time.perf_counter()
    result: ToolResult = await spec["fn"](**kwargs)
    result.latency_ms = round((time.perf_counter() - start) * 1000, 1)

    if trace_msg is not None:
        msg = trace_msg.format(detail=result.detail) if "{detail}" in trace_msg else trace_msg
        hub.emit(TraceEvent(
            run_id=run_id, agent=agent_key, agent_name=agent_name, tone=tone,
            kind="tool", tool=tool_name,
            backend=result.backend, latency_ms=result.latency_ms, msg=msg,
        ))
    return result


def sig(tool_name: str) -> inspect.Signature:
    return inspect.signature(TOOLS[tool_name]["fn"])
