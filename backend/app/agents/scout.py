"""Scout — wakes when the truck is ~2h from empty, reads ELD position + HOS,
pulls the raw board through the adapter layer, and pre-filters Ghost's
blacklist before Margin spends a single API call on a known shell."""
from __future__ import annotations

from .base import Agent


class Scout(Agent):
    key = "SCOUT"

    async def hunt(self, run_id: str, blacklist: set[str]) -> dict:
        eld = await self.call(run_id, "eld.read", trace="ELD read — {detail}")
        truck = eld.value
        pull = await self.call(run_id, "loadboard.pull", origin_city=truck["city"],
                               trace="load board — {detail}")
        postings = pull.value
        if blacklist:
            before = len(postings)
            postings = [p for p in postings if p["mc"] not in blacklist]
            self.say(run_id,
                     f"pre-filtered {before - len(postings)} posting(s) from {len(blacklist)} blacklisted broker(s)",
                     "warn")
        self.say(run_id, f"{len(postings)} candidates written to state · handing to Margin", "ok")
        return {"truck": truck, "postings": postings}
