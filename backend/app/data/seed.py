"""Sandbox seed. Postings and broker records are SYNTHETIC (modeled on live
freight ops — no real client data is used). Verifier screens seeded brokers
against the graph and, when an FMCSA WebKey is configured, screens any typed MC
live.

**Every synthetic MC below is a docket number verified to have NO row in the
federal Licensing & Insurance file, and that is load-bearing, not cosmetic.**
MC numbers are allocated densely: a plausible-looking made-up docket almost
always belongs to a real company, and several are sole proprietors trading
under their own names. Since Verifier now pulls the live federal record for the
MC it is screening, a colliding docket would put a real, named business — or a
real person — on stage cast as the shell-ring fraudster. Before changing any MC
here, check it:

    curl 'https://data.transportation.gov/resource/6eyk-hxee.json?docket_number=MC880151'

An empty array is the only acceptable answer for anything without `real_mc`.

Exactly one docket on this board is real, and deliberately so: **MC-222428**,
A.N. Webber Logistics of Kankakee IL (DOT 314927). It is here so the SAFER retrieval on stage is a
genuine federal pull rather than a replay — every field the trace reads out is
public FMCSA record, re-checkable by hand at data.transportation.gov. It is
seeded as the LEGITIMATE party: its federal record is clean (broker authority
active, surety bond on file), and the fraud in the demo is the shell ring
posting a load under its docket with the ring's own phone number on it. No
claim is made about that company; the finding is against the posting.

Three fraud patterns are seeded deliberately:
  * the docket hijack — a real, licensed broker's federal docket on a posting
    whose contact phone belongs to the shell ring. Only pulling the registry
    copy and diffing it field by field catches that one;
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
    # The other two trucks in the yard. A dispatcher's fleet screen is "who is
    # where, on what, and how much clock have they got" — not an org chart of
    # our own software.
    "fleet": [
        {"id": "12", "driver": "M. Alvarez", "city": "Joliet IL",
         "lat": 41.525, "lon": -88.083, "status": "empty",
         "hos_left_h": 8.4, "mpg": 6.4, "trailer": "Dry van", "load": None},
        {"id": "07", "driver": "R. Okonkwo", "city": "Indianapolis IN",
         "lat": 39.7684, "lon": -86.1581, "status": "loaded",
         "hos_left_h": 4.1, "mpg": 6.1, "trailer": "Reefer",
         "load": {"id": "P-90377", "dest": "Nashville TN", "rate": 1180,
                  "broker": "Ohio Valley Logistics", "eta_h": 4.6}},
        {"id": "21", "driver": "T. Whitfield", "city": "Toledo OH",
         "lat": 41.6528, "lon": -83.5379, "status": "at dock",
         "hos_left_h": 6.7, "mpg": 5.9, "trailer": "Flatbed",
         "load": {"id": "P-90344", "dest": "Toledo OH", "rate": 940,
                  "broker": "Great Lakes Transfer", "eta_h": 0}},
    ],
    # Car hauling runs shorter and heavier than dry van, so the floor sits lower
    # than a van fleet's. At 1.45 the Rockford->Nashville lane died at $1.42.
    "floor_rpm": 1.35,
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
    "Madison WI": (43.0731, -89.4012), "Rockford IL": (42.2711, -89.0940),
    "Green Bay WI": (44.5133, -88.0133),
}

# PADD (fuel region) per state for EIA diesel lookups.
STATE_PADD = {"IL": "PADD 2", "IN": "PADD 2", "WI": "PADD 2", "OH": "PADD 2",
              "TN": "PADD 2", "KY": "PADD 2", "TX": "PADD 3", "PA": "PADD 1",
              "CO": "PADD 4", "MI": "PADD 2", "MO": "PADD 2", "IA": "PADD 2",
              "MN": "PADD 2", "GA": "PADD 1"}

BROKERS: list[dict] = [
    # --- the one REAL federal docket on this board ------------------------
    # Every field below is taken from the live FMCSA record: legal name and
    # bonded broker authority from Licensing & Insurance (6eyk-hxee), phone
    # from the Motor Carrier Census (az4n-8mr2), domain age from live RDAP.
    # `real_mc` routes fmcsa.* to the live QCMobile path; safer.* is keyless
    # and pulls live either way. The email stays on a reserved sandbox domain
    # so no run — live mail flags or not — can put a message on the wire.
    {"_key": "MC-222428", "name": "A.N. Webber Logistics, Inc.", "domain": "anwebber.com",
     "domain_age_days": 10230, "authority_age_days": 9800, "insurance": True, "oos": False,
     "phone": "800-435-0940", "ach": "RT-071000039", "prior_loads": 3, "avg_pay_days": 24,
     "unpaid": 0, "email": "dispatch@anwebber.example.com", "real_mc": True,
     "detention_claims": 1, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 3},
    # Three more REAL dockets, all confirmed live against Licensing & Insurance:
    # active bonded broker authority, bond on file. They are the CLEAN loads on
    # this board — the point is that a judge can look each one up on
    # safer.fmcsa.dot.gov and get the same answer the app just showed them.
    # Only real companies that PASS appear here; nothing real is ever cast as
    # the fraudster. Where a real docket is attached to a scam, the app says
    # "someone posing as" and blacklists the impostor's contact, not the docket.
    {"_key": "MC-114211", "name": "Warren Transport, Inc.", "domain": "warrentransport.com",
     "domain_age_days": 9900, "authority_age_days": 21900, "insurance": True, "oos": False,
     "phone": "319-233-6113", "ach": "RT-073900465", "prior_loads": 14, "avg_pay_days": 22,
     "unpaid": 0, "email": "dispatch@warrentransport.example.com", "real_mc": True,
     "detention_claims": 2, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 4},
    {"_key": "MC-107012", "name": "North American Van Lines, Inc.", "domain": "navl.com",
     "domain_age_days": 10800, "authority_age_days": 24000, "insurance": True, "oos": False,
     "phone": "260-429-2511", "ach": "RT-074000010", "prior_loads": 6, "avg_pay_days": 26,
     "unpaid": 0, "email": "dispatch@navl.example.com", "real_mc": True,
     "detention_claims": 1, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 6},
    {"_key": "MC-109533", "name": "TForce Freight, Inc.", "domain": "tforcefreight.com",
     "domain_age_days": 9200, "authority_age_days": 23000, "insurance": True, "oos": False,
     "phone": "800-333-7400", "ach": "RT-051000017", "prior_loads": 2, "avg_pay_days": 29,
     "unpaid": 0, "email": "dispatch@tforcefreight.example.com", "real_mc": True,
     "detention_claims": 0, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 9},
    {"_key": "MC-880151", "name": "Meridian Logistics Group", "domain": "meridianlogistics.example.com",
     "domain_age_days": 3410, "authority_age_days": 3650, "insurance": True, "oos": False,
     "phone": "312-555-0142", "ach": "RT-071000013", "prior_loads": 14, "avg_pay_days": 22,
     "unpaid": 0, "email": "dispatch@meridianlogistics.example.com", "real_mc": False,
     "detention_claims": 2, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 2},
    {"_key": "MC-600253", "name": "Great Lakes Transfer", "domain": "gltransfer.example.com",
     "domain_age_days": 2190, "authority_age_days": 2555, "insurance": True, "oos": False,
     "phone": "414-555-0188", "ach": "RT-075000019", "prior_loads": 6, "avg_pay_days": 31,
     "unpaid": 0, "email": "loads@gltransfer.example.com", "real_mc": False,
     "detention_claims": 1, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 6},
    {"_key": "MC-440058", "name": "Cardinal Dispatch Co", "domain": "cardinaldispatch.example.com",
     "domain_age_days": 1580, "authority_age_days": 1825, "insurance": True, "oos": False,
     "phone": "614-555-0121", "ach": "RT-041000124", "prior_loads": 9, "avg_pay_days": 47,
     "unpaid": 0, "email": "book@cardinaldispatch.example.com", "real_mc": False,
     # the detention staller: three claims filed, three denied, still owes waiting time
     "detention_claims": 3, "detention_denied": 3, "detention_unpaid": 450,
     "detention_stiff_days_ago": 34, "responds_in_h": 18},
    # --- the shell ring: three fronts, one phone, one bank account ---
    {"_key": "MC-1680087", "name": "Apex Freight Solutions", "domain": "apexfreightsol.example.net",
     "domain_age_days": 9, "authority_age_days": 11, "insurance": False, "oos": False,
     "phone": "469-555-0177", "ach": "RT-111900659", "prior_loads": 0, "avg_pay_days": 0,
     "unpaid": 0, "email": "ops@apexfreightsol.example.net", "real_mc": False,
     "detention_claims": 0, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 1},
    {"_key": "MC-1590044", "name": "Redline Brokerage", "domain": "redline-brokerage.example.co",
     "domain_age_days": 74, "authority_age_days": 96, "insurance": True, "oos": True,
     "phone": "469-555-0177", "ach": "RT-111900659", "prior_loads": 1, "avg_pay_days": 0,
     "unpaid": 4000, "unpaid_since_days": 21, "email": "billing@redline-brokerage.example.co",
     "real_mc": False, "detention_claims": 1, "detention_denied": 1, "detention_unpaid": 300,
     "responds_in_h": 1},
    {"_key": "MC-1710084", "name": "Sunbelt Freight Partners", "domain": "sunbeltfp.example.net",
     "domain_age_days": 21, "authority_age_days": 27, "insurance": False, "oos": False,
     "phone": "972-555-0104", "ach": "RT-111900659", "prior_loads": 0, "avg_pay_days": 0,
     "unpaid": 0, "email": "dispatch@sunbeltfp.example.net", "real_mc": False,
     "detention_claims": 0, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 1},
    # --- the lookalike: one character off Meridian, 12 days old, same bank as
    #     the shell ring. It never posts under its own MC — it posts under
    #     Meridian's and puts its own phone in the contact field. ---
    {"_key": "MC-1740450", "name": "Meridian Logistic Grp LLC", "domain": "meridian-logistics.example.com",
     "domain_age_days": 12, "authority_age_days": 14, "insurance": False, "oos": False,
     "phone": "312-555-0198", "ach": "RT-111900659", "prior_loads": 0, "avg_pay_days": 0,
     "unpaid": 0, "email": "dispatch@meridian-logistics.example.com", "real_mc": False,
     "lookalike_of": "MC-880151", "detention_claims": 0, "detention_denied": 0,
     "detention_unpaid": 0, "responds_in_h": 1},
    # ---
    {"_key": "MC-500035", "name": "Ohio Valley Logistics", "domain": "ohiovalleylog.example.com",
     "domain_age_days": 2920, "authority_age_days": 3285, "insurance": True, "oos": False,
     "phone": "513-555-0166", "ach": "RT-042000013", "prior_loads": 21, "avg_pay_days": 19,
     "unpaid": 0, "email": "dispatch@ohiovalleylog.example.com", "real_mc": False,
     "detention_claims": 4, "detention_denied": 0, "detention_unpaid": 0, "responds_in_h": 1},
    {"_key": "MC-770008", "name": "Keystone Load Co", "domain": "keystoneload.example.com",
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
    # Auto transport. Four lanes a judge can follow, each on a REAL federal
    # docket, so the SAFER retrieval in the Verifier is provably a live call:
    # look the MC up on safer.fmcsa.dot.gov and you get the same record.
    #
    # `units` is what is on the deck, `pickup` the window, `bid_only` a posting
    # with no rate (carrier bid). `cph`/`cem` are the contact printed on the
    # posting — Verifier cross-checks them against the registered contact for
    # the claimed MC, and that mismatch is the whole fraud tell.
    #
    # 1 — Chicago → Milwaukee · the honest short haul. Warren Transport.
    {"id": "P-90412", "mc": "MC-114211", "o": "Chicago IL", "d": "Milwaukee WI", "mi": 92, "dh": 41, "rate": 620, "eq": "Open car hauler", "units": "2 operable sedans", "pickup": "Demo day +1 · 8 AM–2 PM", "note": "Verified dealer · Demo", "posted_min": 12, "src": "DAT",
     "cph": "319-233-6113", "cem": "dispatch@warrentransport.example.com"},
    # the bait twin: same lane, same real docket on the posting, 90% over the
    # board rate — and a contact phone that is not Warren's.
    {"id": "P-90431", "mc": "MC-114211", "o": "Chicago IL", "d": "Milwaukee WI", "mi": 92, "dh": 41, "rate": 1180, "eq": "Open car hauler", "units": "2 operable sedans", "pickup": "Demo day +1 · flexible", "posted_min": 7, "src": "123LB",
     "cph": "312-555-0198", "cem": "dispatch@warren-transport.example.com"},
    # 2 — Madison → Indianapolis · A.N. Webber, honest. The contact phone on
    # this posting IS the number FMCSA has on file, and SAFER confirms it live.
    {"id": "P-90440", "mc": "MC-222428", "o": "Madison WI", "d": "Indianapolis IN", "mi": 329, "dh": 118, "rate": 1080, "eq": "3-car wedge", "units": "3 operable vehicles", "pickup": "Demo day +2", "note": "Quick Pay eligible · Demo", "posted_min": 23, "src": "DAT",
     "cph": "800-435-0940", "cem": "dispatch@anwebber.example.com"},
    # the docket hijack — the money shot. Same real MC, 71% over the lane, and
    # the callback number belongs to the shell ring. Nothing on the posting
    # says so; only the federal copy does.
    {"id": "P-90441", "mc": "MC-222428", "o": "Madison WI", "d": "Indianapolis IN", "mi": 329, "dh": 118, "rate": 1850, "eq": "3-car wedge", "units": "3 operable vehicles", "pickup": "Demo day +2 · urgent", "posted_min": 5, "src": "123LB",
     "cph": "469-555-0177", "cem": "ops@apexfreightsol.example.net"},
    # 3 — Rockford → Nashville · North American Van Lines, honest.
    {"id": "P-90419", "mc": "MC-107012", "o": "Rockford IL", "d": "Nashville TN", "mi": 575, "dh": 88, "rate": 1350, "eq": "Hotshot compatible", "units": "1 operable SUV", "pickup": "Demo day +3 · appointment", "note": "Direct · Demo", "posted_min": 6, "src": "123LB",
     "cph": "260-429-2511", "cem": "dispatch@navl.example.com"},
    # Redline's ring, on the number the memory graph already knows.
    {"id": "P-90418", "mc": "MC-1590044", "o": "Rockford IL", "d": "Nashville TN", "mi": 575, "dh": 88, "rate": 2100, "eq": "Hotshot compatible", "units": "1 operable SUV", "pickup": "Demo day +3 · today", "posted_min": 4, "src": "Truckstop",
     "cph": "469-555-0177", "cem": "billing@redline-brokerage.example.co"},
    # 4 — Green Bay → Des Moines · carrier bid, no posted rate. TForce.
    {"id": "P-90428", "mc": "MC-109533", "o": "Green Bay WI", "d": "Des Moines IA", "mi": 390, "dh": 148, "rate": 1150, "bid_only": True, "eq": "Winch required", "units": "1 inoperable pickup", "pickup": "Demo day +4–5", "note": "Equipment check · Demo", "posted_min": 16, "src": "DAT",
     "cph": "800-333-7400", "cem": "dispatch@tforcefreight.example.com"},
    # --- the rest of the board: what Finder throws out ------------------
    {"id": "P-90421", "mc": "MC-1710084", "o": "Chicago IL", "d": "Dallas TX", "mi": 967, "dh": 44, "rate": 3950, "eq": "7-car stinger", "units": "7 operable vehicles", "pickup": "Demo day +2", "posted_min": 3, "src": "123LB",
     "cph": "972-555-0104", "cem": "dispatch@sunbeltfp.example.net"},
    {"id": "P-90402", "mc": "MC-500035", "o": "Chicago IL", "d": "Cincinnati OH", "mi": 298, "dh": 41, "rate": 640, "eq": "Open car hauler", "units": "2 operable sedans", "pickup": "Demo day +2", "posted_min": 38, "src": "DAT",
     "cph": "513-555-0166", "cem": "dispatch@ohiovalleylog.example.com"},
    {"id": "P-90412b", "mc": "MC-114211", "o": "Chicago IL", "d": "Milwaukee WI", "mi": 92, "dh": 41, "rate": 620, "eq": "Open car hauler", "units": "2 operable sedans", "posted_min": 14, "src": "Truckstop", "dup_of": "P-90412",
     "cph": "319-233-6113", "cem": "dispatch@warrentransport.example.com"},
    {"id": "P-90396", "mc": "MC-770008", "o": "Rockford IL", "d": "Pittsburgh PA", "mi": 461, "dh": 88, "rate": 900, "eq": "3-car wedge", "units": "3 operable vehicles", "posted_min": 87, "src": "DAT",
     "cph": "717-555-0193", "cem": "ops@keystoneload.example.com"},
    {"id": "P-90423", "mc": "MC-440058", "o": "Chicago IL", "d": "Toledo OH", "mi": 244, "dh": 41, "rate": 525, "eq": "Open car hauler", "units": "1 operable sedan", "posted_min": 5, "src": "Truckstop",
     "cph": "614-555-0121", "cem": "book@cardinaldispatch.example.com"},
]

# 90-day average all-in linehaul $ per loaded mile ("BigQuery lane history").
LANES: dict[str, float] = {
    "Chicago IL→Milwaukee WI": 6.40, "Madison WI→Indianapolis IN": 3.21,
    "Rockford IL→Nashville TN": 2.31, "Green Bay WI→Des Moines IA": 2.86,
    "Chicago IL→Cincinnati OH": 2.12, "Chicago IL→Dallas TX": 4.05,
    "Rockford IL→Pittsburgh PA": 2.02, "Chicago IL→Toledo OH": 2.24,
}

# Episodic memory: what actually happened to THIS carrier. Verifier recalls by
# mc / ach / phone / domain and cites the event, not a score.
MEMORIES: list[dict] = [
    {"_key": "MEM-001", "kind": "unpaid", "mc": "MC-1590044", "ach": "RT-111900659",
     "phone": "469-555-0177", "amount": 4000, "days_ago": 21,
     "text": "Redline Brokerage took a Chicago→Nashville load 21 days ago and never paid "
             "the $4,000. Bank routing on the rate con was RT-111900659."},
    {"_key": "MEM-002", "kind": "shell_ring", "mc": "MC-1680087", "ach": "RT-111900659",
     "phone": "469-555-0177", "amount": 0, "days_ago": 19,
     "text": "Apex Freight Solutions called from the same 469-555-0177 number Redline used, "
             "two days after Redline went dark."},
    {"_key": "MEM-003", "kind": "detention_denied", "mc": "MC-440058", "amount": 450,
     "days_ago": 34,
     "text": "Cardinal Dispatch denied 3 detention claims and still owes $450 in waiting "
             "time — they argued we had no timestamped arrival notice."},
    {"_key": "MEM-004", "kind": "paid_well", "mc": "MC-880151", "amount": 0, "days_ago": 9,
     "text": "Meridian Logistics Group has paid 14 of 14 loads, averaging 22 days, and "
             "settled a 3-hour detention claim without argument."},
    {"_key": "MEM-005", "kind": "detention_denied", "mc": "MC-770008", "amount": 150,
     "days_ago": 61,
     "text": "Keystone Load Co refused a $150 detention claim because the driver had no "
             "proof of what time he rolled in."},
    {"_key": "MEM-006", "kind": "paid_well", "mc": "MC-222428", "amount": 0, "days_ago": 16,
     "text": "A.N. Webber Logistics has paid all 3 loads we ran for them, averaging 24 days, "
             "and every one was booked off the 800 number in their FMCSA record."},
]

# One closed, still-unpaid detention claim so the phone can show real money owed.
DETENTION_CLAIMS: list[dict] = [
    {"_key": "P-90290", "posting_id": "P-90290", "mc": "MC-440058",
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
