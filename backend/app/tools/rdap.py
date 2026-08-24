"""RDAP (the successor to WHOIS): registration date → domain age. Live and
keyless via rdap.org for real domains; seeded `.example.*` broker domains are
served from the sandbox record, labeled."""
from __future__ import annotations

from datetime import datetime, timezone

import httpx

from ..platform.gateway import ToolResult, tool
from ..platform.memory import bank


async def _live_age_days(domain: str) -> int | None:
    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as cx:
        r = await cx.get(f"https://rdap.org/domain/{domain}",
                         headers={"Accept": "application/rdap+json"})
        if r.status_code == 404:
            return None
        r.raise_for_status()
        events = r.json().get("events", [])
    for ev in events:
        if ev.get("eventAction") == "registration":
            dt = datetime.fromisoformat(ev["eventDate"].replace("Z", "+00:00"))
            return (datetime.now(timezone.utc) - dt).days
    return None


def _fmt_age(days: int) -> str:
    return f"{days / 365:.1f}y" if days >= 365 else f"{days}d"


@tool("rdap.domain_age", scope="rdap.read")
async def domain_age(domain: str, mc_number: str | None = None) -> ToolResult:
    if ".example." in domain or domain.endswith(".example"):
        seeded = await bank.get("brokers", mc_number) if mc_number else None
        days = seeded["domain_age_days"] if seeded else 0
        return ToolResult({"domain": domain, "age_days": days}, "sandbox", 0,
                          f"{domain} registered {_fmt_age(days)} ago")
    try:
        days = await _live_age_days(domain)
    except httpx.HTTPError as e:
        return ToolResult({"domain": domain, "age_days": None, "error": str(e)},
                          "cached", 0, f"{domain}: RDAP unreachable")
    if days is None:
        return ToolResult({"domain": domain, "age_days": None}, "live", 0,
                          f"{domain}: no RDAP registration record (red flag)")
    return ToolResult({"domain": domain, "age_days": days}, "live", 0,
                      f"{domain} registered {_fmt_age(days)} ago")
