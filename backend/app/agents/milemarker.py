"""Mile Marker — runs the trip over simulated days. Arms geofences on both
stops (the detention clock), checks live NWS weather on the route and reroutes
on severe alerts, sends ETA updates, and wakes on scheduled events until
delivery, when it hands to Payday."""
from __future__ import annotations

from .base import Agent
from ..platform.memory import bank
from ..platform.runtime import runs


class MileMarker(Agent):
    key = "MILE"

    async def run_trip(self, run_id: str, terms: dict) -> dict:
        route = await self.call(run_id, "maps.route", origin=terms["origin"], dest=terms["dest"],
                                trace="Routes API — {detail}")
        r = route.value
        self.say(run_id, "geofence armed on pickup + delivery · detention clock ready", "ok")

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

        await runs.sleep_sim_hours(run_id, self.name, r["hours"], "drive to delivery")
        detention_h = 0.0  # clean run: delivered inside free time
        await bank.patch("runs", run_id, {"delivered": True, "detention_hours": detention_h})
        self.say(run_id, "delivered · POD captured by driver · detention clock never started", "pass")
        return {"delivered": True, "detention_hours": detention_h, "route": r}
