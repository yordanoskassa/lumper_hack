"""Sandbox seed. Postings and broker records are SYNTHETIC (modeled on live
freight ops — no real client data is used); MC numbers are fictional unless a
record carries `real_mc: true`. Verifier screens seeded brokers against the
graph and, when an FMCSA WebKey is configured, screens any typed MC live.

Two fraud patterns are seeded deliberately:
  * the shell ring — three fronts sharing one phone and one bank account, one
    of which already stiffed this carrier $4,000;
  * the lookalike — a 12-day-old entity whose domain and phone are one
    character off a legitimate broker's, posting loads under the legitimate
    broker's MC. Only a callback cross-check catches that one.
Memories are episodic: what actually happened to *this* carrier, so Verifier
can cite the event rather than a score."""
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
    "Cleveland OH": (41.4993, -81.6944), "Detroit MI": (42.3314, -83.0458),
    "Grand Rapids MI": (42.9634, -85.6681), "St Louis MO": (38.6270, -90.1994),
    "Kansas City MO": (39.0997, -94.5786), "Des Moines IA": (41.5868, -93.6250),
    "Minneapolis MN": (44.9778, -93.2650), "Atlanta GA": (33.7490, -84.3880),
}

# PADD (fuel region) per state for EIA diesel lookups.
STATE_PADD = {"IL": "PADD 2", "IN": "PADD 2", "WI": "PADD 2", "OH": "PADD 2",
              "TN": "PADD 2", "KY": "PADD 2", "TX": "PADD 3", "PA": "PADD 1",
              "CO": "PADD 4", "MI": "PADD 2", "MO": "PADD 2", "IA": "PADD 2",
              "MN": "PADD 2", "GA": "PADD 1"}

BROKERS: list[dict] = [
    {"_key": "MC-884211", "name": "Meridian Logistics Group", "domain": "meridianlogistics.example.com",
     "domain_age_days": 3410, "authority_age_days": 3650, "insurance": True, "oos": False,
     "phone": "312-555-0142", "ach": "RT-071000013", "prior_loads": 14, "avg_pay_days": 22,
     "unpaid": 0, "email": "dispatch@meridianlogistics.example.com", "real_mc": False,
     "detention_claims": 2, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 2},
    {"_key": "MC-612088", "name": "Great Lakes Transfer", "domain": "gltransfer.example.com",
     "domain_age_days": 2190, "authority_age_days": 2555, "insurance": True, "oos": False,
     "phone": "414-555-0188", "ach": "RT-075000019", "prior_loads": 6, "avg_pay_days": 31,
     "unpaid": 0, "email": "loads@gltransfer.example.com", "real_mc": False,
     "detention_claims": 1, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 6},
    {"_key": "MC-449017", "name": "Cardinal Dispatch Co", "domain": "cardinaldispatch.example.com",
     "domain_age_days": 1580, "authority_age_days": 1825, "insurance": True, "oos": False,
     "phone": "614-555-0121", "ach": "RT-041000124", "prior_loads": 9, "avg_pay_days": 47,
     "unpaid": 0, "email": "book@cardinaldispatch.example.com", "real_mc": False,
     # the detention staller: three claims filed, three denied, still owes waiting time
     "detention_claims": 3, "detention_denied": 3, "detention_unpaid": 450,
     "detention_stiff_days_ago": 34, "responds_in_h": 18},
    # --- the shell ring: three fronts, one phone, one bank account ---
    {"_key": "MC-1687203", "name": "Apex Freight Solutions", "domain": "apexfreightsol.example.net",
     "domain_age_days": 9, "authority_age_days": 11, "insurance": False, "oos": False,
     "phone": "469-555-0177", "ach": "RT-111900659", "prior_loads": 0, "avg_pay_days": 0,
     "unpaid": 0, "email": "ops@apexfreightsol.example.net", "real_mc": False,
     "detention_claims": 0, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 1},
    {"_key": "MC-1590441", "name": "Redline Brokerage", "domain": "redline-brokerage.example.co",
     "domain_age_days": 74, "authority_age_days": 96, "insurance": True, "oos": True,
     "phone": "469-555-0177", "ach": "RT-111900659", "prior_loads": 1, "avg_pay_days": 0,
     "unpaid": 4000, "unpaid_since_days": 21, "email": "billing@redline-brokerage.example.co",
     "real_mc": False, "detention_claims": 1, "detention_denied": 1, "detention_unpaid": 300,
     "responds_in_h": 1},
    {"_key": "MC-1712806", "name": "Sunbelt Freight Partners", "domain": "sunbeltfp.example.net",
     "domain_age_days": 21, "authority_age_days": 27, "insurance": False, "oos": False,
     "phone": "972-555-0104", "ach": "RT-111900659", "prior_loads": 0, "avg_pay_days": 0,
     "unpaid": 0, "email": "dispatch@sunbeltfp.example.net", "real_mc": False,
     "detention_claims": 0, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 1},
    # --- the lookalike: one character off Meridian, 12 days old, same bank as
    #     the shell ring. It never posts under its own MC — it posts under
    #     Meridian's and puts its own phone in the contact field. ---
    {"_key": "MC-1744902", "name": "Meridian Logistic Grp LLC", "domain": "meridian-logistics.example.com",
     "domain_age_days": 12, "authority_age_days": 14, "insurance": False, "oos": False,
     "phone": "312-555-0198", "ach": "RT-111900659", "prior_loads": 0, "avg_pay_days": 0,
     "unpaid": 0, "email": "dispatch@meridian-logistics.example.com", "real_mc": False,
     "lookalike_of": "MC-884211", "detention_claims": 0, "detention_denied": 0,
     "detention_unpaid": 0, "responds_in_h": 1},
    # ---
    {"_key": "MC-508112", "name": "Ohio Valley Logistics", "domain": "ohiovalleylog.example.com",
     "domain_age_days": 2920, "authority_age_days": 3285, "insurance": True, "oos": False,
     "phone": "513-555-0166", "ach": "RT-042000013", "prior_loads": 21, "avg_pay_days": 19,
     "unpaid": 0, "email": "dispatch@ohiovalleylog.example.com", "real_mc": False,
     "detention_claims": 4, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 1},
    {"_key": "MC-771034", "name": "Keystone Load Co", "domain": "keystoneload.example.com",
     "domain_age_days": 640, "authority_age_days": 730, "insurance": True, "oos": False,
     "phone": "717-555-0193", "ach": "RT-031000053", "prior_loads": 2, "avg_pay_days": 58,
     "unpaid": 0, "email": "ops@keystoneload.example.com", "real_mc": False,
     "detention_claims": 1, "detention_denied": 1, "detention_unpaid": 150, "responds_in_h": 24},
]

# Raw postings the SandboxAdapter serves. `mi`/`dh` are the boards' claimed
# numbers — Finder recomputes both with the Routes API and trusts its own math.
# `cph`/`cem` are the contact phone/email printed on the posting; Verifier
# cross-checks them against the registered contact for the claimed MC.
BOARD: list[dict] = [
    {"id": "P-90412", "mc": "MC-884211", "o": "Chicago IL", "d": "Columbus OH", "mi": 342, "dh": 41, "rate": 875, "eq": "Dry van", "posted_min": 12, "src": "DAT",
     "cph": "312-555-0142", "cem": "dispatch@meridianlogistics.example.com"},
    # the lookalike's bait: same lane, same MC on the posting, 66% over the
    # board rate — and a contact phone that is not Meridian's.
    {"id": "P-90431", "mc": "MC-884211", "o": "Chicago IL", "d": "Columbus OH", "mi": 342, "dh": 41, "rate": 1450, "eq": "Dry van", "posted_min": 7, "src": "123LB",
     "cph": "312-555-0198", "cem": "dispatch@meridian-logistics.example.com"},
    {"id": "P-90418", "mc": "MC-1687203", "o": "Chicago IL", "d": "Memphis TN", "mi": 531, "dh": 63, "rate": 1725, "eq": "Reefer", "posted_min": 4, "src": "Truckstop",
     "cph": "469-555-0177", "cem": "ops@apexfreightsol.example.net"},
    {"id": "P-90402", "mc": "MC-508112", "o": "Joliet IL", "d": "Cincinnati OH", "mi": 298, "dh": 8, "rate": 635, "eq": "Dry van", "posted_min": 38, "src": "DAT",
     "cph": "513-555-0166", "cem": "dispatch@ohiovalleylog.example.com"},
    {"id": "P-90419", "mc": "MC-1590441", "o": "Chicago IL", "d": "Nashville TN", "mi": 471, "dh": 52, "rate": 1300, "eq": "Dry van", "posted_min": 6, "src": "123LB",
     "cph": "469-555-0177", "cem": "billing@redline-brokerage.example.co"},
    {"id": "P-90388", "mc": "MC-612088", "o": "Milwaukee WI", "d": "Indianapolis IN", "mi": 279, "dh": 96, "rate": 525, "eq": "Dry van", "posted_min": 47, "src": "DAT",
     "cph": "414-555-0188", "cem": "loads@gltransfer.example.com"},
    {"id": "P-90421", "mc": "MC-1712806", "o": "Chicago IL", "d": "Dallas TX", "mi": 967, "dh": 44, "rate": 2450, "eq": "Reefer", "posted_min": 3, "src": "123LB",
     "cph": "972-555-0104", "cem": "dispatch@sunbeltfp.example.net"},
    {"id": "P-90428", "mc": "MC-449017", "o": "Joliet IL", "d": "Indianapolis IN", "mi": 205, "dh": 8, "rate": 800, "eq": "Dry van", "posted_min": 16, "src": "DAT",
     "cph": "614-555-0121", "cem": "book@cardinaldispatch.example.com"},
    {"id": "P-90410", "mc": "MC-449017", "o": "Gary IN", "d": "Columbus OH", "mi": 316, "dh": 22, "rate": None, "eq": "Dry van", "posted_min": 19, "src": "Truckstop",
     "cph": "614-555-0121", "cem": "book@cardinaldispatch.example.com"},
    {"id": "P-90412b", "mc": "MC-884211", "o": "Chicago IL", "d": "Columbus OH", "mi": 342, "dh": 41, "rate": 875, "eq": "Dry van", "posted_min": 14, "src": "Truckstop", "dup_of": "P-90412",
     "cph": "312-555-0142", "cem": "dispatch@meridianlogistics.example.com"},
    {"id": "P-90396", "mc": "MC-771034", "o": "Chicago IL", "d": "Pittsburgh PA", "mi": 461, "dh": 37, "rate": 825, "eq": "Dry van", "posted_min": 87, "src": "DAT",
     "cph": "717-555-0193", "cem": "ops@keystoneload.example.com"},
    {"id": "P-90424", "mc": "MC-508112", "o": "Joliet IL", "d": "Louisville KY", "mi": 297, "dh": 11, "rate": 725, "eq": "Dry van", "posted_min": 2, "src": "DAT",
     "cph": "513-555-0166", "cem": "dispatch@ohiovalleylog.example.com"},
    {"id": "P-90377", "mc": "MC-612088", "o": "Chicago IL", "d": "Denver CO", "mi": 1003, "dh": 29, "rate": 1750, "eq": "Dry van", "posted_min": 216, "src": "123LB",
     "cph": "414-555-0188", "cem": "loads@gltransfer.example.com"},
    {"id": "P-90423", "mc": "MC-449017", "o": "Chicago IL", "d": "Toledo OH", "mi": 244, "dh": 31, "rate": 525, "eq": "Dry van", "posted_min": 5, "src": "Truckstop",
     "cph": "614-555-0121", "cem": "book@cardinaldispatch.example.com"},
]

# 90-day average all-in linehaul $ per loaded mile ("BigQuery lane history").
LANES: dict[str, float] = {
    "Chicago IL→Columbus OH": 2.21, "Chicago IL→Memphis TN": 2.42,
    "Joliet IL→Cincinnati OH": 2.09, "Chicago IL→Nashville TN": 2.15,
    "Milwaukee WI→Indianapolis IN": 2.04, "Chicago IL→Dallas TX": 2.20,
    "Gary IN→Columbus OH": 2.12, "Chicago IL→Pittsburgh PA": 2.06,
    "Joliet IL→Louisville KY": 2.11, "Chicago IL→Denver CO": 1.85,
    "Chicago IL→Toledo OH": 2.24, "Joliet IL→Indianapolis IN": 2.30,
}

# Episodic memory: what actually happened to THIS carrier. Verifier recalls by
# mc / ach / phone / domain and cites the event, not a score.
MEMORIES: list[dict] = [
    {"_key": "MEM-001", "kind": "unpaid", "mc": "MC-1590441", "ach": "RT-111900659",
     "phone": "469-555-0177", "amount": 4000, "days_ago": 21,
     "text": "Redline Brokerage took a Chicago→Nashville load 21 days ago and never paid "
             "the $4,000. Bank routing on the rate con was RT-111900659."},
    {"_key": "MEM-002", "kind": "shell_ring", "mc": "MC-1687203", "ach": "RT-111900659",
     "phone": "469-555-0177", "amount": 0, "days_ago": 19,
     "text": "Apex Freight Solutions called from the same 469-555-0177 number Redline used, "
             "two days after Redline went dark."},
    {"_key": "MEM-003", "kind": "detention_denied", "mc": "MC-449017", "amount": 450,
     "days_ago": 34,
     "text": "Cardinal Dispatch denied 3 detention claims and still owes $450 in waiting "
             "time — they argued we had no timestamped arrival notice."},
    {"_key": "MEM-004", "kind": "paid_well", "mc": "MC-884211", "amount": 0, "days_ago": 9,
     "text": "Meridian Logistics Group has paid 14 of 14 loads, averaging 22 days, and "
             "settled a 3-hour detention claim without argument."},
    {"_key": "MEM-005", "kind": "detention_denied", "mc": "MC-771034", "amount": 150,
     "days_ago": 61,
     "text": "Keystone Load Co refused a $150 detention claim because the driver had no "
             "proof of what time he rolled in."},
]

# One closed, still-unpaid detention claim so the phone can show real money owed.
DETENTION_CLAIMS: list[dict] = [
    {"_key": "P-90290", "posting_id": "P-90290", "mc": "MC-449017",
     "broker": "Cardinal Dispatch Co", "stop": "Columbus OH",
     "minutes_on_site": 318, "free_minutes": 120, "billable_minutes": 198,
     "rate_per_hour": 75.0, "owed": 247.5, "status": "DENIED", "paid": False,
     "days_ago": 34, "notice_sent": False,
     "note": "no timestamped arrival notice was sent — the reason it was denied"},
]


def padd_for_city(city: str) -> str:
    return STATE_PADD.get(city.rsplit(" ", 1)[-1], "PADD 2")


def coords_for_city(city: str) -> tuple[float, float]:
    """Every origin/dest on the board must resolve for the driver app map."""
    return CITY_COORDS.get(city, (41.8781, -87.6298))


async def load(bank: MemoryBank, force: bool = False) -> bool:
    existing = await bank.all("brokers")
    if existing and not force:
        return False
    for coll in ("brokers", "lanes", "board", "runs", "outbox", "quarantine",
                 "settings", "memories", "detention", "detention_claims"):
        await bank.clear(coll)
    for b in BROKERS:
        await bank.put("brokers", b["_key"], b)
    for lane, avg in LANES.items():
        await bank.put("lanes", lane, {"lane": lane, "avg_rpm": avg, "window_days": 90, "samples": 17})
    now = time.time()
    for p in BOARD:
        await bank.put("board", p["id"], {**p, "posted_ts": now - p["posted_min"] * 60})
    for m in MEMORIES:
        await bank.put("memories", m["_key"], {**m, "ts": now - m["days_ago"] * 86400})
    for c in DETENTION_CLAIMS:
        await bank.put("detention_claims", c["_key"], {**c, "ts": now - c["days_ago"] * 86400})
    await bank.put("settings", "tenant", TENANT)
    return True
