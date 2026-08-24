"""National Weather Service (api.weather.gov) — genuinely live, keyless, free.
Mile Marker checks active alerts near origin, midpoint and destination of the
route and reroutes/warns on storms."""
from __future__ import annotations

import httpx

from ..platform.gateway import ToolResult, tool

HEADERS = {"User-Agent": "LumperSentinel/1.0 (hackathon demo; contact ops@example.com)",
           "Accept": "application/geo+json"}


async def alerts_at(lat: float, lon: float) -> list[dict]:
    async with httpx.AsyncClient(timeout=12, headers=HEADERS) as cx:
        r = await cx.get(f"https://api.weather.gov/alerts/active?point={lat:.4f},{lon:.4f}")
        r.raise_for_status()
        feats = r.json().get("features", [])
    out = []
    for f in feats:
        p = f.get("properties", {})
        out.append({"event": p.get("event"), "severity": p.get("severity"),
                    "headline": p.get("headline"), "area": p.get("areaDesc", "")[:80]})
    return out


@tool("weather.route_check", scope="weather.read")
async def route_check(o_lat: float, o_lon: float, d_lat: float, d_lon: float) -> ToolResult:
    mid = ((o_lat + d_lat) / 2, (o_lon + d_lon) / 2)
    points = [("origin", (o_lat, o_lon)), ("midpoint", mid), ("destination", (d_lat, d_lon))]
    findings: list[dict] = []
    try:
        for label, (la, lo) in points:
            for a in await alerts_at(la, lo):
                findings.append({**a, "where": label})
        backend = "live"
    except httpx.HTTPError as e:
        return ToolResult({"alerts": [], "error": str(e)}, "cached", 0,
                          "NWS unreachable · proceeding without weather gate")
    severe = [f for f in findings if f.get("severity") in ("Severe", "Extreme")]
    if severe:
        detail = f"{len(findings)} NWS alert(s) on route · severe: {severe[0]['event']} ({severe[0]['where']})"
    elif findings:
        detail = f"{len(findings)} NWS alert(s) on route · none severe · {findings[0]['event']}"
    else:
        detail = "NWS: no active alerts along route"
    return ToolResult({"alerts": findings, "severe": severe}, backend, 0, detail)
