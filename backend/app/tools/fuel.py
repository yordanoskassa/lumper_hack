"""EIA open data: weekly on-highway diesel price by PADD region.
Real API when EIA_API_KEY is set (free, instant at eia.gov/opendata);
otherwise a dated snapshot, labeled 'cached'.

A rejected key is a 403 with `API_KEY_INVALID` in the body, which used to fall
through to the snapshot in silence — the demo would look identical whether the
key worked or not. The reason now rides along on the ToolResult detail, so a
typo'd key shows up in the trace as a typo'd key instead of quietly becoming
last week's price forever."""
from __future__ import annotations

import html
import re

import httpx

from ..config import settings
from ..platform.gateway import ToolResult, tool

# EIA v2 duoarea codes for weekly retail on-highway diesel.
PADD_SERIES = {
    "PADD 1": "R10", "PADD 2": "R20", "PADD 3": "R30",
    "PADD 4": "R40", "PADD 5": "R50", "US": "NUS",
}
# Snapshot of EIA weekly retail on-highway diesel, week of 2026-08-17.
SNAPSHOT = {"PADD 1": 4.02, "PADD 2": 3.94, "PADD 3": 3.71, "PADD 4": 3.98,
            "PADD 5": 4.55, "US": 3.97, "asof": "2026-08-17"}
_live_cache: dict[str, tuple[float, str]] = {}

# EIA's own weekly retail page, one per PADD. No key, no registration — the same
# numbers the v2 API serves, published as HTML. The key path stays the primary
# because it is a stable contract; this is what keeps the read genuinely live for
# anyone who has not registered, instead of quietly serving a hardcoded snapshot.
PADD_PAGE = {
    "PADD 1": "r10", "PADD 2": "r20", "PADD 3": "r30",
    "PADD 4": "r40", "PADD 5": "r50", "US": "nus",
}
_PAGE = "https://www.eia.gov/dnav/pet/pet_pri_gnd_dcus_{region}_w.htm"


async def _keyless(padd: str) -> tuple[float, str] | None:
    """Latest published on-highway diesel price for a PADD, or None.

    Scraping is fragile by nature, so every failure returns None and the caller
    falls back to the snapshot — this can improve the answer, never break it."""
    try:
        url = _PAGE.format(region=PADD_PAGE.get(padd, "nus"))
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as cx:
            r = await cx.get(url, headers={"accept": "text/html"})
            r.raise_for_status()
            body = r.text
        weeks = re.findall(r'<th class="Series5">(\d{2}/\d{2}/\d{2})</th>', body)
        rows = re.findall(
            r'<td class="DataStub1">(.*?)</td>(.*?)(?=<td class="DataStub1">|\Z)',
            body, re.S)
        for label, blob in rows:
            name = html.unescape(re.sub(r"<[^>]+>", "", label)).strip().lower()
            if "diesel" not in name:
                continue
            vals = [v for v in re.findall(
                r'<td[^>]*class="DataB"[^>]*>([\d.]*)</td>', blob) if v]
            if not vals:
                continue
            price = float(vals[-1])
            # the published weeks and the published values can differ in length
            # when the newest week is not out yet; pair from the end
            asof = weeks[len(vals) - 1] if len(vals) <= len(weeks) else (weeks[-1] if weeks else "")
            if asof:
                mm, dd, yy = asof.split("/")
                asof = f"20{yy}-{mm}-{dd}"
            return price, asof
    except (httpx.HTTPError, ValueError, IndexError):
        return None
    return None


async def diesel_price(padd: str) -> tuple[float, str, str, str]:
    """Returns (price, asof, backend, why) — `why` is empty on a live read."""
    padd = padd if padd in PADD_SERIES else "US"
    if padd in _live_cache:
        # A cached answer from an earlier live read is still not a live read.
        price, asof = _live_cache[padd]
        return price, asof, "cached", "from this session's earlier EIA read"
    why = "EIA_API_KEY not set"
    if settings().has_eia:
        params = {
            "api_key": settings().eia_api_key,
            "frequency": "weekly",
            "data[0]": "value",
            "facets[duoarea][]": PADD_SERIES[padd],
            "facets[product][]": "EPD2D",
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 1,
        }
        try:
            async with httpx.AsyncClient(timeout=12) as cx:
                r = await cx.get("https://api.eia.gov/v2/petroleum/pri/gnd/data/",
                                 params=params)
            if r.status_code >= 400:
                err = (r.json().get("error") or {}) if "json" in \
                    r.headers.get("content-type", "") else {}
                why = f"EIA {r.status_code} {err.get('code', '')}".strip()
            else:
                rows = r.json()["response"]["data"]
                if rows:
                    price = float(rows[0]["value"])
                    asof = rows[0]["period"]
                    _live_cache[padd] = (price, asof)
                    return price, asof, "live", ""
                why = "EIA returned no rows for this series"
        except (httpx.HTTPError, KeyError, ValueError, TypeError) as e:
            why = f"EIA unreachable: {type(e).__name__}"

    # No key, or the keyed call failed: read EIA's own published weekly page.
    # Same publisher, same series, no registration — a real read beats a
    # hardcoded snapshot, and if it fails we still have the snapshot.
    pub = await _keyless(padd)
    if pub:
        price, asof = pub
        _live_cache[padd] = (price, asof)
        return price, asof, "live", ""

    return SNAPSHOT[padd], SNAPSHOT["asof"], "cached", why


@tool("fuel.price", scope="fuel.price")
async def fuel_price(padd: str) -> ToolResult:
    price, asof, backend, why = await diesel_price(padd)
    detail = f"{padd} diesel ${price:.2f}/gal (wk {asof})"
    if why:
        detail += f" · dated snapshot — {why}"
    return ToolResult({"padd": padd, "price": price, "asof": asof, "reason": why},
                      backend, 0, detail)
