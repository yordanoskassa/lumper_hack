"""Handshake — drafts the offer off lane comps, gets the driver's voice
approval, sends it via Gmail, and locks the agreed terms in the Memory Bank.
The locked terms are what Fine Print later audits the paper against."""
from __future__ import annotations

from .base import Agent
from ..platform.memory import bank


class Handshake(Agent):
    key = "HAND"

    async def negotiate(self, run_id: str, load: dict, agreed_rate: int) -> dict:
        lane = await self.call(run_id, "lanes.read", origin=load["origin"], dest=load["dest"],
                               trace="lane comps — {detail}")
        anchor = max(agreed_rate, round(lane.value.get("avg_rpm", 2.1) * 1.08 * load["miles"] / 25) * 25)
        self.say(run_id, f"anchor ${anchor:,} from lane comps · driver floor set by desk")

        voice = await self.call(run_id, "voice.confirm", offer_amount=agreed_rate,
                                trace="voice — {detail}")

        detention = (await bank.get("settings", "tenant"))["detention"]
        terms = {
            "load_id": load["load_id"], "broker": load["broker"], "mc": load["mc"],
            "rate": agreed_rate, "miles": load["miles"], "origin": load["origin"],
            "dest": load["dest"], "eq": load.get("eq", "Dry van"),
            "detention_rate": detention["rate_per_hour"], "free_hours": detention["free_hours"],
            "terms": "Net 30 / factoring OK",
        }
        await bank.put("locked_terms", load["load_id"], terms)

        rc = await self.call(run_id, "doc.make_rate_con", load=terms,
                             trace="rate con — {detail}")
        await self.call(run_id, "mail.send", to=load.get("broker_email", "dispatch@broker.example"),
                        subject=f"Rate confirmation — {load['load_id']} {load['origin']}→{load['dest']}",
                        body=f"Confirming ${agreed_rate:,} all-in. Terms attached.",
                        attachment=f"rate_con_{load['load_id']}.pdf",
                        trace="Gmail — {detail}")
        self.say(run_id, f"terms locked ${agreed_rate:,} · detention ${terms['detention_rate']}/hr · rate con out",
                 "pass", rate=agreed_rate)
        return {"terms": terms, "anchor": anchor, "voice": voice.value}
