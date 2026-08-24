"""Google Maps Platform: Geocoding + Routes API v2. With no key, distances
fall back to haversine × 1.19 road factor at 52 mph — labeled 'cached' so
nobody mistakes estimate for measurement."""
from __future__ import annotations

import math

import httpx

from ..config import settings
from ..data.seed import CITY_COORDS
from ..platform.gateway import ToolResult, tool

ROAD_FACTOR = 1.19
AVG_MPH = 52.0
_geo_cache: dict[str, tuple[float, float]] = dict(CITY_COORDS)
_route_cache: dict[str, dict] = {}


async def geocode(city: str) -> tuple[tuple[float, float], str]:
    if city in _geo_cache:
        return _geo_cache[city], "cached"
    if settings().has_maps:
        async with httpx.AsyncClient(timeout=10) as cx:
            r = await cx.get("https://maps.googleapis.com/maps/api/geocode/json",
                             params={"address": city, "key": settings().google_maps_api_key})
            r.raise_for_status()
            results = r.json().get("results")
            if results:
                loc = results[0]["geometry"]["location"]
                _geo_cache[city] = (loc["lat"], loc["lng"])
                return _geo_cache[city], "live"
    raise ValueError(f"cannot geocode '{city}' (no key, not in cache)")


def _haversine_mi(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 3958.8 * 2 * math.asin(math.sqrt(h))


async def route(origin: str, dest: str) -> dict:
    key = f"{origin}→{dest}"
    if key in _route_cache:
        return {**_route_cache[key], "backend": "cached"}
    (o, _), (d, _) = await geocode(origin), await geocode(dest)
    if settings().has_maps:
        body = {
            "origin": {"location": {"latLng": {"latitude": o[0], "longitude": o[1]}}},
            "destination": {"location": {"latLng": {"latitude": d[0], "longitude": d[1]}}},
            "travelMode": "DRIVE",
        }
        try:
            async with httpx.AsyncClient(timeout=15) as cx:
                r = await cx.post(
                    "https://routes.googleapis.com/directions/v2:computeRoutes",
                    json=body,
                    headers={"X-Goog-Api-Key": settings().google_maps_api_key,
                             "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"},
                )
                r.raise_for_status()
                routes = r.json().get("routes") or []
            # Routes API can return a route element without distanceMeters
            # (unroutable pair, partial result). Fall back rather than crash.
            if routes and "distanceMeters" in routes[0]:
                meters = routes[0]["distanceMeters"]
                secs = float(str(routes[0].get("duration", "0s")).rstrip("s")) or (meters / 1609.34 / AVG_MPH * 3600)
                out = {"miles": meters / 1609.34, "hours": secs / 3600,
                       "origin": o, "dest": d, "backend": "live"}
                _route_cache[key] = out
                return out
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            pass  # fall through to the haversine estimate below
    miles = _haversine_mi(o, d) * ROAD_FACTOR
    out = {"miles": miles, "hours": miles / AVG_MPH, "origin": o, "dest": d,
           "backend": "cached"}
    _route_cache[key] = out
    return out


@tool("maps.route", scope="maps.routes")
async def maps_route(origin: str, dest: str) -> ToolResult:
    r = await route(origin, dest)
    return ToolResult(r, r["backend"], 0,
                      f"{origin} → {dest}: {r['miles']:.0f} mi · {r['hours']:.1f}h drive")


@tool("maps.geocode", scope="maps.geocode")
async def maps_geocode(city: str) -> ToolResult:
    coords, backend = await geocode(city)
    return ToolResult({"lat": coords[0], "lon": coords[1]}, backend, 0,
                      f"{city} → {coords[0]:.4f},{coords[1]:.4f}")
