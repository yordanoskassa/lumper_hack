"""Finder — finds the money. It wakes when the truck is ~2h from empty, reads
ELD position + HOS, pulls every board through the adapter layer, and then does
the part a tired dispatcher can't: real route miles (Maps), real diesel for the
region (EIA), real lane history, cost after fuel and fixed cost. Anything that
doesn't clear the floor dies here, and only survivors cost anyone else a call.

Two things make it an agent rather than a pipeline:
  * it re-decides. A thin board is not an answer — it widens its own search
    radius and pulls again, with a bounded number of attempts and a give-up
    path, narrating the decision each cycle.
  * it reasons over the shortlist with Gemini instead of just sorting by RPM,
    because "highest RPM" and "best load" are not the same sentence.
"""
from __future__ import annotations

from .base import Agent
from . import llm_helper
from ..data.seed import padd_for_city
from ..platform.memory import bank

# Escalating search radius, in miles, used when the board comes back thin.
RADIUS_LADDER = [150, 250, 400]
MIN_SURVIVORS = 2


class Finder(Agent):
    key = "FINDER"

    # ---- hunting --------------------------------------------------------

    async def hunt(self, run_id: str, blacklist: set[str], radius_mi: int = 150) -> dict:
        eld = await self.call(run_id, "eld.read", trace="ELD read — {detail}")
        truck = eld.value
        postings = await self._pull(run_id, truck["city"], radius_mi, blacklist)
        return {"truck": truck, "postings": postings, "radius_mi": radius_mi}

    async def _pull(self, run_id: str, city: str, radius_mi: int,
                    blacklist: set[str]) -> list[dict]:
        pull = await self.call(run_id, "loadboard.pull", origin_city=city,
                               radius_mi=radius_mi, trace="load board — {detail}")
        postings = pull.value
        if blacklist:
            before = len(postings)
            postings = [p for p in postings if p["mc"] not in blacklist]
            self.say(run_id,
                     f"pre-filtered {before - len(postings)} posting(s) from "
                     f"{len(blacklist)} blacklisted broker(s) — no API call spent on a known shell",
                     "warn")
        return postings

    async def scan(self, run_id: str, tenant: dict, blacklist: set[str],
                   reason: bool = True) -> dict:
        """Full hunt → math → decide-again loop. Returns the board result plus
        the truck it was computed for."""
        hunt = await self.hunt(run_id, blacklist)
        truck = hunt["truck"]
        postings = hunt["postings"]
        board = await self.evaluate_board(run_id, postings, truck,
                                          tenant["floor_rpm"], blacklist)

        # --- the re-decision: a thin board is not an answer ---
        for attempt, radius in enumerate(RADIUS_LADDER[1:], start=2):
            if len(board["survivors"]) >= MIN_SURVIVORS:
                break
            self.say(run_id,
                     f"only {len(board['survivors'])} load(s) clear the "
                     f"${tenant['floor_rpm']:.2f} floor inside {RADIUS_LADDER[attempt - 2]} mi · "
                     f"widening to {radius} mi · attempt {attempt} of {len(RADIUS_LADDER)}",
                     "warn")
            postings = await self._pull(run_id, truck["city"], radius, blacklist)
            board = await self.evaluate_board(run_id, postings, truck,
                                              tenant["floor_rpm"], blacklist)
        else:
            if len(board["survivors"]) < MIN_SURVIVORS:
                self.say(run_id,
                         f"board exhausted at {RADIUS_LADDER[-1]} mi · "
                         "not widening further, a longer deadhead eats the margin it buys",
                         "fail")

        if reason and board["top"]:
            board["reasoning"] = await self._reason(run_id, board, truck, tenant)
        return {**board, "truck": truck, "postings": postings}

    # ---- money math -----------------------------------------------------

    async def evaluate_board(self, run_id: str, postings: list[dict], truck: dict,
                             floor_rpm: float, blacklist: set[str], top_n: int = 5,
                             verbose: bool = True) -> dict:
        """`verbose=False` runs the identical math but keeps the trace clean —
        the driver app re-reads the board every few seconds and nobody needs
        to watch that on stage."""
        if verbose:
            self.say(run_id, f"evaluating {len(postings)} candidates against ${floor_rpm:.2f} floor")
        # one diesel read per PADD, cached across the board
        padd_price: dict[str, float] = {}
        survivors: list[dict] = []
        rows_kept: list[dict] = []
        kills = 0
        seen_dup: set[tuple] = set()

        for p in postings:
            m = await self._score_one(run_id, p, truck, floor_rpm, blacklist,
                                      padd_price, seen_dup, quiet=p.get("filler", False),
                                      verbose=verbose)
            rows_kept.append(m)
            if m["kill"]:
                kills += 1
            else:
                survivors.append(m)

        survivors.sort(key=lambda m: m["rpm"], reverse=True)
        top = survivors[:top_n]
        if verbose:
            self.say(run_id,
                     f"{kills} killed on RPM/HOS/dup after cost · {len(survivors)} survive · "
                     f"top {len(top)} to Verifier",
                     "pass", kills=kills, survivors=len(survivors))
        # `all_rows` keeps every non-filler posting (killed + survivor) in board
        # order so the desk can render the full candidate table.
        all_rows = [m for m in rows_kept if not m["posting"].get("filler")]
        return {"kills": kills, "survivors": survivors, "top": top, "all_rows": all_rows}

    async def _score_one(self, run_id, p, truck, floor_rpm, blacklist, padd_price,
                         seen_dup, quiet, verbose=True):
        mc = p["mc"]
        if mc in blacklist:
            return _kill(p, "broker flagged")
        if p.get("dup_of") or (p["o"], p["d"], p["mc"], p.get("rate")) in seen_dup:
            return _kill(p, f"duplicate of {p.get('dup_of', 'prior posting')}")
        seen_dup.add((p["o"], p["d"], p["mc"], p.get("rate")))
        if not p.get("rate"):
            return _kill(p, "rate on request")

        # Real candidates get a live route (Maps); the synthetic filler board
        # uses its seeded mileage so a 200-row scan stays demo-fast and we
        # never burn live API calls on postings that only exist to be killed.
        if quiet:
            miles, deadhead = float(p["mi"]), float(p["dh"])
        else:
            route = await self.call(run_id, "maps.route", origin=p["o"], dest=p["d"],
                                    trace="Routes API — {detail}" if verbose else None)
            miles = route.value["miles"]
            dh_route = await self.call(run_id, "maps.route", origin=truck["city"], dest=p["o"])
            deadhead = dh_route.value["miles"]
        total = miles + deadhead

        padd = padd_for_city(p["o"])
        if padd not in padd_price:
            fp = await self.call(run_id, "fuel.price", padd=padd,
                                 trace="EIA — {detail}" if verbose and not quiet else None)
            padd_price[padd] = fp.value["price"]
        diesel = padd_price[padd]

        fuel = total / truck["mpg"] * diesel
        fixed = total * truck["fixed_cpm"]
        rpm = (p["rate"] - fuel) / miles if miles else 0
        drive_h = total / 52.0

        lane = await self.call(run_id, "lanes.read", origin=p["o"], dest=p["d"]) \
            if not quiet else None
        lane_avg = (lane.value["avg_rpm"] if lane else None) or await bank.lane_avg(p["o"], p["d"]) or 2.1

        if drive_h > truck["hos_left_h"] + 11:
            return _kill(p, f"HOS: needs {drive_h:.1f}h", rpm=rpm, miles=miles,
                         deadhead=deadhead, lane=lane_avg, fuel=fuel, fixed=fixed, drive=drive_h)
        if rpm < floor_rpm:
            return _kill(p, f"RPM ${rpm:.2f} under floor", rpm=rpm, miles=miles,
                         deadhead=deadhead, lane=lane_avg, fuel=fuel, fixed=fixed, drive=drive_h)

        return {"posting": p, "mc": mc, "kill": None, "rpm": round(rpm, 2),
                "miles": round(miles), "deadhead": round(deadhead), "lane_avg": lane_avg,
                "fuel": round(fuel), "fixed": round(fixed), "drive_h": round(drive_h, 1),
                "net": round(p["rate"] - fuel - fixed),
                "hot": p["rate"] / miles > lane_avg * 1.12 if miles else False}

    # ---- reasoning ------------------------------------------------------

    async def _reason(self, run_id: str, board: dict, truck: dict, tenant: dict) -> str:
        """Highest RPM is not the same as best load. Hand Gemini the shortlist
        with its lane comps and let it argue; fall back to the arithmetic."""
        rows = []
        for m in board["top"][:4]:
            p = m["posting"]
            over = (p["rate"] / m["miles"] / m["lane_avg"] - 1) * 100 if m["miles"] else 0
            rows.append(f"{p['id']} {p['o']}→{p['d']} ${p['rate']:,} · "
                        f"{m['miles']}mi + {m['deadhead']}mi deadhead · "
                        f"${m['rpm']:.2f}/mi after fuel · net ${m['net']:,} · "
                        f"{m['drive_h']:.1f}h drive · lane 90d avg ${m['lane_avg']:.2f} "
                        f"({over:+.0f}% vs lane)")
        best = board["top"][0]
        bp = best["posting"]
        template = (f"{bp['id']} {bp['o']}→{bp['d']} pays ${best['rpm']:.2f}/mi after fuel "
                    f"for ${best['net']:,} net on {best['drive_h']:.1f}h of driving — the best "
                    f"money on the board with {truck['hos_left_h']:.1f}h of legal drive time left.")
        return await llm_helper.explain(
            run_id, self,
            system=("You are Finder, the load-selection agent for a 3-truck carrier. "
                    "Pick ONE load from the shortlist and justify it to the owner. Weigh net "
                    "dollars, hours burned, deadhead, and whether the rate is suspiciously far "
                    "above the lane average (that is bait, not luck). Be blunt, no jargon."),
            prompt=(f"Truck is in {truck['city']} with {truck['hos_left_h']:.1f}h legal drive "
                    f"time left and goes empty in {truck['empty_in_h']:.1f}h. Floor is "
                    f"${tenant['floor_rpm']:.2f}/mi after fuel. Shortlist:\n" + "\n".join(rows)),
            template=template)


def _kill(p, reason, **extra):
    base = {"posting": p, "mc": p["mc"], "kill": reason, "rpm": round(extra.get("rpm", 0), 2),
            "miles": round(extra.get("miles", p["mi"])), "deadhead": round(extra.get("deadhead", p["dh"])),
            "lane_avg": extra.get("lane", 2.1), "fuel": round(extra.get("fuel", 0)),
            "fixed": round(extra.get("fixed", 0)), "drive_h": round(extra.get("drive", 0), 1),
            "net": 0, "hot": False}
    return base
