"""EIA open data: weekly on-highway diesel price by PADD region.
Real API when EIA_API_KEY is set (free, instant at eia.gov/opendata);
otherwise a dated snapshot, labeled 'cached'."""
from __future__ import annotations

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


async def diesel_price(padd: str) -> tuple[float, str, str]:
    """Returns (price, asof, backend)."""
    padd = padd if padd in PADD_SERIES else "US"
    if padd in _live_cache:
        price, asof = _live_cache[padd]
        return price, asof, "live"
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
                r.raise_for_status()
                rows = r.json()["response"]["data"]
                if rows:
                    price = float(rows[0]["value"])
                    asof = rows[0]["period"]
                    _live_cache[padd] = (price, asof)
                    return price, asof, "live"
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            pass
    return SNAPSHOT[padd], SNAPSHOT["asof"], "cached"


@tool("fuel.price", scope="fuel.price")
async def fuel_price(padd: str) -> ToolResult:
    price, asof, backend = await diesel_price(padd)
    return ToolResult({"padd": padd, "price": price, "asof": asof}, backend, 0,
                      f"{padd} diesel ${price:.2f}/gal (wk {asof})")
