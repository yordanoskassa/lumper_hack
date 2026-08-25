"""Mail: real delivery through Resend when — and only when — three separate
locks are open; otherwise a first-class Outbox simulator, where every message
is a full document stored in the Memory Bank, rendered in the UI, and traced.

The default is the simulator, deliberately. An agent that can autonomously
draft a detention claim is an agent that can autonomously email a stranger, so
sending is gated on all of:

  1. `RESEND_API_KEY` + `RESEND_FROM` are set (`has_resend`),
  2. `MAIL_LIVE=true` — an explicit, separate "yes, send for real",
  3. the recipient's domain is on `MAIL_LIVE_ALLOWLIST`.

On top of that, RFC 2606 reserved domains (example.com/.net/.org, .test,
.invalid, .localhost) are refused even if somebody allowlists them — every
seeded broker in this sandbox is `*.example.com`, so no demo run can ever put
mail on the wire. A blocked send is not silent: it lands in the Outbox and the
trace line names the lock that stopped it.

Whichever path runs, the trace carries the backend tag: `live` for a Resend
delivery with a message id, `sandbox` for the Outbox.

Inbound broker mail in the sandbox is produced by the broker simulator (see
docs.py for its attachments)."""
from __future__ import annotations

import time
import uuid

import httpx

from ..config import settings
from ..platform.gateway import ToolResult, tool
from ..platform.memory import bank
from ..platform.observability import TraceEvent, hub

RESEND_URL = "https://api.resend.com/emails"
# RFC 2606 / RFC 6761 reserved names. Nothing here resolves to a real mailbox,
# and every sandbox broker lives under one — hard-refused, allowlist or not.
RESERVED = (".example.com", ".example.net", ".example.org", ".example",
            ".test", ".invalid", ".localhost")


def _domain(addr: str) -> str:
    return addr.rsplit("@", 1)[-1].strip().lower() if "@" in addr else ""


def _reserved(domain: str) -> bool:
    return domain in ("example.com", "example.net", "example.org") \
        or domain.endswith(RESERVED)


def _clearance(to: str) -> tuple[bool, str]:
    """Three locks and a reserved-domain floor. Returns (may_send, why_not)."""
    s = settings()
    domain = _domain(to)
    if _reserved(domain):
        return False, f"{domain or to} is a reserved sandbox domain"
    if not s.has_resend:
        return False, "no Resend key configured"
    if not s.mail_live:
        return False, "MAIL_LIVE is off"
    if domain not in s.mail_allowlist:
        return False, f"{domain} is not on MAIL_LIVE_ALLOWLIST"
    return True, ""


async def _resend(to: str, subject: str, body: str,
                  attachment: str | None) -> dict:
    """POST to Resend. Attachments are referenced by name, not uploaded — the
    packet PDFs live in the Outbox document, so the live mail says which one
    rather than pretending to carry bytes it was never handed."""
    s = settings()
    text = body if not attachment else f"{body}\n\n[attachment: {attachment}]"
    payload: dict = {"from": s.resend_from, "to": [to], "subject": subject,
                     "text": text}
    if s.resend_reply_to:
        payload["reply_to"] = s.resend_reply_to
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.post(RESEND_URL, json=payload,
                              headers={"Authorization": f"Bearer {s.resend_api_key}"})
        if r.status_code >= 400:
            return {"error": f"Resend {r.status_code}: {r.text[:140]}"}
        return {"id": (r.json() or {}).get("id")}
    except (httpx.HTTPError, ValueError) as e:
        return {"error": f"Resend unreachable: {e}"}


async def _store(box: str, msg: dict) -> dict:
    msg = {"id": f"M-{uuid.uuid4().hex[:8]}", "ts": time.time(), "box": box, **msg}
    await bank.put("outbox", msg["id"], msg)
    hub.emit_misc("mail", {"mail": msg})
    return msg


@tool("mail.send", scope="mail.send")
async def send(run_id: str, to: str, subject: str, body: str,
               attachment: str | None = None, kind: str = "outbound") -> ToolResult:
    ok, why = _clearance(to)
    backend, provider_id = "sandbox", None
    if ok:
        sent = await _resend(to, subject, body, attachment)
        provider_id = sent.get("id")
        if provider_id:
            backend = "live"
        else:
            why = sent.get("error", "Resend returned no message id")

    msg = await _store("out", {"run_id": run_id, "to": to, "subject": subject,
                               "body": body, "attachment": attachment, "kind": kind,
                               "backend": backend, "provider_id": provider_id,
                               "held_reason": None if backend == "live" else why})
    line = f"→ {to} · “{subject}”" + (" · 1 attachment" if attachment else "")
    line += f" · delivered {provider_id}" if backend == "live" else f" · Outbox — {why}"
    hub.emit(TraceEvent(run_id=run_id, agent="Mail", kind="mail",
                        tone="ok" if backend == "live" else "skip",
                        backend=backend, msg=line))
    return ToolResult(msg, backend, 0,
                      f"sent to {to}" if backend == "live" else f"held in Outbox · {why}")


async def receive(run_id: str, sender: str, subject: str, body: str,
                  attachment: str | None = None) -> dict:
    """Sandbox inbound mail (broker replies, rate cons, PODs)."""
    msg = await _store("in", {"run_id": run_id, "from": sender, "subject": subject,
                              "body": body, "attachment": attachment})
    hub.emit(TraceEvent(run_id=run_id, agent="Mail", kind="mail", tone="ok",
                        backend="sandbox",
                        msg=f"← {sender} · “{subject}”" + (" · 1 attachment" if attachment else "")))
    return msg


@tool("mail.watch", scope="mail.read")
async def watch(run_id: str, expect: str) -> ToolResult:
    msgs = [m for m in await bank.find("outbox", box="in") if m.get("run_id") == run_id]
    latest = msgs[-1] if msgs else None
    return ToolResult(latest, "sandbox", 0,
                      f"inbox watch armed for {expect} · {len(msgs)} message(s) on thread")
