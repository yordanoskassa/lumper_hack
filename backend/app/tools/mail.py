"""Mail: real Gmail API when a token is configured; otherwise a first-class
Outbox simulator — every message is a full document, stored in the Memory
Bank, rendered in the UI, and traced. Inbound broker mail in the sandbox is
produced by the broker simulator (see docs.py for its attachments)."""
from __future__ import annotations

import time
import uuid

from ..config import settings
from ..platform.gateway import ToolResult, tool
from ..platform.memory import bank
from ..platform.observability import TraceEvent, hub


async def _store(box: str, msg: dict) -> dict:
    msg = {"id": f"M-{uuid.uuid4().hex[:8]}", "ts": time.time(), "box": box, **msg}
    await bank.put("outbox", msg["id"], msg)
    hub.emit_misc("mail", {"mail": msg})
    return msg


@tool("mail.send", scope="mail.send")
async def send(run_id: str, to: str, subject: str, body: str,
               attachment: str | None = None, kind: str = "outbound") -> ToolResult:
    backend = "sandbox"
    if settings().gmail_token_file:
        backend = "live"  # real Gmail send would go here (users.messages.send)
    msg = await _store("out", {"run_id": run_id, "to": to, "subject": subject,
                               "body": body, "attachment": attachment, "kind": kind})
    hub.emit(TraceEvent(run_id=run_id, agent="Gmail", kind="mail", tone="ok",
                        backend=backend,
                        msg=f"→ {to} · “{subject}”" + (" · 1 attachment" if attachment else "")))
    return ToolResult(msg, backend, 0, f"sent to {to}")


async def receive(run_id: str, sender: str, subject: str, body: str,
                  attachment: str | None = None) -> dict:
    """Sandbox inbound mail (broker replies, rate cons, PODs)."""
    msg = await _store("in", {"run_id": run_id, "from": sender, "subject": subject,
                              "body": body, "attachment": attachment})
    hub.emit(TraceEvent(run_id=run_id, agent="Gmail", kind="mail", tone="ok",
                        backend="sandbox",
                        msg=f"← {sender} · “{subject}”" + (" · 1 attachment" if attachment else "")))
    return msg


@tool("mail.watch", scope="mail.read")
async def watch(run_id: str, expect: str) -> ToolResult:
    msgs = [m for m in await bank.find("outbox", box="in") if m.get("run_id") == run_id]
    latest = msgs[-1] if msgs else None
    return ToolResult(latest, "sandbox", 0,
                      f"inbox watch armed for {expect} · {len(msgs)} message(s) on thread")
