"""Margin — the only agent that touches money math. For each candidate it
pulls the real route (Maps), real diesel by PADD (EIA), and lane history, then
computes RPM after fuel + fixed cost and kills everything under the floor.
It hands Ghost only the top survivors."""
from __future__ import annotations

from .base import Agent
from ..data.seed import padd_for_city
from ..platform.memory import bank


class Margin(Agent):
    key = "MARGIN"

    async def evaluate_board(self, run_id: str, postings: list[dict], truck: dict,
                             floor_rpm: float, blacklist: set[str], top_n: int = 5) -> dict:
        self.say(run_id, f"evaluating {len(postings)} candidates against ${floor_rpm:.2f} floor")
        # one diesel read per PADD, cached across the board
        padd_price: dict[str, float] = {}
        survivors: list[dict] = []
        rows_kept: list[dict] = []
        kills = 0
        seen_dup: set[str] = set()

        for p in postings:
            m = await self._score_one(run_id, p, truck, floor_rpm, blacklist,
                                      padd_price, seen_dup, quiet=p.get("filler", False))
            rows_kept.append(m)
            if m["kill"]:
                kills += 1
            else:
                survivors.append(m)

        survivors.sort(key=lambda m: m["rpm"], reverse=True)
        top = survivors[:top_n]
        self.say(run_id,
                 f"{kills} killed on RPM/HOS/dup after cost · {len(survivors)} survive · top {len(top)} to Ghost",
                 "pass", kills=kills, survivors=len(survivors))
        # `all_rows` keeps every non-filler posting (killed + survivor) in board
        # order so the desk can render the full candidate table.
        all_rows = [m for m in rows_kept if not m["posting"].get("filler")]
        return {"kills": kills, "survivors": survivors, "top": top, "all_rows": all_rows}

    async def _score_one(self, run_id, p, truck, floor_rpm, blacklist, padd_price,
                         seen_dup, quiet):
        mc = p["mc"]
        if mc in blacklist:
            return _kill(p, "broker flagged")
        if p.get("dup_of") or (p["o"], p["d"], p["mc"], p.get("rate")) in seen_dup:
            return _kill(p, f"duplicate of {p.get('dup_of', 'prior posting')}")
        seen_dup.add((p["o"], p["d"], p["mc"], p.get("rate")))
        if not p.get("rate"):
            return _kill(p, "rate on request")

        # real route (verbose only for the real board, to keep the trace readable)
        route = await self.call(
            run_id, "maps.route", origin=p["o"], dest=p["d"],
            trace=None if quiet else "Routes API — {detail}")
        miles = route.value["miles"]
        dh_route = await self.call(run_id, "maps.route", origin=truck["city"], dest=p["o"]) \
            if not quiet else None
        deadhead = dh_route.value["miles"] if dh_route else p["dh"]
        total = miles + deadhead

        padd = padd_for_city(p["o"])
        if padd not in padd_price:
            fp = await self.call(run_id, "fuel.price", padd=padd,
                                 trace=None if quiet else "EIA — {detail}")
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


def _kill(p, reason, **extra):
    base = {"posting": p, "mc": p["mc"], "kill": reason, "rpm": round(extra.get("rpm", 0), 2),
            "miles": round(extra.get("miles", p["mi"])), "deadhead": round(extra.get("deadhead", p["dh"])),
            "lane_avg": extra.get("lane", 2.1), "fuel": round(extra.get("fuel", 0)),
            "fixed": round(extra.get("fixed", 0)), "drive_h": round(extra.get("drive", 0), 1),
            "net": 0, "hot": False}
    return base
