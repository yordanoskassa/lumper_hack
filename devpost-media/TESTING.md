# Devpost → Testing Instructions (judge-only field)

Paste the block below into Devpost's optional "Testing Instructions" field.

---

**Live app (start here):** https://lumperbackstop.netlify.app
**API:** https://lumper-backstop-1094415841088.us-central1.run.app
**Repo:** https://github.com/yordanoskassa/lumper_hack

**No credentials needed.** Nothing to install for steps 1–3. There is no login,
no account, and no API key required to verify the core claim.

---

**1 · Confirm the federal lookup is a real live call (30 seconds)**

Screen any US broker docket you choose:

```
curl -s -X POST https://lumper-backstop-1094415841088.us-central1.run.app/api/screen \
  -H 'content-type: application/json' -d '{"mc":"MC-133655","explain":false}'
```

→ SCHNEIDER NATIONAL CARRIERS, INC. · CLEAR · USDOT 264184
Try `MC-172829` → BONES TRANSPORTATION, INC. · REFUSE · no broker authority, no
surety bond. Neither is in our seed data — substitute any docket.

**2 · Check us against a source we do not control**

```
curl -s 'https://data.transportation.gov/resource/6eyk-hxee.json?docket_number=MC114211'
curl -s 'https://data.transportation.gov/resource/az4n-8mr2.json?dot_number=1896'
```

→ WARREN TRANSPORT, INC. · DOT 1896 · 3124 TITAN TRAIL, WATERLOO IA · broker
authority A · bond Y · phone 3192336113

Screen `MC-114211` through the app and compare field by field. Identical,
because it is the same live FMCSA call.

**3 · The fraud detection, reproduced**

Two postings on the SAME real docket. Only the callback number differs.

```
{"mc":"P-90440"} → CLEAR   · "posting contact matches the registered contact"
{"mc":"P-90441"} → REFUSE  · "posting says 469-555-0177 · SAFER says
                              800-435-0940 · MISMATCH"
```

That mismatch is the classic double-brokering tell, caught against the live
federal record. Refusing blacklists the impostor's contact, never the real
docket holder — the UI says "someone posing as".

**4 · The full agent flow**

```
B=https://lumper-backstop-1094415841088.us-central1.run.app
curl -s -X POST $B/api/reset
curl -s $B/api/loads
curl -s -X POST $B/api/interest -H 'content-type: application/json' -d '{"posting_id":"P-90412"}'
curl -s -X POST $B/api/detention/request -H 'content-type: application/json' -d '{"posting_id":"P-90412"}'
curl -s -X POST $B/api/document -H 'content-type: application/json' -d '{"posting_id":"P-90412","doc_type":"pod","filename":"pod.jpg"}'
```

The last call returns invoice INV-P-90412 — linehaul plus the detention the
agent just won. Read every message the agents wrote, in full, at
`GET $B/api/outbox`, or in the UI under Paperwork → Documents.

**5 · Running it yourself**

```
git clone https://github.com/yordanoskassa/lumper_hack.git && cd lumper_hack
cp .env.example .env      # every key is optional
bash scripts/dev.sh       # backend 8787, frontend 5180
curl -X POST 127.0.0.1:8787/api/reset
```

Requires Python 3.12 and Node 20+. MongoDB optional (JSON snapshot fallback).
Repeat steps 1–4 against 127.0.0.1:8787. `GEMINI_API_KEY` only changes whether
the prose summary is Gemini-written or omitted; the checks run either way.

---

**What is real and what is not — please hold us to this**

- LIVE, no key: FMCSA SAFER (Licensing & Insurance + Motor Carrier Census),
  RDAP domain age, NWS weather.
- LIVE with a free key: Gemini, Google Maps Routes/Geocoding, EIA diesel.
- SYNTHETIC: broker email domains (all `*.example.com`, a reserved domain, so no
  agent can email a real company), ACH routing numbers, and our carrier's
  payment/detention history with these brokers. We have no trading relationship
  with them and will not fabricate one that looks real.
- SIMULATED — exactly one feed: the load board. DAT/Truckstop/123Loadboard
  require signed vendor agreements. The adapter is production-shaped
  (`tools/loadboards.py`); `LOADBOARD_ADAPTER=dat` plus credentials changes
  nothing else.
- Every load posting is FABRICATED. No real load, rate, shipment or transaction
  appears anywhere in this project.
- Every broker company named on the board is a REAL, active, bonded broker,
  verified live before it was seeded — and each appears ONLY as the victim of a
  fabricated impersonation. No wrongdoing by any named company is depicted,
  alleged or implied. The app says so on screen ("someone posing as"), and
  refusing a load blacklists the impostor's contact, never the docket holder.
  That is how double brokering actually works: it hijacks a legitimate carrier's
  identity, and that carrier is the party harmed. No affiliation with or
  endorsement by any named company is claimed; every record shown is public
  FMCSA information.

Every tool call is tagged LIVE / SANDBOX / CACHED / TEMPLATE in the trace, so
the distinctions above are enforced in the product, not just claimed here.

**Outbound email** is triple-locked: a Resend key, `MAIL_LIVE=true`, AND the
recipient domain on an allowlist — and reserved sandbox domains are refused even
then. The deployed demo redirects agent mail to the operator's own inbox, and
every redirected message says so in its subject line.
