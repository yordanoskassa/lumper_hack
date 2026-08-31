# Lumper Backstop — the freight desk that fights for you

**Track: The Fortified Enterprise Fleet.** Four agents and an orchestrator that
find a load, prove the broker is real against the live federal record, negotiate
it, run the trip, and then fight for every dollar the load actually earned —
including the hours the driver spent waiting at a dock. Every tool call is
discoverable, identity-checked, policy-routed, armored, and traced.

Built by **[Maze Builders LLC](https://mazebuilders.com)**, on the same problem our
real product solves:
small carriers lose real money to fraud and to unpaid detention because nobody
has time to chase it. Backstop is that chase, automated.

**Built with Google Gemini** · `gemini-3.5-flash` via the Google GenAI SDK ·
running on Google Cloud Run.

> ### About the data on this board
>
> **Every load posting in this project is fabricated.** No real load, rate,
> shipment, or transaction is shown anywhere in the demo. The load-board feed is
> the one simulated component (see [What's real](#whats-real-and-the-one-thing-we-simulate)),
> because DAT, Truckstop and 123Loadboard require signed vendor agreements.
>
> **The broker companies named in the demo are real, active, bonded brokers, and
> they appear here only as the *victims* of a fabricated impersonation.** No
> wrongdoing by any named company is depicted, alleged, or implied. Where a
> fabricated posting carries a real docket, the app states on screen that the
> company is real and the *posting* is the forgery — "someone posing as" — and
> refusing the load blacklists the impostor's contact details, never the docket
> holder. That is also how the real crime works: double brokering hijacks a
> legitimate carrier's identity, and the legitimate carrier is the party harmed.
>
> **The fraud indicators are fictional.** The mismatched callback numbers, the
> shell-company identities, the bank routing numbers, and this carrier's payment
> history with these brokers are all invented. What is *not* invented is the
> federal record we compare against: name, USDOT, address, registered phone,
> authority status and bond come from a live, keyless call to FMCSA's public
> Licensing & Insurance and Motor Carrier Census datasets.
>
> No affiliation with, or endorsement by, any named company is claimed. Every
> record shown is public information published by the FMCSA.

**Live app:** https://lumperbackstop.netlify.app — the driver's phone, installable, no app store.

**Live API:** https://lumper-backstop-1094415841088.us-central1.run.app/api/health

Screen any real broker against the live federal register, straight from the
deployed service — no key, no login:

```bash
curl -s -X POST https://lumper-backstop-1094415841088.us-central1.run.app/api/screen \
  -H 'content-type: application/json' -d '{"mc":"MC-133655"}'
# SCHNEIDER NATIONAL CARRIERS, INC. · CLEAR · USDOT 264184

curl -s -X POST https://lumper-backstop-1094415841088.us-central1.run.app/api/screen \
  -H 'content-type: application/json' -d '{"mc":"MC-172829"}'
# BONES TRANSPORTATION, INC. · REFUSE · no broker authority, no surety bond
```

---

## The two problems, in money

**Waiting.** A driver reaches a dock, and the clock starts. The first two hours
are free; after that the broker owes detention. ATRI put the 2023 bill at
**$15.1 billion** — $3.6B direct, $11.5B in lost productivity — with drivers
detained on **39.3% of all stops**. **94.5% of fleets bill for detention, and
fewer than half those invoices get paid**, because nobody documented the arrival
properly. That gap is the product.

**Fraud.** **75–80% of US shipments** move through load boards, and double
brokering and fictitious pickups are among the most frequent US theft types.
Cargo theft losses hit an estimated **$725 million in 2025, up 60% in a year**.

Sources, with the figures we could *not* verify explicitly flagged: [`docs/STATS.md`](docs/STATS.md).

---

## What you see in three minutes

Open the app on a phone — it is one responsive PWA, installable, no app store.

1. **"Find me a load."** Finder pulls the board, prices every posting against real
   drive miles, real diesel, and this lane's history, and kills the ones that
   don't clear a profit. The highest-paying loads on the board are all traps.
2. **Tap one.** Verifier runs a live background check in front of you. It pulls
   the **real federal SAFER record** for that MC and diffs it, field by field,
   against what the posting claims.
3. **The catch.** The scam load posts under a *real* broker's docket, with a
   lookalike phone, email and domain:

   > `posting says 469-555-0177 · SAFER says 800-435-0940 · MISMATCH`
   > `469-555-0177 belongs to an entity registered 9 days ago`
   > `memory · same number Redline used, two days after Redline went dark`

   Refusing blacklists the impostor, not the real broker whose docket was hijacked.
4. **Take the clean one, drive, arrive.** Hitting *I'm at the dock* stamps a
   GPS-verified arrival. The free window burns down, the meter starts, and Payday
   emails the broker a timestamped notice at the boundary — *the document missing
   from every claim they ever denied* — then escalates on a real backoff and files
   the claim.
5. **Snap the paperwork.** Vision reads the POD, the GPS is matched against the
   delivery point, the invoice goes out, and the money comes back. The payment
   behaviour is written back to the graph, so Verifier is smarter next time.

Everything above runs against live services. Nothing on those screens is pre-written.

---

## The fleet

| Agent | Job | Tools it actually calls |
|---|---|---|
| **Dispatch** | Orchestrator + the chat you talk to | Gemini function-calling router, event bus, task scheduler, run state |
| **Finder** | Finds the money | Load-board adapters, ELD position + HOS, Maps Routes + Geocoding, EIA diesel by PADD, lane history, Gemini shortlist |
| **Verifier** | Proves the broker is real | **SAFER federal retrieval (keyless, live)**, posting-vs-registry cross-check, FMCSA QCMobile, callback-contact cross-check, RDAP domain age, Memory Bank recall, Model Armor, Document AI diff, Gemini verdict |
| **Closer** | Closes the deal | Lane comps anchor, Gemini counter-offer, bounded retry + backoff on broker silence, voice approval, Resend (allowlisted) / Outbox, locked-terms write, Routes + NWS reroute |
| **Payday** | Gets the money | GPS geofence detention clock, timestamped broker notice, bounded escalation + claim filing, Vision POD read + GPS match, invoice PDF + factoring packet, aging tracker, Gemini claim drafting |

**The closed loop.** Payday teaches Verifier — how a broker actually paid, and
whether they fought the detention claim, becomes next week's risk score. Verifier
teaches Finder — a refused broker is filtered before Finder spends an API call on
them. A load card will tell a driver *"they fought 3 waiting-time claims — hit
ARRIVED the second you're on their property."* Nobody wrote that sentence; it
falls out of the loop.

---

## Architecture

```mermaid
flowchart TB
    subgraph Client["Driver's phone / browser — installable PWA"]
        UI["React 19 · Tailwind v4 · shadcn/ui<br/>Loads · My run · Paperwork · Money"]
    end

    subgraph Cloud["Google Cloud Run — FastAPI container"]
        DISPATCH["<b>DISPATCH</b> — orchestrator<br/>Gemini function-calling router"]

        subgraph Fleet["The four worker agents"]
            FINDER["<b>FINDER</b><br/>finds loads, money math"]
            VERIFIER["<b>VERIFIER</b><br/>proves the broker is real"]
            CLOSER["<b>CLOSER</b><br/>negotiates, runs the trip"]
            PAYDAY["<b>PAYDAY</b><br/>detention clock, POD, invoice"]
        end

        subgraph Platform["Enterprise platform layer"]
            REGISTRY["Agent Registry<br/>discovery + versioning"]
            IDENTITY["Agent Identity<br/>short-lived signed tokens"]
            GATEWAY["Agent Gateway<br/>scope check on every call"]
            ARMOR["Model Armor<br/>injection + hidden-text screen"]
            RUNTIME["Agent Runtime<br/>long-running async runs"]
            OBS["Observability<br/>audit log + SSE trace"]
        end
    end

    subgraph Models["Google AI"]
        GEMINI["Gemini 3.5 Flash<br/>via Google GenAI SDK"]
    end

    subgraph External["External data — every call labelled live / sandbox / cached"]
        SAFER["FMCSA SAFER<br/>L&amp;I + Census · keyless"]
        MAPS["Google Maps<br/>Routes + Geocoding"]
        EIA["EIA weekly diesel"]
        RDAP["RDAP domain age"]
        NWS["NWS weather"]
        BOARD["Load board adapter<br/><i>the one simulated feed</i>"]
    end

    MEM[("Memory Bank<br/>broker graph · lanes · claims<br/>MongoDB, JSON fallback")]

    UI -->|"REST + SSE"| DISPATCH
    DISPATCH --> FINDER & VERIFIER & CLOSER & PAYDAY
    FINDER & VERIFIER & CLOSER & PAYDAY -->|"every tool call"| GATEWAY
    GATEWAY --> IDENTITY
    GATEWAY --> ARMOR
    GATEWAY --> OBS
    GATEWAY --> SAFER & MAPS & EIA & RDAP & NWS & BOARD
    DISPATCH & FINDER & VERIFIER & CLOSER & PAYDAY --> GEMINI
    RUNTIME -.->|"wakes runs over simulated days"| PAYDAY & CLOSER
    VERIFIER <--> MEM
    PAYDAY -->|"how they actually paid"| MEM
    REGISTRY -.->|"publishes cards + scopes"| Fleet
    OBS -->|"live trace"| UI
```

**The closed loop.** Payday records how a broker actually paid and whether they
fought the detention claim; Verifier reads it back on the next screen; Finder
never spends an API call on a broker Verifier refused. A load card telling a
driver *"they fought 3 waiting-time claims — hit ARRIVED the second you're on
their property"* is that loop, surfaced.

---

## Gemini Enterprise Agent Platform pillars

| Pillar | Where it lives | What it does |
|---|---|---|
| **Agent Registry** | `platform/registry.py`, Registry view | Discovery + versioning; publishes each agent's card and the scopes it may use |
| **Agent Identity** | `platform/identity.py` | Zero-trust: each agent holds a short-lived signed token that auto-renews before expiry |
| **Agent Gateway** | `platform/gateway.py` | Every tool call routes through one choke point that checks identity + scope, then traces it |
| **Model Armor** | `platform/armor.py` | Screens untrusted documents for prompt injection and hidden text **before** any model reads them |
| **Agent Runtime** | `platform/runtime.py` | Long-running async runs that survive simulated days, waking on events and schedules |
| **Memory Bank** | `platform/memory.py` | Persistent broker graph, lane history, and run state (MongoDB, JSON fallback) |
| **Observability** | `platform/observability.py`, Live trace | Every utterance, tool call, policy decision and armor verdict is streamed and audit-logged |

---

## What's real, and the one thing we simulate

Judges have seen a thousand fake demos, so here is the line.

**Live with no key at all:** the **SAFER federal record** (Licensing & Insurance
+ Motor Carrier Census) — the retrieval behind the callback cross-check — plus
**RDAP** domain age and **NWS** weather.

**Live the moment their free key is set:** Gemini, Google Maps Routes +
Geocoding, EIA diesel by PADD, FMCSA QCMobile.

**Real regardless of any key:** Model Armor, the zero-trust Gateway, the Memory
Bank graph write-back, the detention clock, and the full trace.

**Simulated: exactly one thing — the load-board feed.** DAT / Truckstop /
123Loadboard require signed vendor agreements, so the adapter layer is
production-shaped (`tools/loadboards.py`) and the sandbox replays a seeded board.
Set `LOADBOARD_ADAPTER=dat` with credentials and nothing else changes.

Every tool call surfaces its backend in the trace — `LIVE`, `SANDBOX`, `CACHED`
or `TEMPLATE` — so an estimate can never be mistaken for a measurement. Where the
phone times a detention clock itself because the desk is unreachable, it says
**ESTIMATE** on screen.

**Outbound email is off by default.** Live sending needs a key *and*
`MAIL_LIVE=true` *and* the recipient's domain on an allowlist, and reserved
sandbox domains are refused even then. Nothing in the demo emails a real person.

**On the MC numbers.** Every "fictional" docket in the seed was checked against
Licensing & Insurance and replaced until it returned empty. MC numbers are
allocated densely, and the originals belonged to real businesses and private
individuals — who would otherwise have appeared on stage, from a live federal
lookup, cast as a fraud ring. `data/seed.py` carries the curl to re-check.

No customer data is used. Broker names and domains are synthetic (`.example.*`).

---

## Reproducible testing

Every claim below is a command you can run and an output you can check against a
source we do not control. **No key, no login, no install for the first three.**

### 1 · The service is up and reports its own capabilities

```bash
curl -s https://lumper-backstop-1094415841088.us-central1.run.app/api/health
```

Returns `"fmcsa": true`, `"loadboard": "sandbox"` — the app states, on every
boot, which feeds are live and which one is simulated.

### 2 · Screen a real broker against the live federal register

```bash
curl -s -X POST https://lumper-backstop-1094415841088.us-central1.run.app/api/screen \
  -H 'content-type: application/json' -d '{"mc":"MC-133655","explain":false}'
```

→ `SCHNEIDER NATIONAL CARRIERS, INC.` · **CLEAR** · USDOT 264184

```bash
curl -s -X POST https://lumper-backstop-1094415841088.us-central1.run.app/api/screen \
  -H 'content-type: application/json' -d '{"mc":"MC-172829","explain":false}'
```

→ `BONES TRANSPORTATION, INC.` · **REFUSE** · USDOT 247861 · no broker
authority, no surety bond

Neither MC is in our seed data. Substitute any docket you like.

### 3 · Check us against the federal source directly

This is the test that matters: compare our output to FMCSA's own API, which we
have no control over.

```bash
# Licensing & Insurance — name, address, authority, bond
curl -s 'https://data.transportation.gov/resource/6eyk-hxee.json?docket_number=MC114211'

# Motor Carrier Census — the registered phone the callback check uses
curl -s 'https://data.transportation.gov/resource/az4n-8mr2.json?dot_number=1896'
```

→ `WARREN TRANSPORT, INC.` · DOT 00001896 · 3124 TITAN TRAIL, WATERLOO IA 50701
· `broker_stat: A` · `bond_file: Y` · `phone: 3192336113`

Now screen the same docket through the app (`{"mc":"MC-114211"}`) and compare
field by field. They match because it is the same live call.

### 4 · The fraud detection, reproduced

Two postings, the **same real docket**. The only difference is the callback
number printed on the posting.

```bash
# honest posting
curl -s -X POST .../api/screen -d '{"mc":"P-90440","explain":false}'
# → CLEAR · "posting contact matches the registered contact"

# hijacked posting
curl -s -X POST .../api/screen -d '{"mc":"P-90441","explain":false}'
# → REFUSE · "posting says 469-555-0177 · SAFER says 800-435-0940 · MISMATCH"
```

The registry phone in that output is fetched live at request time. Change the
seeded `cph` in `data/seed.py` and the verdict changes with it.

### 5 · The whole flow, end to end

```bash
B=https://lumper-backstop-1094415841088.us-central1.run.app
curl -s -X POST $B/api/reset                                     # clean seed
curl -s $B/api/loads                                             # the board
curl -s -X POST $B/api/interest -H 'content-type: application/json' \
  -d '{"posting_id":"P-90412"}'                                  # offer email
curl -s -X POST $B/api/detention/request -H 'content-type: application/json' \
  -d '{"posting_id":"P-90412"}'                                  # notice + claim
curl -s -X POST $B/api/document -H 'content-type: application/json' \
  -d '{"posting_id":"P-90412","doc_type":"pod","filename":"pod.jpg"}'
```

The last call returns the raised invoice: `INV-P-90412`, linehaul plus the
detention Payday just won. Each step reports `"backend": "live"` or `"sandbox"`
so you can see which is which.

### 6 · Locally, with the tests the app runs on itself

```bash
git clone https://github.com/yordanoskassa/lumper_hack.git && cd lumper_hack
cp .env.example .env          # every key optional
bash scripts/dev.sh
curl -X POST 127.0.0.1:8787/api/reset
```

Then repeat steps 2–5 against `127.0.0.1:8787`. Same code path, same live
federal calls — `GEMINI_API_KEY` only changes whether the prose summary is
written by Gemini or omitted.

### What is synthetic, so you can tell the halves apart

The federal identity is real and live. **Our carrier's relationship with these
brokers is not**, and it cannot be:

| Field | Source |
|---|---|
| Legal name, DOT, address, registered phone, authority, bond | **LIVE** — FMCSA |
| Broker email domain (`*.example.com`) | **Synthetic** — reserved domain, so no agent can email a real company |
| ACH routing numbers | **Synthetic** — real bank details are not public |
| "14 prior loads, pays in 22 days", detention history | **Synthetic** — we have no trading history with these carriers |
| The load postings themselves | **Sandbox** — DAT/Truckstop need signed vendor agreements |

Every tool call is tagged `LIVE` / `SANDBOX` / `CACHED` / `TEMPLATE` in the
trace, so this table is enforced in the product, not just documented here.

---

## Run it

### Locally

```bash
git clone https://github.com/yordanoskassa/lumper_hack.git
cd lumper_hack
cp .env.example .env          # add any keys you have; all are optional
bash scripts/dev.sh
```

Backend → http://127.0.0.1:8787 · Frontend → **http://127.0.0.1:5180**

Use `127.0.0.1`, not `localhost` — `localhost` resolves to IPv6 first and any
other dev server on your machine may answer there instead.

The phone view is the same URL on your network, or add it to your home screen.
Requires Python 3.12 and Node 20+. MongoDB is optional; without it the Memory
Bank falls back to a JSON snapshot.

**Every key is optional.** With a key the tool runs live; without one the same
code path runs a labelled fallback, and the trace says which. `GEMINI_API_KEY`
is the only one worth setting for a first run — SAFER, RDAP, NWS and EIA diesel
are all live with no key at all.

### On Google Cloud Run

```bash
# one time — these need your own Google login
#   https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

export GEMINI_API_KEY=...          # and optionally GOOGLE_MAPS_API_KEY, MONGO_URI
bash scripts/deploy.sh
```

On a brand-new project the default compute service account has no rights over
its own build bucket, and `--source` deploys fail with a permission error rather
than a useful one. Grant it once:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
for role in cloudbuild.builds.builder storage.objectViewer \
            artifactregistry.writer logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/$role"
done
```

If your account sits under a Google Cloud organization, domain-restricted
sharing will also refuse `allUsers`, so the service deploys but stays private.
Allow it for this project only:

```bash
gcloud services enable orgpolicy.googleapis.com --project "$PROJECT"
cat > /tmp/drs.yaml <<YAML
name: projects/$PROJECT/policies/iam.allowedPolicyMemberDomains
spec:
  rules:
  - allowAll: true
YAML
gcloud org-policies set-policy /tmp/drs.yaml --project "$PROJECT"
gcloud run services add-iam-policy-binding SERVICE --region REGION \
  --member=allUsers --role=roles/run.invoker
```

The script enables Cloud Run, Cloud Build and Vertex AI, builds
`backend/Dockerfile` from source, deploys the service, and prints the live URL.
Secrets are passed as deploy-time environment variables and never baked into the
image. `MAIL_LIVE` stays `false`: these agents draft and send on their own
initiative, and live sending additionally requires a key *and* the recipient's
domain on an allowlist.

Point the frontend at the deployed backend:

```bash
VITE_API_BASE=https://YOUR-SERVICE.run.app npm --prefix frontend run build
```

### As a public site — Netlify + EasyPanel

The frontend deploys to Netlify ([`netlify.toml`](netlify.toml) is already
wired) and the backend container to EasyPanel; point `VITE_API_BASE` at the
backend and rebuild. Step-by-step: [`docs/DEPLOY.md`](docs/DEPLOY.md).

### Demo

[`docs/DEMO.md`](docs/DEMO.md) walks the whole flow and names, for each step,
the tab that holds the artifact proving it.

**Stack** (same as our production app): FastAPI · Google GenAI SDK ·
Gemini 3.5 Flash · MongoDB (motor) · httpx · ReportLab · React 19 + Vite +
TypeScript + Tailwind v4 + shadcn/ui · deployed on Google Cloud Run.

---

<div align="center">

**Lumper Backstop** — built with Google Gemini for the All Things Agentic Hackathon
(Fortified Enterprise Fleet).

© 2026 **[Maze Builders LLC](https://mazebuilders.com)**. All rights reserved.

</div>
