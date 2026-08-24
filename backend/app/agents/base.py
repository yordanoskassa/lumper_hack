"""Base agent. Each agent is minted an Identity token scoped to exactly the
tools its registry card declares, and every tool call it makes goes through
the Gateway (which re-checks that scope). Agents never touch tools directly."""
from __future__ import annotations

from ..platform import identity
from ..platform.gateway import ToolResult, invoke
from ..platform.observability import TraceEvent, hub
from ..platform.registry import get


class Agent:
    key: str = ""

    def __init__(self) -> None:
        self.card = get(self.key)
        self.name = self.card.name
        self._token = identity.mint_token(self.key, self.card.scopes)

    def say(self, run_id: str, msg: str, tone: str = "ok", **data) -> None:
        hub.emit(TraceEvent(run_id=run_id, agent=self.name, msg=msg, tone=tone,
                            data=data or None))

    async def call(self, run_id: str, tool_name: str, *, trace: str | None = None,
                   tone: str = "ok", **kwargs) -> ToolResult:
        return await invoke(run_id=run_id, agent_name=self.name, agent_key=self.key,
                            token=self._token, tool_name=tool_name,
                            trace_msg=trace, **kwargs)
