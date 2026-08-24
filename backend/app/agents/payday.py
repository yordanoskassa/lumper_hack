"""Payday — the emotional payoff. Chases the POD, reads it with Vision,
generates the invoice PDF, assembles + submits the factoring packet, then
tracks aging and escalates past day 15. On payment it writes days-to-pay back
to Ghost's graph, so a slow payer becomes a risk score on the next screen."""
from __future__ import annotations

from .base import Agent
from ..platform.memory import bank
from ..platform.runtime import runs


class Payday(Agent):
    key = "PAY"

    async def settle(self, run_id: str, terms: dict, *, pay_days: int = 19) -> dict:
        load_id, mc = terms["load_id"], terms["mc"]

        await self.call(run_id, "mail.send",
                        to="driver@kmhauling.example", subject=f"POD needed — {load_id}",
                        body="Text a photo of the signed BOL when unloaded.", kind="pod_chase",
                        trace="POD chase — {detail}")
        pod = await self.call(run_id, "vision.read_pod", trace="Vision — {detail}")

        detention_h = (await bank.get("runs", run_id) or {}).get("detention_hours", 0)
        accessorials = 0
        if detention_h and detention_h > terms["free_hours"]:
            billable = detention_h - terms["free_hours"]
            accessorials = round(billable * terms["detention_rate"])
            self.say(run_id, f"detention {billable:.1f}h billable → ${accessorials} accessorial added", "warn")
        invoice_total = terms["rate"] + accessorials

        inv = await self.call(run_id, "doc.make_rate_con",
                              load={**terms, "rate": invoice_total, "load_id": f"INV-{load_id}"},
                              trace="invoice PDF — {detail}")
        packet = await self.call(run_id, "doc.factoring_packet",
                                 load={**terms, "rate": invoice_total},
                                 docs=["rate_con", "signed_BOL", "POD", "invoice"],
                                 trace="factoring — {detail}")
        await self.call(run_id, "mail.send", to="factoring@triumph.example",
                        subject=f"Factoring submission — {load_id}",
                        body=f"Packet for ${invoice_total:,}.", attachment=f"packet_{load_id}.pdf",
                        kind="factoring")

        # aging + escalation
        await bank.patch("runs", run_id, {"invoiced": invoice_total, "aging_day": 0})
        if pay_days > 15:
            await runs.sleep_sim_hours(run_id, self.name, 15 * 24, "aging to day 15")
            self.say(run_id, f"day 15 · unpaid · escalation notice sent to {terms['broker']}", "warn")
            await self.call(run_id, "mail.send",
                            to=terms.get("broker_email", "dispatch@broker.example"),
                            subject=f"Past due — {load_id}", body="Invoice past 15 days. Please remit.",
                            kind="escalation")
            await runs.sleep_sim_hours(run_id, self.name, (pay_days - 15) * 24, "to payment")
        else:
            await runs.sleep_sim_hours(run_id, self.name, pay_days * 24, "to payment")

        # write payment behavior back to Ghost's graph — the closed loop
        broker = await bank.get("brokers", mc) or {}
        prior = broker.get("prior_loads", 0)
        old_avg = broker.get("avg_pay_days", pay_days)
        new_avg = round((old_avg * prior + pay_days) / (prior + 1)) if prior else pay_days
        await self.call(run_id, "graph.write", mc_number=mc,
                        patch={"prior_loads": prior + 1, "avg_pay_days": new_avg,
                               "last_pay_days": pay_days},
                        trace="graph write-back — {detail}")
        self.say(run_id,
                 f"paid day {pay_days} · ${invoice_total:,} · written back to Ghost graph (avg pay {new_avg}d)",
                 "pass", paid=invoice_total, pay_days=pay_days)
        return {"invoice_total": invoice_total, "pay_days": pay_days,
                "accessorials": accessorials, "pod": pod.value}
