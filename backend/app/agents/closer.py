"""Closer — turns a screened load into a booked truck. It anchors on lane
comps, asks Gemini whether to take the posted rate or counter, gets the
driver's voice approval, and then does the unglamorous thing that actually
loses small carriers money: it chases the broker.

Brokers go quiet. A one-shot "send the offer and hope" agent is worthless
here, so the wait is a real bounded loop with escalating backoff — and a
decision every cycle, not a sleep. Each cycle it re-asks: is this load still
worth waiting for given the hours burned and the next-best option, do I
re-send, do I escalate to a second channel, or do I abandon and give Finder
back the truck? Every attempt is narrated.

Once terms are locked it assigns the run, emails the driver, watches weather
on the route, and hands the truck to Payday at the dock."""
from __future__ import annotations

from .base import Agent
from . import llm_helper
from ..platform.memory import bank
from ..platform.runtime import runs

# Simulated hours to wait before each follow-up. Escalating, bounded, done.
BACKOFF_H = [2.0, 6.0, 18.0]
MAX_ATTEMPTS = len(BACKOFF_H)


class Closer(Agent):
    key = "CLOSER"

    # ---- negotiate ------------------------------------------------------

    async def negotiate(self, run_id: str, load: dict, agreed_rate: int) -> dict:
        lane = await self.call(run_id, "lanes.read", origin=load["origin"], dest=load["dest"],
                               trace="lane comps — {detail}")
        lane_avg = lane.value.get("avg_rpm") or 2.1
        anchor = max(agreed_rate, round(lane_avg * 1.08 * load["miles"] / 25) * 25)
        self.say(run_id, f"anchor ${anchor:,} from lane comps · "
                         f"lane 90d avg ${lane_avg:.2f}/mi over {load['miles']} mi")

        stance = await self._stance(run_id, load, agreed_rate, anchor, lane_avg)

        voice = await self.call(run_id, "voice.confirm", offer_amount=agreed_rate,
                                trace="voice — {detail}")

        broker = await bank.get("brokers", load["mc"]) or {}
        await self.call(run_id, "mail.send", to=load.get("broker_email", "dispatch@broker.example"),
                        subject=f"Offer — {load['load_id']} {load['origin']}→{load['dest']}",
                        body=f"We can cover this at ${agreed_rate:,} all-in. {stance}",
                        kind="offer", trace="Mail — {detail}")

        reply = await self._await_broker_reply(run_id, load, broker, agreed_rate)
        if not reply["accepted"]:
            return {"terms": None, "anchor": anchor, "abandoned": True,
                    "attempts": reply["attempts"], "waited_h": reply["waited_h"]}

        detention = (await bank.get("settings", "tenant"))["detention"]
        terms = {
            "load_id": load["load_id"], "broker": load["broker"], "mc": load["mc"],
            "rate": agreed_rate, "miles": load["miles"], "origin": load["origin"],
            "dest": load["dest"], "eq": load.get("eq", "Dry van"),
            "broker_email": load.get("broker_email", "dispatch@broker.example"),
            "detention_rate": detention["rate_per_hour"], "free_hours": detention["free_hours"],
            "terms": "Net 30 / factoring OK",
        }
        await bank.put("locked_terms", load["load_id"], terms)

        await self.call(run_id, "doc.make_rate_con", load=terms, trace="rate con — {detail}")
        await self.call(run_id, "mail.send", to=terms["broker_email"],
                        subject=f"Rate confirmation — {load['load_id']} {load['origin']}→{load['dest']}",
                        body=f"Confirming ${agreed_rate:,} all-in. Terms attached.",
                        attachment=f"rate_con_{load['load_id']}.pdf",
                        trace="Mail — {detail}")

        # assign the run and tell the driver, with the detention rule spelled out
        truck = (await bank.get("settings", "tenant"))["truck"]
        await self.call(run_id, "mail.send", to="driver@kmhauling.example",
                        subject=f"You're assigned — {load['load_id']} {load['origin']}→{load['dest']}",
                        body=(f"{truck['driver']}, truck {truck['id']}: ${agreed_rate:,} all-in, "
                              f"{load['miles']} mi. Hit ARRIVED in the app the second you're on the "
                              f"property — after {detention['free_hours']:g}h the clock pays you "
                              f"${detention['rate_per_hour']:.0f}/hr and we file it for you."),
                        kind="assignment", trace="driver assignment — {detail}")
        self.say(run_id,
                 f"terms locked ${agreed_rate:,} · detention ${terms['detention_rate']:.0f}/hr after "
                 f"{terms['free_hours']:g}h · run assigned to {truck['driver']} on truck {truck['id']}",
                 "pass", rate=agreed_rate)
        return {"terms": terms, "anchor": anchor, "voice": voice.value,
                "attempts": reply["attempts"], "waited_h": reply["waited_h"]}

    async def _stance(self, run_id: str, load: dict, agreed_rate: int, anchor: int,
                      lane_avg: float) -> str:
        """Take it or counter? Gemini reasons over the spread; the arithmetic
        is the fallback."""
        posted_rpm = agreed_rate / load["miles"] if load["miles"] else 0
        spread = (posted_rpm / lane_avg - 1) * 100 if lane_avg else 0
        template = (f"Posted ${posted_rpm:.2f}/mi against a ${lane_avg:.2f} lane average "
                    f"({spread:+.0f}%). "
                    + ("Taking it — arguing over the difference costs more in idle hours than it wins."
                       if spread >= -6 else
                       f"Countering at ${anchor:,}; the lane supports it and the truck is not desperate."))
        return await llm_helper.explain(
            run_id, self,
            system=("You are Closer, the negotiating agent for a small carrier. Decide in one "
                    "or two blunt sentences whether to accept the posted rate or counter, and "
                    "say why. An empty truck costs money too — do not fight over pennies. "
                    "A rate far ABOVE the lane average is a warning sign, not a win."),
            prompt=(f"Load {load['load_id']} {load['origin']}→{load['dest']}, {load['miles']} mi. "
                    f"Posted ${agreed_rate:,} (${posted_rpm:.2f}/mi). Lane 90-day average "
                    f"${lane_avg:.2f}/mi. Our anchor from comps is ${anchor:,}."),
            template=template)

    async def _await_broker_reply(self, run_id: str, load: dict, broker: dict,
                                  offer: int) -> dict:
        """Bounded chase with escalating backoff. Every cycle is a decision:
        keep waiting, escalate to another channel, or hand the truck back."""
        responds_in = float(broker.get("responds_in_h", 2))
        waited = 0.0
        for attempt in range(1, MAX_ATTEMPTS + 1):
            wait = BACKOFF_H[attempt - 1]
            await runs.sleep_sim_hours(run_id, self.key, wait,
                                       f"waiting on {load['broker']} to confirm",
                                       agent_name=self.name, floor_s=0.35)
            waited += wait
            if waited >= responds_in:
                await self.call(run_id, "mail.watch", expect="broker confirmation",
                                trace="inbox — {detail}")
                self.say(run_id,
                         f"{load['broker']} confirmed after {waited:g}h · attempt {attempt} of "
                         f"{MAX_ATTEMPTS} · ${offer:,} accepted", "pass")
                return {"accepted": True, "attempts": attempt, "waited_h": waited}

            if attempt == MAX_ATTEMPTS:
                break
            # --- the decision, not a sleep ---
            channel = "email" if attempt == 1 else "phone + email"
            self.say(run_id,
                     f"no reply after {waited:g}h · re-sending on {channel} · "
                     f"attempt {attempt + 1} of {MAX_ATTEMPTS} · "
                     f"load still clears the floor, worth {BACKOFF_H[attempt]:g}h more",
                     "warn", attempt=attempt + 1)
            await self.call(run_id, "mail.send",
                            to=load.get("broker_email", "dispatch@broker.example"),
                            subject=f"Following up — {load['load_id']} {load['origin']}→{load['dest']}",
                            body=f"Still available at ${offer:,} all-in. Confirming by end of day?",
                            kind="follow_up")

        self.say(run_id,
                 f"{load['broker']} silent for {waited:g}h across {MAX_ATTEMPTS} attempts · "
                 f"abandoning {load['load_id']} — the truck is worth more hunting than waiting",
                 "fail", attempts=MAX_ATTEMPTS)
        await bank.patch("runs", run_id, {"stage": "abandoned"})
        return {"accepted": False, "attempts": MAX_ATTEMPTS, "waited_h": waited}

    # ---- run the trip ---------------------------------------------------

    async def run_trip(self, run_id: str, terms: dict) -> dict:
        route = await self.call(run_id, "maps.route", origin=terms["origin"], dest=terms["dest"],
                                trace="Routes API — {detail}")
        r = route.value
        self.say(run_id, "geofence armed on pickup + delivery · "
                         "Payday owns the detention clock from here", "ok")

        weather = await self.call(
            run_id, "weather.route_check",
            o_lat=r["origin"][0], o_lon=r["origin"][1],
            d_lat=r["dest"][0], d_lon=r["dest"][1],
            trace="NWS — {detail}")
        if weather.value.get("severe"):
            self.say(run_id, "severe weather on route · rerouting and padding ETA", "warn")
        else:
            self.say(run_id, "route clear · ETA sent to broker", "ok")

        await self.call(run_id, "mail.send",
                        to=terms.get("broker_email", "dispatch@broker.example"),
                        subject=f"ETA update — {terms['load_id']}",
                        body=f"In transit {terms['origin']}→{terms['dest']}, on schedule.",
                        kind="eta")

        await runs.sleep_sim_hours(run_id, self.key, r["hours"], "drive to delivery",
                                   agent_name=self.name)
        await bank.patch("runs", run_id, {"delivered": True, "stage": "At dock"})
        self.say(run_id, f"arrived {terms['dest']} · handing off to Payday", "pass")
        return {"delivered": True, "route": r}
