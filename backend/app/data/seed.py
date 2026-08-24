"""Sandbox seed. Postings and broker records are SYNTHETIC (modeled on live
freight ops — no real client data is used); MC numbers are fictional unless a
record carries `real_mc: true`. Ghost screens seeded brokers against the graph
and, when an FMCSA WebKey is configured, screens any typed MC live."""
from __future__ import annotations

import time

from ..platform.memory import MemoryBank

TENANT = {
    "name": "K&M Hauling", "trucks": 3, "email": "ops@kmhauling.example",
    "truck": {
        "id": "12", "driver": "M. Alvarez", "city": "Joliet IL",
        "lat": 41.525, "lon": -88.083, "mpg": 6.4, "fixed_cpm": 0.62,
        "hos_left_h": 8.4, "empty_in_h": 2.07,
    },
    "floor_rpm": 1.45,
    "detention": {"rate_per_hour": 75.0, "free_hours": 2.0},
}

CITY_COORDS: dict[str, tuple[float, float]] = {
    "Chicago IL": (41.8781, -87.6298), "Joliet IL": (41.5250, -88.0834),
    "Gary IN": (41.5934, -87.3464), "Milwaukee WI": (43.0389, -87.9065),
    "Columbus OH": (39.9612, -82.9988), "Cincinnati OH": (39.1031, -84.5120),
    "Toledo OH": (41.6528, -83.5379), "Memphis TN": (35.1495, -90.0490),
    "Nashville TN": (36.1627, -86.7816), "Indianapolis IN": (39.7684, -86.1581),
    "Dallas TX": (32.7767, -96.7970), "Pittsburgh PA": (40.4406, -79.9959),
    "Louisville KY": (38.2527, -85.7585), "Denver CO": (39.7392, -104.9903),
}

# PADD (fuel region) per state for EIA diesel lookups.
STATE_PADD = {"IL": "PADD 2", "IN": "PADD 2", "WI": "PADD 2", "OH": "PADD 2",
              "TN": "PADD 2", "KY": "PADD 2", "TX": "PADD 3", "PA": "PADD 1",
              "CO": "PADD 4"}

BROKERS: list[dict] = [
    {"_key": "MC-884211", "name": "Meridian Logistics Group", "domain": "meridianlogistics.example.com",
     "domain_age_days": 3410, "authority_age_days": 3650, "insurance": True, "oos": False,
     "phone": "312-555-0142", "ach": "RT-071000013", "prior_loads": 14, "avg_pay_days": 22,
     "unpaid": 0, "email": "dispatch@meridianlogistics.example.com", "real_mc": False},
    {"_key": "MC-612088", "name": "Great Lakes Transfer", "domain": "gltransfer.example.com",
     "domain_age_days": 2190, "authority_age_days": 2555, "insurance": True, "oos": False,
     "phone": "414-555-0188", "ach": "RT-075000019", "prior_loads": 6, "avg_pay_days": 31,
     "unpaid": 0, "email": "loads@gltransfer.example.com", "real_mc": False},
    {"_key": "MC-449017", "name": "Cardinal Dispatch Co", "domain": "cardinaldispatch.example.com",
     "domain_age_days": 1580, "authority_age_days": 1825, "insurance": True, "oos": False,
     "phone": "614-555-0121", "ach": "RT-041000124", "prior_loads": 9, "avg_pay_days": 47,
     "unpaid": 0, "email": "book@cardinaldispatch.example.com", "real_mc": False},
    # --- the shell ring: three fronts, one phone, one bank account ---
    {"_key": "MC-1687203", "name": "Apex Freight Solutions", "domain": "apexfreightsol.example.net",
     "domain_age_days": 9, "authority_age_days": 11, "insurance": False, "oos": False,
     "phone": "469-555-0177", "ach": "RT-111900659", "prior_loads": 0, "avg_pay_days": 0,
     "unpaid": 0, "email": "ops@apexfreightsol.example.net", "real_mc": False},
    {"_key": "MC-1590441", "name": "Redline Brokerage", "domain": "redline-brokerage.example.co",
     "domain_age_days": 74, "authority_age_days": 96, "insurance": True, "oos": True,
     "phone": "469-555-0177", "ach": "RT-111900659", "prior_loads": 1, "avg_pay_days": 0,
     "unpaid": 4000, "email": "billing@redline-brokerage.example.co", "real_mc": False},
    {"_key": "MC-1712806", "name": "Sunbelt Freight Partners", "domain": "sunbeltfp.example.net",
     "domain_age_days": 21, "authority_age_days": 27, "insurance": False, "oos": False,
     "phone": "972-555-0104", "ach": "RT-111900659", "prior_loads": 0, "avg_pay_days": 0,
     "unpaid": 0, "email": "dispatch@sunbeltfp.example.net", "real_mc": False},
    # ---
    {"_key": "MC-508112", "name": "Ohio Valley Logistics", "domain": "ohiovalleylog.example.com",
     "domain_age_days": 2920, "authority_age_days": 3285, "insurance": True, "oos": False,
     "phone": "513-555-0166", "ach": "RT-042000013", "prior_loads": 21, "avg_pay_days": 19,
     "unpaid": 0, "email": "dispatch@ohiovalleylog.example.com", "real_mc": False},
    {"_key": "MC-771034", "name": "Keystone Load Co", "domain": "keystoneload.example.com",
     "domain_age_days": 640, "authority_age_days": 730, "insurance": True, "oos": False,
     "phone": "717-555-0193", "ach": "RT-031000053", "prior_loads": 2, "avg_pay_days": 58,
     "unpaid": 0, "email": "ops@keystoneload.example.com", "real_mc": False},
]

# Raw postings the SandboxAdapter serves. `mi`/`dh` are the boards' claimed
# numbers — Margin recomputes both with the Routes API and trusts its own math.
BOARD: list[dict] = [
    {"id": "P-90412", "mc": "MC-884211", "o": "Chicago IL", "d": "Columbus OH", "mi": 342, "dh": 41, "rate": 875, "eq": "Dry van", "posted_min": 12, "src": "DAT"},
    {"id": "P-90418", "mc": "MC-1687203", "o": "Chicago IL", "d": "Memphis TN", "mi": 531, "dh": 63, "rate": 1725, "eq": "Reefer", "posted_min": 4, "src": "Truckstop"},
    {"id": "P-90402", "mc": "MC-508112", "o": "Joliet IL", "d": "Cincinnati OH", "mi": 298, "dh": 8, "rate": 635, "eq": "Dry van", "posted_min": 38, "src": "DAT"},
    {"id": "P-90419", "mc": "MC-1590441", "o": "Chicago IL", "d": "Nashville TN", "mi": 471, "dh": 52, "rate": 1300, "eq": "Dry van", "posted_min": 6, "src": "123LB"},
    {"id": "P-90388", "mc": "MC-612088", "o": "Milwaukee WI", "d": "Indianapolis IN", "mi": 279, "dh": 96, "rate": 525, "eq": "Dry van", "posted_min": 47, "src": "DAT"},
    {"id": "P-90421", "mc": "MC-1712806", "o": "Chicago IL", "d": "Dallas TX", "mi": 967, "dh": 44, "rate": 2450, "eq": "Reefer", "posted_min": 3, "src": "123LB"},
    {"id": "P-90410", "mc": "MC-449017", "o": "Gary IN", "d": "Columbus OH", "mi": 316, "dh": 22, "rate": None, "eq": "Dry van", "posted_min": 19, "src": "Truckstop"},
    {"id": "P-90412b", "mc": "MC-884211", "o": "Chicago IL", "d": "Columbus OH", "mi": 342, "dh": 41, "rate": 875, "eq": "Dry van", "posted_min": 14, "src": "Truckstop", "dup_of": "P-90412"},
    {"id": "P-90396", "mc": "MC-771034", "o": "Chicago IL", "d": "Pittsburgh PA", "mi": 461, "dh": 37, "rate": 825, "eq": "Dry van", "posted_min": 87, "src": "DAT"},
    {"id": "P-90424", "mc": "MC-508112", "o": "Joliet IL", "d": "Louisville KY", "mi": 297, "dh": 11, "rate": 725, "eq": "Dry van", "posted_min": 2, "src": "DAT"},
    {"id": "P-90377", "mc": "MC-612088", "o": "Chicago IL", "d": "Denver CO", "mi": 1003, "dh": 29, "rate": 1750, "eq": "Dry van", "posted_min": 216, "src": "123LB"},
    {"id": "P-90423", "mc": "MC-449017", "o": "Chicago IL", "d": "Toledo OH", "mi": 244, "dh": 31, "rate": 525, "eq": "Dry van", "posted_min": 5, "src": "Truckstop"},
]

# 90-day average all-in linehaul $ per loaded mile ("BigQuery lane history").
LANES: dict[str, float] = {
    "Chicago IL→Columbus OH": 2.21, "Chicago IL→Memphis TN": 2.42,
    "Joliet IL→Cincinnati OH": 2.09, "Chicago IL→Nashville TN": 2.15,
    "Milwaukee WI→Indianapolis IN": 2.04, "Chicago IL→Dallas TX": 2.20,
    "Gary IN→Columbus OH": 2.12, "Chicago IL→Pittsburgh PA": 2.06,
    "Joliet IL→Louisville KY": 2.11, "Chicago IL→Denver CO": 1.85,
    "Chicago IL→Toledo OH": 2.24,
}


def padd_for_city(city: str) -> str:
    return STATE_PADD.get(city.rsplit(" ", 1)[-1], "PADD 2")


async def load(bank: MemoryBank, force: bool = False) -> bool:
    existing = await bank.all("brokers")
    if existing and not force:
        return False
    for coll in ("brokers", "lanes", "board", "runs", "outbox", "quarantine", "settings"):
        await bank.clear(coll)
    for b in BROKERS:
        await bank.put("brokers", b["_key"], b)
    for lane, avg in LANES.items():
        await bank.put("lanes", lane, {"lane": lane, "avg_rpm": avg, "window_days": 90, "samples": 17})
    now = time.time()
    for p in BOARD:
        await bank.put("board", p["id"], {**p, "posted_ts": now - p["posted_min"] * 60})
    await bank.put("settings", "tenant", TENANT)
    return True
