"""Payday — everything that turns a delivered load into money.

Two fights, one agent.

**The detention fight.** A truck rolls onto a dock and waits. The first couple
of hours are free; after that the broker owes waiting time, typically
$50-75/hr. Brokers stall, and drivers lose these claims for one boring reason:
nobody wrote down what time the truck arrived, and nobody told the broker in
writing at the moment the free window closed. The phone in the cab already
knows where it is, so Payday arms a geofence on the stop, stamps arrival,
runs the clock, sends a timestamped notice the second the meter starts, then
escalates on a bounded backoff — deciding each cycle whether to keep waiting,
push harder, or file — and finally assembles the GPS-in/GPS-out evidence
packet and attaches it to the invoice.

**The money fight.** POD photo (checked against the delivery coordinates, not
taken on trust), invoice, factoring packet, then aging with the same bounded
escalation until it is paid or handed to recourse. However it ends, the
outcome is written back to Verifier's graph: slow payers and detention
stallers become risk scores on the next screen."""
from __future__ import annotations

import base64
import time

from .base import Agent
from . import llm_helper
from ..data.seed import coords_for_city
from ..platform.memory import bank
from ..platform.runtime import runs

DOCK_GEOFENCE_MI = 2.0
# Simulated hours between detention follow-ups, and the aging days at which
# an unpaid invoice gets pushed. Both bounded, both with a give-up path.
DETENTION_BACKOFF_H = [1.0, 2.0, 4.0]
AGING_MILESTONES_D = [15, 25, 35]
METER_CAP_H = 8.0


class Payday(Agent):
    key = "PAYDAY"

    # ================= the detention clock =================

    async def watch_detention(self, run_id: str, posting_id: str, lat: float,
                              lng: float) -> dict:
        posting = await bank.get("board", posting_id) or {}
        terms = await bank.get("locked_terms", posting_id) or {}
        stop = terms.get("dest") or posting.get("d") or "the delivery"
        mc = terms.get("mc") or posting.get("mc") or ""
        broker_rec = await bank.get("brokers", mc) or {}
        broker = terms.get("broker") or broker_rec.get("name", mc or "the broker")
        tenant = await bank.get("settings", "tenant")
        det = tenant["detention"]
        free_min = int(det["free_hours"] * 60)
        rate_h = float(det["rate_per_hour"])
        s_lat, s_lng = coords_for_city(stop)

        fence = await self.call(run_id, "geofence.check", lat=lat, lng=lng,
                                stop_lat=s_lat, stop_lng=s_lng, stop=stop,
                                radius_mi=DOCK_GEOFENCE_MI,
                                trace="geofence — {detail}")
        if not fence.value["inside"]:
            self.say(run_id,
                     f"phone is {fence.value['distance_mi']} mi from {stop} — that is not the "
                     f"dock, so the clock does not start. No claim built on bad evidence.",
                     "warn")
            return {"active": False, "reason": "outside geofence"}

        now = time.time()
        doc = {
            "posting_id": posting_id, "run_id": run_id, "active": True, "stop": stop,
            "mc": mc, "broker": broker, "broker_email": terms.get("broker_email")
            or broker_rec.get("email", "dispatch@broker.example"),
            "arrived_at": now, "arrived_lat": lat, "arrived_lng": lng,
            "arrived_distance_mi": fence.value["distance_mi"],
            "departed_at": None, "departed_lat": None, "departed_lng": None,
            "free_minutes": free_min, "rate_per_hour": rate_h,
            "minutes_on_site": 0, "billable_minutes": 0, "owed": 0.0,
            "notice_sent": False, "notice_at": None, "attempts": 0,
            "status": "FREE_WINDOW", "claim_filed": False,
            "timeline": [_tl(now, f"Arrived at the {stop} dock — phone GPS confirms "
                                  f"{fence.value['distance_mi']} mi from the delivery address",
                             "info")],
        }
        await bank.put("detention", posting_id, doc)
        await bank.put("detention", "current", {**doc, "_key": "current"})
        self.say(run_id,
                 f"arrival stamped {time.strftime('%H:%M', time.localtime(now))} at {stop} · "
                 f"free window {det['free_hours']:g}h · after that {broker} owes ${rate_h:.0f}/hr",
                 "ok")

        # --- 1. the free window ---
        await runs.sleep_sim_hours(run_id, self.key, det["free_hours"],
                                   "free waiting window", agent_name=self.name, floor_s=0.8)
        if not await self._still_active(posting_id):
            return {"active": False, "reason": "departed inside free time"}
        doc = await self._tick(posting_id, free_min, "METER_RUNNING",
                               f"Free waiting time used up — the meter is running at "
                               f"${rate_h:.0f} an hour", "warn")
        self.say(run_id,
                 f"{_hm(free_min)} free window elapsed · meter started · "
                 f"every hour from here is ${rate_h:.0f}", "warn")

        # --- 2. the notice, sent at the boundary, timestamped ---
        stamp = time.strftime("%H:%M on %b %d", time.localtime(doc["arrived_at"]))
        await self.call(run_id, "mail.send", to=doc["broker_email"],
                        subject=f"Detention notice — {posting_id} at {stop}",
                        body=(f"Truck arrived {stamp} at {stop} (GPS confirmed, "
                              f"{doc['arrived_distance_mi']} mi from the delivery address). The "
                              f"{det['free_hours']:g}h free window closed at "
                              f"{time.strftime('%H:%M', time.localtime(time.time()))}. Detention "
                              f"is now accruing at ${rate_h:.0f}/hr per the rate confirmation."),
                        kind="detention_notice", trace="detention notice — {detail}")
        doc = await self._patch(posting_id, {
            "notice_sent": True, "notice_at": time.time(), "status": "NOTICE_SENT"})
        await self._add_tl(posting_id, "Broker told in writing, with the arrival time stamped —"
                                       " this is the part that wins the claim", "good")
        self.say(run_id,
                 f"timestamped notice sent to {broker} at the boundary · "
                 "this is exactly the document missing from every claim they denied", "pass")

        # --- 3. bounded escalation while the meter runs ---
        stalls = broker_rec.get("detention_denied", 0)
        minutes = free_min
        for attempt in range(1, len(DETENTION_BACKOFF_H) + 1):
            wait_h = DETENTION_BACKOFF_H[attempt - 1]
            await runs.sleep_sim_hours(run_id, self.key, wait_h,
                                       f"detention meter · attempt {attempt}",
                                       agent_name=self.name, floor_s=0.6)
            if not await self._still_active(posting_id):
                return {"active": False, "reason": "departed"}
            minutes += int(wait_h * 60)
            owed = _owed(minutes, free_min, rate_h)
            await self._tick(posting_id, minutes, "NOTICE_SENT",
                             f"{_hm(minutes)} on site — ${owed:,.2f} owed so far", "warn")
            self.say(run_id, f"{_hm(minutes)} on site · ${owed:,.2f} owed", "warn")

            # the decision: acknowledged, push again, or file
            acknowledged = stalls == 0 and attempt >= 1
            if acknowledged:
                self.say(run_id,
                         f"{broker} acknowledged the notice on attempt {attempt} of "
                         f"{len(DETENTION_BACKOFF_H)} · detention agreed, billing with the invoice",
                         "pass")
                await self._add_tl(posting_id, f"{broker} agreed to pay the waiting time", "good")
                break
            if attempt < len(DETENTION_BACKOFF_H):
                self.say(run_id,
                         f"no reply after {_hm(minutes - free_min)} of billable wait · re-sending · "
                         f"attempt {attempt + 1} of {len(DETENTION_BACKOFF_H)} · "
                         f"{broker} denied {stalls} claim(s) before, so escalating early",
                         "warn", attempt=attempt + 1)
                await self.call(run_id, "mail.send", to=doc["broker_email"],
                                subject=f"Detention accruing — {posting_id}",
                                body=(f"Second notice. {_hm(minutes)} on site, "
                                      f"${owed:,.2f} accrued. Please confirm."),
                                kind="detention_followup")
                await self._patch(posting_id, {"attempts": attempt})
                await self._add_tl(posting_id,
                                   f"No answer — reminder sent ({attempt + 1} of "
                                   f"{len(DETENTION_BACKOFF_H)})", "warn")
            else:
                self.say(run_id,
                         f"{broker} ignored {len(DETENTION_BACKOFF_H)} notices over "
                         f"{_hm(minutes - free_min)} of billable wait · done asking · "
                         "filing the claim with the GPS evidence attached", "fail")
                await self._file_claim(run_id, posting_id)

        # --- 4. keep the meter honest until the driver leaves ---
        while await self._still_active(posting_id) and minutes < METER_CAP_H * 60:
            await runs.sleep_sim_hours(run_id, self.key, 0.5, "meter tick",
                                       agent_name=self.name, floor_s=0.5)
            if not await self._still_active(posting_id):
                break
            minutes += 30
            await self._tick(posting_id, minutes, None,
                             f"{_hm(minutes)} on site — "
                             f"${_owed(minutes, free_min, rate_h):,.2f} owed", "warn")
        return {"active": True, "minutes_on_site": minutes}

    async def _file_claim(self, run_id: str, posting_id: str) -> dict:
        """Draft and file the claim, citing the evidence the phone collected."""
        doc = await bank.get("detention", posting_id) or {}
        owed = _owed(doc["minutes_on_site"], doc["free_minutes"], doc["rate_per_hour"])
        arrived = time.strftime("%H:%M", time.localtime(doc["arrived_at"]))
        notice = (time.strftime("%H:%M", time.localtime(doc["notice_at"]))
                  if doc.get("notice_at") else "n/a")
        evidence = (f"GPS-stamped arrival {arrived} at {doc['arrived_distance_mi']} mi from the "
                    f"delivery address; written notice sent {notice} when the "
                    f"{doc['free_minutes']//60}h free window closed; "
                    f"{_hm(doc['minutes_on_site'])} total on site; "
                    f"{_hm(doc['minutes_on_site'] - doc['free_minutes'])} billable at "
                    f"${doc['rate_per_hour']:.0f}/hr = ${owed:,.2f}.")
        template = (f"Detention claim on {posting_id}: ${owed:,.2f} for "
                    f"{_hm(doc['minutes_on_site'] - doc['free_minutes'])} of billable waiting. "
                    f"{evidence}")
        draft = await llm_helper.explain(
            run_id, self,
            system=("You are Payday, the billing agent for a small carrier. Write a short, "
                    "firm detention claim to a broker who has ignored two notices. Lead with "
                    "the amount, cite the GPS-stamped arrival time and the written notice as "
                    "evidence, and ask for payment with the invoice. No apology, no jargon."),
            prompt=f"Load {posting_id} at {doc['stop']}, broker {doc['broker']}. Evidence: {evidence}",
            template=template)
        await self.call(run_id, "mail.send", to=doc["broker_email"],
                        subject=f"Detention claim — {posting_id} · ${owed:,.2f}",
                        body=draft, attachment=f"detention_evidence_{posting_id}.pdf",
                        kind="detention_claim", trace="claim filed — {detail}")
        await self._patch(posting_id, {"status": "CLAIM_FILED", "claim_filed": True,
                                       "owed": owed, "claim_text": draft})
        await self._add_tl(posting_id,
                           f"Claim filed for ${owed:,.2f} with the GPS evidence attached", "good")
        return {"owed": owed, "claim": draft}

    async def close_detention(self, run_id: str, posting_id: str, lat: float,
                              lng: float) -> dict:
        """Driver rolled off the property. Stamp it, total it, package it."""
        doc = await bank.get("detention", posting_id)
        if not doc or not doc.get("active"):
            return {"active": False, "error": "no detention watch running"}
        run_id = doc.get("run_id") or run_id
        s_lat, s_lng = coords_for_city(doc["stop"])
        fence = await self.call(run_id, "geofence.check", lat=lat, lng=lng,
                                stop_lat=s_lat, stop_lng=s_lng, stop=doc["stop"],
                                radius_mi=DOCK_GEOFENCE_MI, trace="geofence — {detail}")
        minutes = int(doc["minutes_on_site"])
        billable = max(0, minutes - doc["free_minutes"])
        owed = _owed(minutes, doc["free_minutes"], doc["rate_per_hour"])
        now = time.time()
        patch = {"active": False, "departed_at": now, "departed_lat": lat,
                 "departed_lng": lng, "billable_minutes": billable, "owed": owed,
                 "departed_distance_mi": fence.value["distance_mi"]}
        if billable <= 0:
            patch["status"] = "PAID"
            await self._patch(posting_id, patch)
            await self._add_tl(posting_id, "Left the dock inside the free window — "
                                           "nothing to bill", "good")
            self.say(run_id, f"departed after {_hm(minutes)} · inside the free window · "
                             "no detention to claim", "pass")
            return {"run_id": run_id, "minutes_on_site": minutes, "billable_minutes": 0,
                    "owed": 0.0, "claim_filed": False}

        await self._patch(posting_id, patch)
        await self._add_tl(posting_id,
                           f"Left the dock after {_hm(minutes)} — GPS stamped on the way out",
                           "info")
        if not doc.get("claim_filed"):
            await self._file_claim(run_id, posting_id)
        else:
            await self._patch(posting_id, {"owed": owed})

        packet = await self.call(run_id, "doc.factoring_packet",
                                 load={"load_id": f"DET-{posting_id}",
                                       "broker": doc["broker"], "rate": owed},
                                 docs=["GPS arrival stamp", "GPS departure stamp",
                                       "timestamped detention notice", "rate con detention clause"],
                                 trace="evidence packet — {detail}")
        claim = {"_key": posting_id, "posting_id": posting_id, "mc": doc["mc"],
                 "broker": doc["broker"], "stop": doc["stop"],
                 "minutes_on_site": minutes, "free_minutes": doc["free_minutes"],
                 "billable_minutes": billable, "rate_per_hour": doc["rate_per_hour"],
                 "owed": owed, "status": "FILED", "paid": False, "days_ago": 0,
                 "notice_sent": True, "ts": now, "evidence": packet.value}
        await bank.put("detention_claims", posting_id, claim)
        self.say(run_id,
                 f"departed · {_hm(minutes)} on site · {_hm(billable)} billable · "
                 f"${owed:,.2f} claimed from {doc['broker']} · evidence attached to the invoice",
                 "pass", owed=owed)
        return {"run_id": run_id, "minutes_on_site": minutes,
                "billable_minutes": billable, "owed": owed, "claim_filed": True}

    # ---- detention state helpers ----------------------------------------

    async def _still_active(self, posting_id: str) -> bool:
        doc = await bank.get("detention", posting_id)
        return bool(doc and doc.get("active"))

    async def _patch(self, posting_id: str, patch: dict) -> dict:
        doc = await bank.patch("detention", posting_id, patch) or {}
        await bank.put("detention", "current", {**doc, "_key": "current"})
        return doc

    async def _tick(self, posting_id: str, minutes: int, status: str | None,
                    label: str, kind: str) -> dict:
        doc = await bank.get("detention", posting_id) or {}
        patch = {"minutes_on_site": minutes,
                 "billable_minutes": max(0, minutes - doc.get("free_minutes", 120)),
                 "owed": _owed(minutes, doc.get("free_minutes", 120),
                               doc.get("rate_per_hour", 75.0))}
        if status:
            patch["status"] = status
        doc = await self._patch(posting_id, patch)
        await self._add_tl(posting_id, label, kind)
        return doc

    async def _add_tl(self, posting_id: str, label: str, kind: str) -> None:
        doc = await bank.get("detention", posting_id) or {}
        tl = list(doc.get("timeline", []))
        tl.append(_tl(time.time(), label, kind))
        await self._patch(posting_id, {"timeline": tl})

    # ================= POD → invoice → paid =================

    async def capture_pod(self, run_id: str, terms: dict, image_b64: str,
                          lat: float, lng: float) -> dict:
        """POD off the driver's phone. The photo is checked against the
        delivery coordinates before anyone trusts what it says."""
        dest = terms["dest"]
        d_lat, d_lng = coords_for_city(dest)
        fence = await self.call(run_id, "geofence.check", lat=lat, lng=lng,
                                stop_lat=d_lat, stop_lng=d_lng, stop=dest,
                                radius_mi=DOCK_GEOFENCE_MI, trace="POD geofence — {detail}")
        g = fence.value
        if g["inside"]:
            self.say(run_id,
                     f"POD photo taken {g['distance_mi']} mi from the {dest} delivery point · "
                     f"GPS MATCHES the load · position accepted as proof of delivery", "pass")
        else:
            self.say(run_id,
                     f"POD photo taken {g['distance_mi']} mi from {dest} · GPS MISMATCH · "
                     f"flagging for a human before this goes on an invoice", "fail")

        raw = _decode(image_b64)
        pod = await self.call(run_id, "vision.read_pod", image_bytes=raw,
                              trace="Vision — {detail}")
        await bank.patch("runs", run_id, {"pod": pod.value, "pod_gps_match": g["inside"],
                                          "stage": "Delivered"})
        return {"pod": pod.value, "gps_match": g["inside"],
                "distance_mi": g["distance_mi"]}

    async def settle(self, run_id: str, terms: dict, *, pay_days: int = 19,
                     chase_pod: bool = True) -> dict:
        load_id, mc = terms["load_id"], terms["mc"]

        if chase_pod:
            await self.call(run_id, "mail.send",
                            to="driver@kmhauling.example", subject=f"POD needed — {load_id}",
                            body="Text a photo of the signed BOL when unloaded.", kind="pod_chase",
                            trace="POD chase — {detail}")
            await self.call(run_id, "vision.read_pod", trace="Vision — {detail}")

        # detention rolls onto the invoice as an accessorial, with its evidence
        claim = await bank.get("detention_claims", load_id) or {}
        accessorials = round(float(claim.get("owed", 0) or 0), 2)
        if accessorials:
            self.say(run_id,
                     f"detention {_hm(claim['billable_minutes'])} billable → "
                     f"${accessorials:,.2f} accessorial added, GPS evidence attached", "warn")
        invoice_total = round(terms["rate"] + accessorials, 2)

        await self.call(run_id, "doc.make_rate_con",
                        load={**terms, "rate": invoice_total, "load_id": f"INV-{load_id}"},
                        trace="invoice PDF — {detail}")
        docs = ["rate_con", "signed_BOL", "POD", "invoice"]
        if accessorials:
            docs += ["GPS detention evidence"]
        await self.call(run_id, "doc.factoring_packet",
                        load={**terms, "rate": invoice_total},
                        docs=docs, trace="factoring — {detail}")
        await self.call(run_id, "mail.send", to="factoring@triumph.example",
                        subject=f"Factoring submission — {load_id}",
                        body=f"Packet for ${invoice_total:,.2f}.",
                        attachment=f"packet_{load_id}.pdf", kind="factoring")

        await bank.patch("runs", run_id, {"invoiced": invoice_total, "aging_day": 0,
                                          "stage": "Invoiced"})
        paid = await self._chase_payment(run_id, terms, invoice_total, pay_days)

        # write behaviour back to Verifier's graph — the closed loop
        broker = await bank.get("brokers", mc) or {}
        prior = broker.get("prior_loads", 0)
        old_avg = broker.get("avg_pay_days", pay_days)
        new_avg = round((old_avg * prior + pay_days) / (prior + 1)) if prior else pay_days
        patch = {"prior_loads": prior + 1, "avg_pay_days": new_avg, "last_pay_days": pay_days}
        if accessorials:
            patch["detention_claims"] = broker.get("detention_claims", 0) + 1
            if not paid["paid"]:
                patch["detention_denied"] = broker.get("detention_denied", 0) + 1
                patch["detention_unpaid"] = broker.get("detention_unpaid", 0) + accessorials
        await self.call(run_id, "graph.write", mc_number=mc, patch=patch,
                        trace="graph write-back — {detail}")
        if not paid["paid"]:
            await self.call(run_id, "memory.write", key=f"MEM-UNPAID-{load_id}",
                            kind="unpaid", mc_number=mc, amount=invoice_total,
                            ach=broker.get("ach"),
                            text=(f"{terms['broker']} never paid ${invoice_total:,.0f} on "
                                  f"{load_id} after {AGING_MILESTONES_D[-1]} days."))
        if accessorials:
            await bank.patch("detention_claims", load_id,
                             {"status": "PAID" if paid["paid"] else "DENIED",
                              "paid": paid["paid"]})
            await self._patch(load_id, {"status": "PAID" if paid["paid"] else "CLAIM_FILED"})

        self.say(run_id,
                 (f"paid day {pay_days} · ${invoice_total:,.2f} · written back to Verifier's graph "
                  f"(avg pay {new_avg}d)" if paid["paid"] else
                  f"unpaid at day {AGING_MILESTONES_D[-1]} · ${invoice_total:,.2f} handed to "
                  f"factoring recourse · {mc} remembered as a non-payer"),
                 "pass" if paid["paid"] else "fail",
                 paid=invoice_total, pay_days=pay_days)
        await bank.patch("runs", run_id, {"stage": "Paid" if paid["paid"] else "Recourse"})
        return {"invoice_total": invoice_total, "pay_days": pay_days,
                "accessorials": accessorials, "paid": paid["paid"],
                "attempts": paid["attempts"]}

    async def _chase_payment(self, run_id: str, terms: dict, amount: float,
                             pay_days: int) -> dict:
        """Aging with escalating pushes. Each milestone is a decision: wait,
        push, or stop chasing and hand it to recourse."""
        day = 0
        for attempt, milestone in enumerate(AGING_MILESTONES_D, start=1):
            if pay_days <= milestone:
                await runs.sleep_sim_hours(run_id, self.key, (pay_days - day) * 24,
                                           f"aging to payment (day {pay_days})",
                                           agent_name=self.name)
                return {"paid": True, "attempts": attempt - 1}
            await runs.sleep_sim_hours(run_id, self.key, (milestone - day) * 24,
                                       f"aging to day {milestone}", agent_name=self.name)
            day = milestone
            if attempt == 1:
                self.say(run_id, f"day {day} · unpaid · polite reminder · "
                                 f"attempt 1 of {len(AGING_MILESTONES_D)}", "warn")
                await self.call(run_id, "mail.send",
                                to=terms.get("broker_email", "dispatch@broker.example"),
                                subject=f"Past due — {terms['load_id']}",
                                body=f"Invoice ${amount:,.2f} past {day} days. Please remit.",
                                kind="escalation")
            elif attempt < len(AGING_MILESTONES_D):
                draft = await llm_helper.explain(
                    run_id, self,
                    system=("You are Payday, chasing an unpaid freight invoice. Two sentences, "
                            "escalating but professional, state the amount and the days "
                            "outstanding and name the next step. No jargon."),
                    prompt=(f"{terms['broker']} owes ${amount:,.2f} on {terms['load_id']} "
                            f"({terms['origin']}→{terms['dest']}), now {day} days out. First "
                            f"reminder was ignored."),
                    template=(f"${amount:,.2f} on {terms['load_id']} is now {day} days out and "
                              f"two notices have gone unanswered. Remit within 5 business days "
                              f"or this goes to our factor for recourse collection."))
                self.say(run_id, f"day {day} · still unpaid · escalating · "
                                 f"attempt {attempt} of {len(AGING_MILESTONES_D)}", "warn")
                await self.call(run_id, "mail.send",
                                to=terms.get("broker_email", "dispatch@broker.example"),
                                subject=f"{day} days past due — {terms['load_id']}",
                                body=draft, kind="escalation")
            else:
                self.say(run_id,
                         f"day {day} · {len(AGING_MILESTONES_D)} attempts, no payment · "
                         "no longer worth this desk's time — handing to factoring recourse",
                         "fail")
                return {"paid": False, "attempts": attempt}
        return {"paid": False, "attempts": len(AGING_MILESTONES_D)}


# ---- small helpers ------------------------------------------------------

def _owed(minutes: int, free_minutes: int, rate_per_hour: float) -> float:
    return round(max(0, minutes - free_minutes) / 60.0 * rate_per_hour, 2)


def _hm(minutes: float) -> str:
    total = int(round(minutes))
    h, m = divmod(total, 60)
    if h and m:
        return f"{h}h{m:02d}m"
    return f"{h}h" if h else f"{m}m"


def _tl(ts: float, label: str, kind: str = "info") -> dict:
    return {"ts": ts, "label": label, "kind": kind}


def _decode(image_b64: str | None) -> bytes | None:
    """The phone may send a stub while the camera pipeline is being wired;
    a stub must degrade to the template POD read, never crash the run."""
    if not image_b64:
        return None
    try:
        raw = base64.b64decode(image_b64, validate=False)
        return raw if len(raw) > 64 else None
    except (ValueError, TypeError):
        return None
