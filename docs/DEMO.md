# The demo — five taps, four emails, every claim checkable

Nothing here is pre-written. Every step leaves a **receipt**: an email in your
own inbox, or a record on a public federal website a judge can open themselves.

**Before you start**

```bash
curl -X POST https://lumper-backstop-1094415841088.us-central1.run.app/api/reset
```

Open `yordan@lumper.io` on a second screen. The emails arrive while you talk.

---

## The board

The truck starts in **Grand Rapids MI** — where you are. Every clean load sits
on a **real federal docket**: look the MC up on safer.fmcsa.dot.gov and you get
the same record the app just showed you.

| Load | Lane | Pays | Docket | What it is |
|---|---|---|---|---|
| P-90450 | Grand Rapids → Chicago | $980 | **MC-109533 TForce Freight** | Your home city. Real, clean. |
| P-90412 | Chicago → Milwaukee | $620 | **MC-114211 Warren Transport** | Real, clean. Take this one. |
| P-90431 | Chicago → Milwaukee | $1,180 | MC-114211 *hijacked* | Same docket, wrong callback. Blocked. |
| P-90440 | Madison → Indianapolis | $1,080 | **MC-222428 A.N. Webber** | Real, clean, contact matches. |
| P-90441 | Madison → Indianapolis | **$1,850** | MC-222428 *hijacked* | **The money shot.** |
| P-90428 | Green Bay → Des Moines | carrier bid | **MC-109533 TForce** | No posted rate. |
| P-90418 | Rockford → Nashville | $2,100 | Redline ring | Blocked from memory. |

**The two highest payers are traps. Bait pays best** — that is the whole reason
this crime works on a tired driver at 11 PM.

---

## Step 1 · "Find me a load" → it moves you to Dispatch

The app switches to **Dispatch** by itself, because the search is the agents'
work, not yours. Finder prices every posting against real route miles and real
diesel.

Every card says **NOT CHECKED YET**. Say so out loud:

> *"Nothing here has been screened. These are just postings — priced, not
> vetted. The check happens when I pick one."*

**The receipt:** tap **"see the posting"** on any card — the raw record as the
board handed it over, including `cph`, the callback number it claims.

## Step 2 · Tap P-90441 ($1,850) — the background check

The check runs **one row at a time** and waits for you.

Header: **"Someone posing as A.N. Webber Logistics, Inc."** — the company is
real and licensed; the *posting* is the forgery.

```
Does their phone number match the registry?
  posting says 469-555-0177 · SAFER says 800-435-0940 · MISMATCH
  number belongs to Apex Freight Solutions (MC-1680087)
```

**The receipt, and this is the moment:** scroll to **"The federal record we
read"** — A.N. WEBBER LOGISTICS, INC., DOT 314927, registered phone 800-435-0940.

> *"That is the live federal record. Open safer.fmcsa.dot.gov, look up USDOT
> 314927, and you will get the same thing. No key, no login."*

Hand them the keyboard — **Dispatch → type any real MC.** `MC-133655` returns
Schneider National, CLEAR. `MC-172829` returns no authority, no bond, REFUSE.
Neither is in our seed data.

Tap **Back to the board.**

## Step 3 · Take P-90412 — and the flow *stops*

Run the check on the $620 Chicago → Milwaukee load. It clears. Press
**"I want this load — send the offer."**

Closer emails the broker one line. **Then nothing else happens** — no
auto-booking, no invented negotiation. A human reads the reply.

> 📧 **Email 1 — "Chicago IL → Milwaukee WI (P-90412) — we'll take it at $620"**

Every message is subject-tagged `[to dispatch@warrentransport.example.com]` —
who it was really addressed to. **A redirected message must never read as one
that reached the broker.** Point at that tag.

## Step 4 · Paperwork → Log detention

Tap **Get my waiting time paid.** Payday runs the whole fight: GPS-stamped
clock, written notice at the free-window boundary, escalation, filed claim.

> 📧 **Email 2 — "Detention notice"** (timestamped arrival)
> 📧 **Email 3 — "Detention claim · $450.00"**

> *"ATRI put detention at $15.1 billion in 2023. 94.5% of fleets bill for it and
> fewer than half those invoices get paid — because nobody documented the
> arrival. That notice, sent at the boundary with a timestamp, is the document
> missing from every claim that ever got denied."*

## Step 5 · Upload POD → the invoice raises itself

Pick **Upload POD**, attach any photo, **Hand it to Payday**. Payday works out
who needs it and **raises the invoice off it** — linehaul plus the detention it
just won.

> 📧 **Email 4 — "Invoice INV-P-90412 — $1,070.00"** · `$620 + $450 detention`

> *"Nobody typed that invoice. The document did it."*

---

## The three sentences, if you only get three

1. **"Every load was checked against the live federal register — and you can
   verify any of it yourself in ten seconds."**
2. **"The scam loads pay the most. That is why this problem exists."**
3. **"Detention is $15.1 billion a year and fewer than half of billed claims get
   paid, because nobody writes down when the truck arrived. We write it down,
   automatically, with GPS."**

## The one honest caveat — say it

**The load board is the only simulated feed.** DAT and Truckstop need signed
vendor agreements. The adapter is production-shaped and the trace labels it
`SANDBOX` every time. The federal record, routing, diesel and mail are live, and
every tool call says which.

## If something goes wrong

| Symptom | Do this |
|---|---|
| Board stale / blacklist full | `POST /api/reset` |
| No email arrives | Check `MAIL_LIVE=true`, `lumper.io` allowlisted, Resend key set |
| A federal call is slow | Live FMCSA call. On failure it says **"SAFER unreachable — federal check NOT made"** and degrades to REVIEW — it never silently clears a broker |
| Detention shows **ESTIMATE** | The phone is timing it because the desk is unreachable |
