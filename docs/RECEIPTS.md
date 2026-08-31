# The receipts

Every claim Backstop makes, and the exact place you go to prove it. Open these
tabs **before** you start.

| # | Tab | URL |
|---|---|---|
| 1 | Backstop | `http://127.0.0.1:5180` |
| 2 | FMCSA SAFER | https://safer.fmcsa.dot.gov/CompanySnapshot.aspx |
| 3 | FMCSA L&I | https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist |
| 4 | EIA diesel | https://www.eia.gov/petroleum/gasdiesel/ |
| 5 | Your inbox | wherever `yordan@lumper.io` lands |
| 6 | Cloud Run | https://console.cloud.google.com/run?project=lumper-backstop-0831 |

---

## Receipt 1 — the broker is real, the posting is not

**In Backstop:** tap the **$1,395 Joliet → Columbus**. Verifier says
*"someone posing as A.N. Webber Logistics, Inc."* and shows:

```
posting says 469-555-0177 · SAFER says 800-435-0940 · MISMATCH
A.N. WEBBER LOGISTICS, INC. · USDOT 314927
2150 S. ROUTES 45/52 KANKAKEE IL 60901
```

**→ Tab 2, SAFER.** Search by **USDOT Number**, enter **`314927`**.

You get: A.N. WEBBER LOGISTICS, INC. · 2150 S. ROUTES 45/52, KANKAKEE, IL 60901
· phone **(800) 435-0940**.

> "Same company. Same address. Same phone. That's the federal register, not our
> database. The posting on that load had a different number underneath a real
> company's docket — and that's what double-brokering looks like."

**→ Tab 3, L&I** for the authority and the bond. Search **MC** = **`222428`**.
Broker authority **active**, surety bond **on file**. That is where our
`authority` and `insurance` checks read from — the same table, live.

---

## Receipt 2 — screen a broker we never seeded

**Hand them the keyboard.** In Dispatch, type any real MC number.

| Type this | Backstop says | Check on SAFER |
|---|---|---|
| `MC-133655` | **SCHNEIDER NATIONAL CARRIERS** · CLEAR | USDOT **264184** |
| `MC-172829` | **BONES TRANSPORTATION, INC.** · REFUSE — no authority, no bond | USDOT **247861** |

> "Neither of those is in our seed data. Name your own."

---

## Receipt 3 — the domain age is real

**In Backstop:** the domain check reads `anwebber.com · 28.0y old`.

**→ Terminal, in front of them:**
```bash
curl -s https://rdap.verisign.com/com/v1/domain/anwebber.com | grep -A2 registration
```

> "That's RDAP — the registry that replaced WHOIS. A shell company's domain is
> eleven days old. A real broker's is twenty-eight years old. It's one of the
> cheapest fraud signals there is and nobody checks it."

---

## Receipt 4 — the diesel price is this week's

**In Backstop:** Finder's money math uses **$5.435/gal, PADD 2, week of
2026-08-17.**

**→ Tab 4, EIA.** Midwest (PADD 2) on-highway diesel, same week, same number.

> "That's the EIA's own weekly series, and we read it with no key — their public
> page. The load's profit is calculated against what diesel actually costs in
> the region the truck is in, not a number we made up."

---

## Receipt 5 — the agents really send email

**In Backstop:** take the clean **$875 Chicago → Columbus** load.

**→ Tab 5, your inbox.** The message is there, from
`notifications@updates.lumper.io`, subject prefixed
`[to dispatch@meridianlogistics.example.com]`.

> "I didn't write that. Closer did, and it went out through Resend while we were
> talking. The subject says who it was addressed to — the demo broker is on a
> reserved domain that can't receive mail, so it's redirected to me. It never
> pretends it reached them."

Then **I'm at the dock** → the **detention notice** arrives, timestamped.

> "That's the document missing from every detention claim that ever got denied."

---

## Receipt 6 — it runs on Google Cloud

**→ Tab 6, Cloud Run console.** Service `lumper-backstop`, project
`lumper-backstop-0831`, region us-central1.

**→ Then hit it live, in the terminal:**
```bash
curl -s https://lumper-backstop-1094415841088.us-central1.run.app/api/health
```

```bash
curl -s -X POST https://lumper-backstop-1094415841088.us-central1.run.app/api/screen \
  -H 'content-type: application/json' -d '{"mc":"MC-172829"}'
```

> "That's the deployed backend, on Cloud Run, doing a live federal lookup —
> from the cloud, not my laptop."

Note `"memory": "local"` in the health response.

> "No database attached up there, so the Memory Bank fell back to its JSON
> snapshot. That's the fallback working in production, not a claim in a README."

---

## Every integration, and what proves it

| What | Live? | Receipt |
|---|---|---|
| **FMCSA SAFER** (L&I + Census) | live, no key | safer.fmcsa.dot.gov, USDOT 314927 |
| **RDAP** domain age | live, no key | `curl rdap.verisign.com/com/v1/domain/anwebber.com` |
| **EIA** weekly diesel | live, no key | eia.gov weekly Midwest diesel |
| **NWS** weather | live, no key | api.weather.gov |
| **Google Maps** Routes + Geocoding | live, key | the route on the map |
| **Gemini 3.5 Flash** | live, key | `/api/health` → `"model": "gemini-3.5-flash"` |
| **Resend** email | live, key | your inbox |
| **Google Cloud Run** | live | the console, and the `.run.app` URL |
| Load board (DAT / Truckstop) | **simulated** | the only one — vendor agreements required |

**The honest line, if a judge asks what's fake:**

> "The load board. That's it. DAT and Truckstop need signed vendor agreements,
> so the adapter is production-shaped and the sandbox replays a seeded board.
> The shell brokers are synthetic on purpose — and every one of their MC numbers
> was checked against the federal register and swapped until it came back empty,
> so we never put a real company on screen as a fraudster. Everything else is
> live, and the trace labels every call LIVE, SANDBOX or CACHED so you don't
> have to trust me."
