"""HTTP + SSE surface. Two consumers: the web console (desk, chat, registry,
live trace) and the driver's phone (`/api/loads`, `/api/arrive`, `/api/pod`,
`/api/depart`, `/api/detention`). Everything interesting that happens is also
streamed on /api/stream as trace/state events, which is what makes the fleet
legible on stage.

The phone endpoints speak plain English on purpose: a driver reading a load
card should never meet an acronym, and the reasons a load was blocked have to
make sense to someone who has never heard of double-brokering."""
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from .agents.verifier import _blacklist
from .agents.dispatch import Dispatch, desk_snapshot
from .data import seed
from .data.seed import coords_for_city
from .platform.memory import bank
from .platform.observability import TraceEvent, hub
from .platform.registry import cards
from .platform.runtime import runs

router = APIRouter(prefix="/api")


def _need(body: dict, *keys: str):
    """Required fields, as a 400 with the missing name rather than a bare 500.
    A demo typo should say what it wants, not hand the room a stack trace."""
    missing = [k for k in keys if body.get(k) in (None, "")]
    if missing:
        raise HTTPException(400, f"missing required field(s): {', '.join(missing)}")
    return [body[k] for k in keys] if len(keys) > 1 else body[keys[0]]


def _coords(body: dict) -> tuple[float, float]:
    try:
        return float(body["lat"]), float(body["lng"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "lat and lng must be numbers")
_dispatch: Dispatch | None = None
_chat_history: list[dict] = []


def dispatch() -> Dispatch:
    global _dispatch
    if _dispatch is None:
        _dispatch = Dispatch()
    return _dispatch


@router.get("/health")
async def health():
    from .config import settings
    s = settings()
    # Report the CAPABILITY, not whether a key happens to be set. Diesel and the
    # federal record are both genuinely live with no key at all, and a tile that
    # said "eia: FALLBACK" next to a live EIA read — or "fmcsa: FALLBACK" beside
    # Verifier's live SAFER retrieval — had the product contradicting its own
    # pitch on the one screen built to prove the pitch.
    return {"ok": True, "memory": bank.driver,
            "integrations": {
                "gemini": s.has_gemini,
                "maps": s.has_maps,
                # EIA weekly diesel: keyed v2 API, else EIA's own published
                # weekly series. Live either way.
                "eia": True,
                # SAFER (L&I + Census) is keyless and live; a WebKey only adds
                # the out-of-service check, which the UI marks as skipped.
                "fmcsa": True,
                "weather": True,
                "rdap": True,
                "loadboard": s.loadboard_adapter,
            },
            "detail": {
                "eia": "live" if s.has_eia else "live · EIA public weekly series (no key)",
                "fmcsa": "live" if s.has_fmcsa else "live · SAFER keyless (no out-of-service without a WebKey)",
                "loadboard": "sandbox · vendor agreement required",
            },
            "model": s.gemini_model}


@router.get("/fleet")
async def fleet():
    """Who is where, on what, and how much clock they have left. A dispatcher's
    fleet screen — not a directory of our own agents."""
    t = await bank.get("settings", "tenant") or {}
    trucks = list(t.get("fleet") or [])
    # Payday writes the live clock to key "current" — "active" is a key nothing
    # has ever written, and there is no truck_id on the doc either, so this join
    # silently never matched. A truck sitting at a dock with the meter running is
    # the single thing a dispatcher most needs to see from across the room, and
    # it was invisible here. The real join is the posting: the load the truck is
    # on IS the load being detained.
    det = await bank.get("detention", "current")
    if det and det.get("active"):
        posting = det.get("posting_id")
        # The driver's phone belongs to the tenant's truck, so a clock running on
        # the phone is that truck's clock. Match the posting where a truck is
        # already carrying it; otherwise it is the driver we are following.
        own = (t.get("truck") or {}).get("id")
        target = next((x for x in trucks if (x.get("load") or {}).get("id") == posting), None) \
            or next((x for x in trucks if x["id"] == own), None)
        if target:
            target["status"] = "at dock"
            target["detention"] = {
                "posting_id": posting,
                "minutes_on_site": det.get("minutes_on_site"),
                "billable_minutes": det.get("billable_minutes"),
                "owed": det.get("owed"),
                "status": det.get("status"),
            }
            if not target.get("load") and posting:
                target["load"] = {"id": posting, "dest": det.get("stop"),
                                  "broker": det.get("broker"), "rate": det.get("rate"),
                                  "eta_h": 0}
    return {"carrier": t.get("name", "K&M Hauling"), "trucks": trucks}


@router.get("/money")
async def money():
    """Everything owed to this carrier and where it is stuck. This is Payday's
    work as a screen: detention claims, invoices out, and which brokers are
    slow, drawn from the same records the agents write."""
    claims = await bank.all("detention_claims")
    brokers = {b["_key"]: b for b in await bank.all("brokers")}
    out = await bank.all("outbox")

    def claim_row(c: dict) -> dict:
        return {
            "id": c.get("posting_id"), "broker": c.get("broker"),
            "mc": c.get("mc"), "stop": c.get("stop"),
            "minutes_on_site": c.get("minutes_on_site"),
            "billable_minutes": c.get("billable_minutes"),
            "rate_per_hour": c.get("rate_per_hour"),
            "owed": round(float(c.get("owed") or 0), 2),
            "status": c.get("status", "OPEN"),
            "paid": bool(c.get("paid")),
            "evidence": bool(c.get("gps_evidence") or c.get("notice_sent")),
        }

    rows = [claim_row(c) for c in claims]
    open_claims = [r for r in rows if not r["paid"]]
    # Invoices live on the run, not in the mailbox. Filtering the outbox for
    # kind="invoice" matched nothing — no agent emits that kind (the closest is
    # "factoring"), so this list could only ever be empty. The run record is the
    # authoritative one: it carries the amount and how long it has been aging.
    runs_all = await bank.all("runs")
    invoices = sorted(
        ({"id": (r.get("payload") or {}).get("posting_id") or r.get("_key"),
          "broker": r.get("broker"),
          "amount": round(float(r.get("invoiced") or 0), 2),
          "stage": r.get("stage") or "Invoiced",
          "aging_day": r.get("aging_day"),
          # The run's stage IS the payment state; a separate `paid` flag was
          # never written, so an invoice at stage "Paid" was rendering as open.
          "paid": (r.get("stage") or "").lower() == "paid",
          "ts": r.get("created")}
         for r in runs_all if r.get("invoiced")),
        key=lambda r: -(r.get("ts") or 0),
    )
    # Factoring submissions are the paper trail behind them, worth surfacing.
    packets = [{"id": m.get("load_id"), "subject": m.get("subject"), "ts": m.get("ts")}
               for m in out if (m.get("kind") or "") == "factoring"]
    aging = sorted(
        ({"broker": b.get("name"), "mc": k,
          "avg_pay_days": b.get("avg_pay_days") or 0,
          "unpaid": b.get("unpaid") or 0,
          "detention_denied": b.get("detention_denied") or 0,
          "prior_loads": b.get("prior_loads") or 0}
         for k, b in brokers.items()
         if (b.get("unpaid") or b.get("detention_denied") or b.get("prior_loads"))),
        key=lambda r: (-r["unpaid"], -r["detention_denied"], r["avg_pay_days"]),
    )
    return {
        "owed_now": round(sum(r["owed"] for r in open_claims), 2),
        "claims": rows,
        "invoices": invoices,
        "packets": packets,
        "aging": aging,
        "detention_terms": (await bank.get("settings", "tenant") or {}).get("detention", {}),
    }



@router.post("/mail")
async def mail_send(body: dict = Body(...)):
    """A driver sending the broker something specific, by hand. Payday files
    paperwork on its own as a run moves; this is for the moments a driver needs
    to say a particular thing and have it actually go out."""
    subject, text = _need(body, "subject", "body")
    posting_id = body.get("posting_id") or ""
    kind = body.get("kind") or "outbound"

    broker_email = None
    if posting_id:
        from .tools.loadboards import adapter
        tenant_doc = await bank.get("settings", "tenant") or {}
        for p in await adapter().search((tenant_doc.get("truck") or {}).get("city", "")):
            if p["id"] == posting_id:
                broker = await bank.get("brokers", p["mc"]) or {}
                broker_email = broker.get("email")
                break
    # No posting in hand still has to reach someone: fall back to the seeded
    # broker on the demo board rather than silently sending nowhere.
    if not broker_email:
        brokers = await bank.all("brokers")
        broker_email = next((b.get("email") for b in brokers if b.get("email")), None)
    if not broker_email:
        raise HTTPException(400, "no broker on file to send to")

    from .tools import mail as mail_tool
    run_id = runs.new_run_id()
    res = await mail_tool.send(run_id, to=broker_email, subject=subject,
                               body=text, kind=kind)
    return {"run_id": run_id, "to": broker_email, "backend": res.backend,
            "detail": res.detail}




@router.post("/document")
async def document(body: dict = Body(...)):
    """A driver hands over a document. Payday reads it and decides where it
    belongs — that routing is the agent's job, and making a driver choose
    'broker or dispatcher' is asking them to do the work we built a fleet for."""
    posting_id = body.get("posting_id") or ""
    note = (body.get("note") or "").strip()
    filename = (body.get("filename") or "document").strip()

    tenant_doc = await bank.get("settings", "tenant") or {}
    broker_email, broker_name, lane, picked_rate = None, None, "", None
    if posting_id:
        from .tools.loadboards import adapter
        for p in await adapter().search((tenant_doc.get("truck") or {}).get("city", "")):
            if p["id"] == posting_id:
                b = await bank.get("brokers", p["mc"]) or {}
                broker_email, broker_name = b.get("email"), b.get("name")
                lane = f"{p['o']} → {p['d']}"
                picked_rate = p.get("rate")
                break

    # What the paper is decides who needs it. A signed bill and a detention
    # claim are the broker's business; anything about the truck itself is the
    # carrier's own office.
    # The driver can name the document outright — one tap beats photographing a
    # bill and hoping the agent guessed right. Inference stays as the fallback.
    declared = (body.get("doc_type") or "").strip().lower()
    hay = f"{declared} {filename} {note}".lower()
    if any(w in hay for w in ("detention", "waiting", "sat", "delay")):
        routed_as, to, kind = "Detention evidence", broker_email, "detention_claim"
    elif any(w in hay for w in ("bol", "pod", "delivery", "signed", "receipt")):
        routed_as, to, kind = "Proof of delivery", broker_email, "pod"
    elif any(w in hay for w in ("rate", "confirmation", "ratecon", "contract")):
        routed_as, to, kind = "Rate confirmation", broker_email, "outbound"
    elif any(w in hay for w in ("insurance", "coi", "w-9", "w9", "authority", "packet")):
        routed_as, to, kind = "Carrier packet", broker_email, "outbound"
    else:
        routed_as, to, kind = "Trip paperwork", tenant_doc.get("email"), "outbound"

    if not to:
        raise HTTPException(400, "nobody on file to route this to")

    who = broker_name if to == broker_email else "your dispatcher"
    subject = f"{routed_as} — {posting_id or 'trip'}" + (f" · {lane}" if lane else "")
    text = (f"{routed_as} attached ({filename}).\n\n"
            + (note + "\n\n" if note else "")
            + "Sent by Lumper Backstop on behalf of "
            + f"{tenant_doc.get('name', 'the carrier')}.")

    from .tools import docs as doc_tool
    from .tools import mail as mail_tool
    run_id = runs.new_run_id()

    # Paperwork that proves work was done is worth money, so the agent raises
    # the invoice off it rather than leaving the driver to do it later. A POD is
    # the linehaul; detention evidence is the accessorial.
    invoice = None
    if routed_as in ("Proof of delivery", "Detention evidence"):
        rate = float((picked_rate or 0))
        det_doc = await bank.get("detention", "current") or {}
        owed = float(det_doc.get("owed") or 0) if det_doc.get("posting_id") == posting_id else 0.0
        lines = []
        if rate:
            lines.append((f"Linehaul — {lane or posting_id}", rate))
        if owed:
            mins = int(det_doc.get("billable_minutes") or 0)
            lines.append((f"Detention — {mins // 60}h {mins % 60:02d}m at "
                          f"${float(det_doc.get('rate_per_hour') or 0):.0f}/hr", owed))
        if lines:
            total = round(sum(a for _, a in lines), 2)
            inv = {
                "number": f"INV-{posting_id or 'TRIP'}",
                "date": time.strftime("%Y-%m-%d"),
                "carrier": tenant_doc.get("name", "K&M Hauling"),
                "carrier_lines": [f"{(tenant_doc.get('truck') or {}).get('city', '')}",
                                  tenant_doc.get("email", "")],
                "broker": broker_name or who,
                "lines": lines, "total": total,
                "notes": (["Arrival and departure GPS-stamped at the delivery point."]
                          if owed else []),
            }
            made = await doc_tool.invoice_pdf(invoice=inv)
            invoice = {"number": inv["number"], "total": total,
                       "filename": made.value["filename"]}
            subject = f"Invoice {inv['number']} — ${total:,.2f}"
            text = (f"{routed_as} attached, and the invoice with it.\n\n"
                    + "\n".join(f"  {l}  ${a:,.2f}" for l, a in lines)
                    + f"\n  TOTAL  ${total:,.2f}\n\n"
                    + (note + "\n\n" if note else "")
                    + "Raised by Lumper Backstop on behalf of "
                    + f"{tenant_doc.get('name', 'the carrier')}.")
            filename = made.value["filename"]

    res = await mail_tool.send(run_id, to=to, subject=subject, body=text,
                               attachment=filename, kind=kind)
    return {"run_id": run_id, "routed_as": routed_as, "to": who,
            "invoice": invoice, "backend": res.backend, "detail": res.detail}



@router.get("/history")
async def history():
    """Loads this carrier has already run. A driver opening the app wants to see
    their own work first, not an empty screen with a button on it."""
    runs_all = await bank.all("runs")
    seeded = [
        {"id": "P-90290", "broker": "Cardinal Dispatch Co", "lane": "Joliet IL → Columbus OH",
         "rate": 940.0, "detention": 247.5, "status": "Detention denied", "days_ago": 6},
        {"id": "P-90188", "broker": "Ohio Valley Logistics", "lane": "Chicago IL → Louisville KY",
         "rate": 1120.0, "detention": 0.0, "status": "Paid", "days_ago": 11},
        {"id": "P-90142", "broker": "Great Lakes Transfer", "lane": "Milwaukee WI → Indianapolis IN",
         "rate": 860.0, "detention": 150.0, "status": "Paid", "days_ago": 18},
    ]
    live = [
        {"id": (r.get("payload") or {}).get("posting_id") or r.get("_key"),
         "broker": r.get("broker") or "—",
         "lane": r.get("lane") or "",
         "rate": float(r.get("invoiced") or 0),
         "detention": float(r.get("detention_owed") or 0),
         "status": r.get("stage") or "Running",
         "days_ago": 0}
        for r in runs_all if r.get("invoiced")
    ]
    rows = live + seeded
    return {"loads": rows,
            "earned": round(sum(r["rate"] + r["detention"] for r in rows), 2),
            "detention_won": round(sum(r["detention"] for r in rows if r["status"] != "Detention denied"), 2)}


@router.get("/fuel")
async def fuel_plan(posting_id: str | None = None):
    """Where to buy diesel on this run, and what the choice is worth.

    Diesel is priced by PADD region and the spread between regions is real
    money on a full tank — a truck crossing a PADD line can save more by timing
    the stop than a dispatcher saves haggling the rate. Prices are EIA's own
    weekly series, read live and keyless."""
    from .tools import fuel as fuel_tool
    from .tools.loadboards import adapter
    from .data.seed import STATE_PADD, coords_for_city

    tenant_doc = await bank.get("settings", "tenant") or {}
    truck = tenant_doc.get("truck") or {}
    mpg = float(truck.get("mpg") or 6.4)

    origin, dest, miles = truck.get("city", ""), None, None
    if posting_id:
        for p in await adapter().search(truck.get("city", "")):
            if p["id"] == posting_id:
                origin, dest, miles = p["o"], p["d"], float(p.get("mi") or 0)
                break

    def padd_of(city: str) -> str:
        return STATE_PADD.get((city or "")[-2:].upper(), "US")

    stops = []
    for label, city in (("Before you leave", origin), ("At delivery", dest)):
        if not city:
            continue
        padd = padd_of(city)
        price, asof, backend, why = await fuel_tool.diesel_price(padd)
        lat, lng = coords_for_city(city)
        stops.append({"label": label, "city": city, "padd": padd,
                      "price": round(price, 3), "asof": asof,
                      "backend": backend, "why": why, "lat": lat, "lng": lng})

    gallons = round(miles / mpg, 1) if miles else None
    advice, saving = None, 0.0
    if len(stops) == 2 and gallons:
        cheap, dear = sorted(stops, key=lambda x: x["price"])[0], sorted(stops, key=lambda x: x["price"])[-1]
        saving = round((dear["price"] - cheap["price"]) * gallons, 2)
        if saving >= 5:
            advice = (f"Fill {cheap['city']} ({cheap['padd']}), not {dear['city']} "
                      f"({dear['padd']}) — ${cheap['price']:.3f} against "
                      f"${dear['price']:.3f} a gallon. On {gallons} gallons that is "
                      f"${saving:,.2f} you keep.")
        else:
            advice = (f"Barely a cent between {cheap['padd']} and {dear['padd']} this "
                      f"week. Fuel wherever the driver wants to stop.")

    return {"posting_id": posting_id, "origin": origin, "dest": dest,
            "miles": miles, "mpg": mpg, "gallons": gallons,
            "stops": stops, "advice": advice, "saving": saving}


@router.get("/registry")
async def registry():
    return {"agents": cards()}


@router.get("/tenant")
async def tenant():
    t = await bank.get("settings", "tenant")
    bl = await _blacklist()
    brokers = await bank.all("brokers")
    lanes = await bank.all("lanes")
    unpaid = sum(b.get("unpaid", 0) for b in brokers)
    shared_ach: dict[str, int] = {}
    for b in brokers:
        if b.get("ach"):
            shared_ach[b["ach"]] = shared_ach.get(b["ach"], 0) + 1
    return {"tenant": t, "blacklist": sorted(bl),
            "graph": {"brokers": len(brokers), "lanes": len(lanes),
                      "flagged": len(bl), "unpaid": unpaid,
                      "shared_ach_nodes": sum(1 for v in shared_ach.values() if v > 1)}}


@router.post("/chat")
async def chat(body: dict = Body(...)):
    message = body.get("message", "")
    run_id = body.get("run_id") or runs.new_run_id()
    result = await dispatch().chat(run_id, message, _chat_history[-8:])
    _chat_history.append({"role": "user", "text": message})
    _chat_history.append({"role": "model", "text": result["reply"]})
    return {"run_id": run_id, **result}


@router.post("/scan")
async def scan():
    run_id = runs.new_run_id()
    result = await dispatch().scan_board(run_id)
    return {"run_id": run_id, **result}


@router.get("/desk")
async def desk():
    """Recompute the desk board synchronously (no trace spam) for initial load."""
    tenant_doc = await bank.get("settings", "tenant")
    blacklist = await _blacklist()
    run_id = "desk-init"
    from .tools.loadboards import adapter
    postings = await adapter().search(tenant_doc["truck"]["city"])
    postings = [p for p in postings if p["mc"] not in blacklist]
    board = await dispatch().finder.evaluate_board(
        run_id, postings, tenant_doc["truck"], tenant_doc["floor_rpm"], blacklist)
    # These screens are independent network work, so running them one after
    # another made the desk wait for the sum of every federal lookup. Fan out,
    # but bounded — the federal endpoints throttle a burst. Two postings from the
    # same broker with the same contact details can only produce the same
    # verdict, so they screen once and share it (the docket-hijack posting keeps
    # its own entry precisely because its contact differs).
    sem = asyncio.Semaphore(6)

    async def screen_once(mc: str, posting: dict) -> dict:
        async with sem:
            # The first paint of the board is not a demonstrated retrieval, so it
            # may serve a cached federal record. Re-scan and tapping a broker do not.
            return await dispatch().verifier.screen(
                run_id, mc, posting=posting, quiet=True, use_cache=True)

    def contact_key(m: dict) -> tuple:
        # Postings carry the contact as `cph`/`cem`. Keying on `phone`/`email`
        # collapsed every posting for an MC into one entry, so the hijacked
        # posting inherited the honest one's verdict and the board showed the
        # fraud as CLEAR. The contact IS the discriminator — get it right.
        p = m["posting"]
        return (m["mc"], p.get("cph"), p.get("cem"))

    unique: dict[tuple, dict] = {}
    for m in board["all_rows"]:
        unique.setdefault(contact_key(m), m)
    keys = list(unique)
    results = await asyncio.gather(
        *(screen_once(unique[k]["mc"], unique[k]["posting"]) for k in keys),
        return_exceptions=True)
    by_key = dict(zip(keys, results))

    for m in board["all_rows"]:
        g = by_key[contact_key(m)]
        if isinstance(g, BaseException):
            # One broker's screen failing must not blank the board. Say we could
            # not check rather than implying the broker is clean.
            m["ghost"] = {"verdict": "UNKNOWN", "score": 0, "failed": 0,
                          "callback_mismatch": False, "error": str(g)[:120]}
            continue
        m["ghost"] = {"verdict": g["verdict"], "score": g["score"], "failed": g["failed"],
                      "callback_mismatch": g["callback"].get("mismatch", False)}
    snap = await desk_snapshot(board, tenant_doc["truck"], tenant_doc, len(postings))
    return snap


@router.post("/screen")
async def screen(body: dict = Body(...)):
    run_id = body.get("run_id") or runs.new_run_id()
    mc, posting = await dispatch()._resolve_mc(_need(body, "mc"))
    g = await dispatch().verifier.screen(
        run_id, mc, posting=posting, explain=bool(body.get("explain", True)))
    return {"run_id": run_id, "ghost": g, "verifier": g}


@router.post("/book")
async def book(body: dict = Body(...)):
    posting_id = _need(body, "posting_id")
    rate = body.get("rate")
    run = await runs.create("book", {"posting_id": posting_id})
    run_id = run["run_id"]
    runs.launch(run_id, dispatch().book_load(run_id, posting_id, rate))
    return {"run_id": run_id, "started": True}


@router.post("/interest")
async def interest(body: dict = Body(...)):
    """The driver wants a load. Closer emails the broker one line — we'll take
    it at the posted rate — and then the flow STOPS. No negotiation loop, no
    auto-run trip: the next thing that happens is a human reading the reply."""
    posting_id = _need(body, "posting_id")
    posting = await bank.get("board", posting_id)
    if not posting:
        raise HTTPException(404, f"no posting {posting_id} on the board")
    broker = await bank.get("brokers", posting.get("mc", "")) or {}
    tenant_doc = await bank.get("settings", "tenant") or {}
    carrier = tenant_doc.get("name", "the carrier")
    lane = f"{posting['o']} → {posting['d']}"
    rate = posting.get("rate")
    rate_txt = f"${rate:,}" if rate else "your posted rate"
    run_id = runs.new_run_id()
    hub.emit(TraceEvent(
        run_id=run_id, agent="Closer", kind="step", tone="ok",
        msg=f"driver wants {posting_id} · telling "
            f"{broker.get('name', posting.get('mc', 'the broker'))} "
            f"we'll take {lane} at {rate_txt}"))
    from .tools import mail as mail_tool
    res = await mail_tool.send(
        run_id,
        to=broker.get("email", "dispatch@broker.example"),
        subject=f"{lane} ({posting_id}) — we'll take it at {rate_txt}",
        body=(f"We'd like this load.\n\n"
              f"  Lane: {lane}\n"
              f"  Equipment: {posting.get('eq', 'Dry van')}\n"
              f"  Rate: {rate_txt}\n"
              f"  Truck: ready at {posting['o']}\n\n"
              f"Reply with the rate confirmation and we're rolling.\n\n"
              f"Sent by Lumper Backstop on behalf of {carrier}."),
        kind="offer")
    return {"run_id": run_id, "to": (res.value or {}).get("to"),
            "broker": broker.get("name", posting.get("mc")),
            "backend": res.backend, "detail": res.detail}


@router.post("/detention/request")
async def detention_request(body: dict = Body(...)):
    """The driver asks for their waiting time. Payday runs the whole fight in
    the background — the GPS-stamped clock, the timestamped notice at the
    free-window boundary, the escalation, the filed claim — and every message
    lands in the outbox, live or held."""
    posting_id = (body.get("posting_id") or "").strip() or "P-90428"
    run = await runs.create("detention", {"posting_id": posting_id})
    run_id = run["run_id"]
    runs.launch(run_id, dispatch().scenario_detention(run_id, posting_id))
    return {"run_id": run_id, "started": True, "posting_id": posting_id}


@router.post("/refuse")
async def refuse(body: dict = Body(...)):
    run_id = body.get("run_id") or runs.new_run_id()
    mc = _need(body, "mc")
    bl = await dispatch()._refuse(run_id, mc)
    return {"run_id": run_id, "blacklist": bl}


@router.post("/scenario")
async def scenario(body: dict = Body(...)):
    which = body.get("which", "clean")
    run = await runs.create("scenario", {"which": which})
    run_id = run["run_id"]
    b = dispatch()
    coro = {"ghost": b.scenario_ghost, "injection": b.scenario_injection,
            "callback": b.scenario_callback,
            "detention": b.scenario_detention}.get(which, b.scenario_clean)(run_id)
    runs.launch(run_id, coro)
    return {"run_id": run_id, "started": True, "which": which}


# ======================= the driver's phone =============================

@router.get("/loads")
async def loads():
    """Driver-shaped board: what it pays after fuel, and whether to trust it.
    Blocked loads are returned too — the point of the app is watching one get
    stopped, not quietly hiding it."""
    tenant_doc = await bank.get("settings", "tenant")
    truck = tenant_doc["truck"]
    blacklist = await _blacklist()
    from .tools.loadboards import adapter
    postings = [p for p in await adapter().search(truck["city"]) if not p.get("filler")]
    board = await dispatch().finder.evaluate_board(
        "driver-app", postings, truck, tenant_doc["floor_rpm"], set(), verbose=False)

    claims = await bank.all("detention_claims")
    out: list[dict] = []
    for m in board["all_rows"]:
        p = m["posting"]
        # dupes are noise on a phone. A "carrier bid" posting has no rate by
        # design — it is a real posting the driver answers with an offer, so it
        # stays, flagged, rather than being filtered out as malformed.
        if p.get("dup_of"):
            continue
        if not p.get("rate") and not p.get("bid_only"):
            continue
        broker = await bank.get("brokers", p["mc"]) or {}
        g = await dispatch().verifier.screen("driver-app", p["mc"], posting=p, silent=True)
        verdict, risk = _driver_verdict(g, p["mc"] in blacklist)
        # a load that doesn't clear the floor is not a load; it only stays on
        # the phone if it is here to be shown getting stopped
        # A bid-only posting has no rate to clear a floor with, so the profit
        # kill cannot apply to it — the driver names the price.
        if m["kill"] and verdict != "BLOCKED" and not p.get("bid_only"):
            continue
        o_lat, o_lng = coords_for_city(p["o"])
        d_lat, d_lng = coords_for_city(p["d"])
        row = {
            "id": p["id"], "broker": broker.get("name", p["mc"]), "mc": p["mc"],
            "origin": p["o"], "origin_lat": o_lat, "origin_lng": o_lng,
            "dest": p["d"], "dest_lat": d_lat, "dest_lng": d_lng,
            "rate": p["rate"], "miles": m["miles"], "rpm": m["rpm"],
            "net": m["net"], "deadhead": m["deadhead"], "eq": p.get("eq", "Dry van"),
            "drive_h": m["drive_h"], "lane_avg": round(m["lane_avg"], 2),
            # What is actually on the deck. A card that prices a load without
            # saying what it is asks the driver to guess whether their trailer fits.
            "units": p.get("units"),
            "pickup": p.get("pickup"),
            "posting_note": p.get("note"),
            # No posted rate: the driver answers this one with an offer.
            "bid_only": bool(p.get("bid_only")),
            # Where this posting came from and how stale it is. A load with no
            # provenance is a load you are asked to take on faith.
            "source": p.get("src"), "posted_min": p.get("posted_min"),
            # The record exactly as the load-board adapter handed it over, so
            # the card can show its own working. Everything above is derived
            # from this; nothing is added to it.
            "raw": {k: v for k, v in p.items() if k not in ("dup_of", "filler")},
            "verdict": verdict, "risk": risk, "blocked": verdict == "BLOCKED",
            "impersonated": bool(g.get("impersonated")),
            "posing_as": g.get("posing_as"),
            "reasons": _driver_reasons(m, g, broker, verdict, tenant_doc),
        }
        owed = round(sum(float(c.get("owed", 0) or 0) for c in claims
                         if c.get("mc") == p["mc"] and not c.get("paid")), 2)
        if owed:
            row["detention_owed"] = owed
        out.append(row)

    out.sort(key=lambda r: (r["blocked"], -r["net"]))
    return {"truck": {"city": truck["city"], "lat": truck["lat"], "lng": truck["lon"],
                      "driver": truck["driver"]},
            "loads": out}


@router.post("/arrive")
async def arrive(body: dict = Body(...)):
    """Driver hit ARRIVED at a dock. Payday arms the detention clock."""
    posting_id = _need(body, "posting_id")
    lat, lng = _coords(body)
    run = await runs.create("detention", {"posting_id": posting_id})
    run_id = run["run_id"]
    runs.launch(run_id, dispatch().payday.watch_detention(run_id, posting_id, lat, lng))
    return {"run_id": run_id, "started": True}


@router.post("/depart")
async def depart(body: dict = Body(...)):
    """Driver rolled off the property. Close the clock, total it, file it."""
    posting_id = _need(body, "posting_id")
    lat, lng = _coords(body)
    run_id = body.get("run_id") or runs.new_run_id()
    out = await dispatch().payday.close_detention(run_id, posting_id, lat, lng)
    if out.get("error"):
        return {"run_id": run_id, "minutes_on_site": 0, "billable_minutes": 0,
                "owed": 0.0, "claim_filed": False, "error": out["error"]}
    return out


@router.get("/detention")
async def detention():
    doc = await bank.get("detention", "current")
    if not doc:
        return {"active": False}
    return {
        "active": bool(doc.get("active")), "posting_id": doc.get("posting_id"),
        "stop": doc.get("stop"), "broker": doc.get("broker"),
        "arrived_at": doc.get("arrived_at"), "departed_at": doc.get("departed_at"),
        "free_minutes": doc.get("free_minutes", 120),
        "minutes_on_site": doc.get("minutes_on_site", 0),
        "billable_minutes": doc.get("billable_minutes", 0),
        "rate_per_hour": doc.get("rate_per_hour", 75.0),
        "owed": doc.get("owed", 0.0), "notice_sent": bool(doc.get("notice_sent")),
        "status": doc.get("status", "WAITING"),
        "timeline": doc.get("timeline", []),
    }


@router.post("/pod")
async def pod(body: dict = Body(...)):
    """Proof of delivery off the phone. Payday checks the photo's GPS against
    the load's delivery point before anything reaches an invoice."""
    posting_id = _need(body, "posting_id")
    run = await runs.create("pod", {"posting_id": posting_id})
    run_id = run["run_id"]
    runs.launch(run_id, _pod_flow(run_id, posting_id, body.get("image_b64", ""),
                                 float(body.get("lat", 0)), float(body.get("lng", 0))))
    return {"run_id": run_id, "started": True}


async def _pod_flow(run_id: str, posting_id: str, image_b64: str,
                    lat: float, lng: float) -> dict:
    terms = await bank.get("locked_terms", posting_id)
    if not terms:
        # POD can arrive for a load this process never booked (the phone is the
        # source of truth on the road) — rebuild the terms from the board.
        posting = await bank.get("board", posting_id) or {}
        broker = await bank.get("brokers", posting.get("mc", "")) or {}
        det = (await bank.get("settings", "tenant"))["detention"]
        terms = {"load_id": posting_id, "broker": broker.get("name", posting.get("mc", "broker")),
                 "mc": posting.get("mc", ""), "rate": posting.get("rate") or 0,
                 "miles": posting.get("mi", 0), "origin": posting.get("o", "Joliet IL"),
                 "dest": posting.get("d", "Columbus OH"), "eq": posting.get("eq", "Dry van"),
                 "broker_email": broker.get("email", "dispatch@broker.example"),
                 "detention_rate": det["rate_per_hour"], "free_hours": det["free_hours"],
                 "terms": "Net 30 / factoring OK"}
        await bank.put("locked_terms", posting_id, terms)
    pd = dispatch().payday
    await pd.capture_pod(run_id, terms, image_b64, lat, lng)
    broker = await bank.get("brokers", terms["mc"]) or {}
    return await pd.settle(run_id, terms, pay_days=broker.get("avg_pay_days") or 19,
                           chase_pod=False)


# ---- driver-facing wording ---------------------------------------------

def _weeks(days: int) -> str:
    if days <= 1:
        return "yesterday"
    if days < 14:
        return f"{days} days ago"
    if days < 45:
        return f"{round(days / 7)} weeks ago"
    return f"{round(days / 30)} months ago"


def _driver_verdict(g: dict, blacklisted: bool) -> tuple[str, int]:
    v = g["verdict"]
    if blacklisted or v in ("REFUSE", "BLACKLISTED"):
        return "BLOCKED", g["score"]
    return ("REVIEW" if v == "REVIEW" else "CLEAR"), g["score"]


def _driver_reasons(m: dict, g: dict, broker: dict, verdict: str,
                    tenant_doc: dict) -> list[str]:
    """Two to four short lines a non-trucker understands. No acronyms, no
    industry words — 'per mile after fuel', not 'RPM'."""
    r: list[str] = []
    cb = g.get("callback", {})
    mems = g.get("memories", [])

    money = next((x for x in mems if x["kind"] == "unpaid" and x.get("amount")), None)
    ring = next((x for x in mems if x["kind"] == "shell_ring"), None)

    if verdict == "BLOCKED":
        if cb.get("mismatch"):
            r.append("The phone number on this load isn't the one this company registered")
            owners = cb.get("owners") or []
            if owners:
                r.append(f"It belongs to a business set up {owners[0].get('domain_age_days', 0)} "
                         f"days ago")
        # keep the last slot for the thing that actually lands: the money
        room = 3 if (money or ring) else 4
        for c in g.get("checks", []):
            if len(r) >= room:
                break
            if c["skipped"] or c["ok"]:
                continue
            if c["key"] == "authority":
                d = broker.get("authority_age_days")
                r.append(f"Only licensed to broker freight {d} days ago" if d
                         else "Not licensed to broker freight")
            elif c["key"] == "insurance":
                r.append("No insurance on file")
            elif c["key"] == "oos":
                r.append("Regulators have ordered them to stop operating")
            elif c["key"] == "domain":
                r.append("Their website was registered a few weeks ago")
            elif c["key"] == "phone":
                r.append("Another company is using the same phone number")
            elif c["key"] == "ach":
                r.append("Their bank account is shared with other companies")
        if money and money.get("mc") == g["mc"]:
            r.append(f"They already took ${money['amount']:,.0f} off you "
                     f"{_weeks(money.get('days_ago', 0))} and never paid")
        elif money and g.get("collisions", {}).get("ach"):
            # Only claim a shared account when a collision was actually found.
            # `_recall` also probes the impostor's ACH, so this memory surfaces
            # on brokers who share nothing — and printing it on the card of the
            # company whose docket was hijacked accuses the victim.
            r.append(f"Shares a bank account with a company that never paid you "
                     f"${money['amount']:,.0f}")
        elif money and cb.get("mismatch"):
            r.append(f"The number on this posting traces to a company that owes "
                     f"you ${money['amount']:,.0f}")
        elif ring:
            r.append("Tied to a company that took a load from us and went quiet")
        return r[:4] or ["Too many warning signs — not worth the risk"]

    if broker.get("prior_loads"):
        r.append(f"Real company, {broker['prior_loads']} loads with us")
    else:
        r.append("We haven't hauled for them before")
    if broker.get("avg_pay_days"):
        r.append(f"Pays in {broker['avg_pay_days']} days")
    if m["net"]:
        r.append(f"Clears ${m['net']:,} after fuel and truck costs")
    if verdict == "REVIEW":
        denied = broker.get("detention_denied", 0)
        if denied:
            r.insert(0, f"They fought {denied} waiting-time claims — "
                        f"hit ARRIVED the second you're on their property")
        elif broker.get("avg_pay_days", 0) > 45:
            r.insert(0, "Slow to pay — expect to wait")
    if m["kill"]:
        r.append(f"Below your ${tenant_doc['floor_rpm']:.2f} a mile floor after fuel")
    return r[:4]


# ======================= console plumbing ===============================

@router.get("/runs")
async def list_runs():
    r = await bank.all("runs")
    r.sort(key=lambda x: x.get("created", 0), reverse=True)
    return {"runs": r[:20]}


@router.get("/outbox")
async def outbox():
    msgs = await bank.all("outbox")
    msgs.sort(key=lambda m: m.get("ts", 0))
    return {"messages": msgs}


@router.get("/quarantine")
async def quarantine():
    return {"items": await bank.all("quarantine")}


@router.post("/reset")
async def reset():
    await seed.load(bank, force=True)
    await bank.clear("locked_terms")
    await bank.clear("outbox")
    await bank.clear("quarantine")
    await bank.clear("detention")
    _chat_history.clear()
    hub.emit(TraceEvent(run_id="system", agent="DISPATCH", agent_name="Dispatch",
                        msg="desk reset · sandbox reseeded · graph restored"))
    return {"ok": True}


@router.get("/trace")
async def trace(run_id: str | None = None):
    return {"events": hub.replay(run_id)}


@router.get("/stream")
async def stream():
    async def gen():
        # replay recent buffer so a fresh page paints immediately
        for ev in hub.replay(limit=200):
            yield f"data: {json.dumps(ev, default=str)}\n\n"
        async for ev in hub.subscribe():
            yield f"data: {json.dumps(ev, default=str)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
