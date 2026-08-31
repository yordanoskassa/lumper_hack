# The demo — 5 taps, 4 emails, every claim checkable

**Reset first:**

```bash
curl -X POST https://lumper-backstop-1094415841088.us-central1.run.app/api/reset
```

Open `yordan@lumper.io` on a second screen. The emails land while you talk.

---

## The board

Truck starts in **Grand Rapids MI**. Every docket is a **real company**,
verified live against FMCSA — search any name or MC on safer.fmcsa.dot.gov.

| Load | Lane | Pays | Company | MC / DOT |
|---|---|---|---|---|
| P-90418 | Rockford → Nashville | $2,100 | North American Van Lines | MC-107012 · *hijacked* |
| **P-90441** | Madison → Indianapolis | **$1,850** | A.N. Webber Logistics | MC-222428 · *hijacked* |
| P-90431 | Chicago → Milwaukee | $1,180 | Warren Transport | MC-114211 · *hijacked* |
| P-90422 | Grand Rapids → Indianapolis | $1,150 | Schneider National | MC-133655 · clean |
| P-90428 | Green Bay → Des Moines | carrier bid | C.H. Robinson | MC-384859 · clean |
| P-90440 | Madison → Indianapolis | $1,080 | A.N. Webber Logistics | MC-222428 · clean |
| P-90450 | Grand Rapids → Chicago | $980 | TForce Freight | MC-109533 · clean |
| **P-90412** | Chicago → Milwaukee | **$620** | Warren Transport | MC-114211 · clean |

**The three highest payers are all traps.** Bait pays best — that is the whole
reason this crime works on a tired driver at 11 PM.

---

## 1 · "Find me a load" → lands you in Dispatch

The app moves you to **Dispatch** by itself: the search is the agents' job.
Finder prices every posting on real route miles and real diesel.

Every card says **NOT CHECKED YET**. Say it out loud:

> *"Nothing here is screened. These are postings — priced, not vetted. The
> check happens when I pick one."*

Tap **"see the posting"** on any card: the raw record as the board handed it
over, including `cph`, the callback number it claims.

## 2 · Tap P-90441 ($1,850) — the background check

It runs one row at a time and waits for you. Header reads
**"Someone posing as A.N. Webber Logistics, Inc."** — the company is real and
licensed; the *posting* is the forgery.

```
Does their phone number match the registry?
  posting says 469-555-0177 · SAFER says 800-435-0940 · MISMATCH
  number belongs to Apex Freight Solutions (MC-1680087)
```

**The receipt:** scroll to **"The federal record we read"** — A.N. WEBBER
LOGISTICS, INC., DOT 314927, registered phone 800-435-0940.

> *"That is the live federal record. Open safer.fmcsa.dot.gov, look up USDOT
> 314927, same answer. No key, no login."*

Then hand them the keyboard — **Dispatch → type any real MC.** `MC-133655`
returns Schneider, CLEAR. `MC-172829` returns no authority, no bond, REFUSE.

Tap **Back to the board.**

## 3 · Take P-90412 ($620) — and the flow *stops*

Run the check; it clears. Press **"I want this load — send the offer."**

Closer emails the broker one line. **Then nothing else happens** — no
auto-booking, no invented negotiation. A human reads the reply.

> 📧 **1 — "Chicago IL → Milwaukee WI (P-90412) — we'll take it at $620"**

Every message is subject-tagged `[to dispatch@warrentransport.example.com]` —
who it was really addressed to. Point at that tag: a redirected message must
never read as one that reached the broker.

## 4 · Paperwork → "Log detention from my GPS"

One tap. Your line appears in the Dispatch thread, and Payday answers there.

> 📧 **2 — "Detention notice"** (timestamped arrival)
> 📧 **3 — "Detention claim · $450.00"**

> *"ATRI put detention at $15.1 billion in 2023. 94.5% of fleets bill for it,
> fewer than half those invoices get paid — because nobody documented the
> arrival. That notice, sent at the boundary with a timestamp, is the document
> missing from every claim that ever got denied."*

*(There is a second button — **Log detention with evidence** — if you want to
attach a dock photo. Same claim, your photo on it.)*

## 5 · Paperwork → "Upload POD"

Attach any photo, **Hand it to Payday.** It reads what it is, works out who
needs it, and **raises the invoice off it**.

> 📧 **4 — "Invoice INV-P-90412 — $1,070.00"** · `$620 linehaul + $450 detention`

> *"Nobody typed that invoice. The document did it."*

## 6 · Money → the loop (20s, optional)

Slow payers and denied claims. Back on Loads, that history shows on the card
before the driver ever taps it. Nobody wrote those warnings — Payday recorded
the behaviour, Verifier read it back, Finder surfaced it.

---

## Three sentences, if you only get three

1. **"Every load was checked against the live federal register — and you can
   verify any of it yourself in ten seconds."**
2. **"The scam loads pay the most. That is why this problem exists."**
3. **"Detention is $15.1 billion a year and fewer than half of billed claims get
   paid, because nobody writes down when the truck arrived. We write it down,
   automatically, with GPS."**

## The honest caveats — say them before you're asked

- **The load board is the only simulated feed.** DAT and Truckstop need signed
  vendor agreements. The adapter is production-shaped; the trace says `SANDBOX`
  every time. Federal record, routing, diesel and mail are live.
- **Victims are real, fraudsters are invented.** Every company on the board is a
  real licensed broker. The scam postings are hijacks of those real dockets, and
  the impostor identities behind the phone numbers are fictional by design — we
  will not put a real company's name on a crime.

## If something breaks

| Symptom | Do this |
|---|---|
| Board stale / everything blocked | `POST /api/reset` |
| No email | `MAIL_LIVE=true`, `lumper.io` allowlisted, Resend key set |
| Federal call slow | Live FMCSA call. On failure: **"SAFER unreachable — federal check NOT made"**, degrades to REVIEW. It never silently clears a broker |
| Detention shows **ESTIMATE** | Phone is timing it because the desk is unreachable |
