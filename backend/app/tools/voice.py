"""Speech-to-Text / Text-to-Speech: the driver approves an offer by voice from
the cab. Simulated transcript here (wire Google STT/TTS for the live version);
the point on camera is the human-in-the-loop approval, traced like any tool."""
from __future__ import annotations

from ..platform.gateway import ToolResult, tool


@tool("voice.confirm", scope="voice.io")
async def confirm(offer_amount: int, driver: str = "M. Alvarez") -> ToolResult:
    transcript = f"“Yeah, {offer_amount // 1000}-{offer_amount % 1000:03d}, take it.”"
    return ToolResult({"approved": True, "transcript": transcript, "driver": driver},
                      "template", 0, f"driver {driver} approved by voice · STT: {transcript}")
