"""Load board access. The one deliberately sandboxed integration: DAT /
Truckstop / 123Loadboard require vendor partnership agreements, so the
adapter layer is production-shaped and the sandbox replays a seeded board.
Swap `LOADBOARD_ADAPTER=dat` + credentials and nothing else changes."""
from __future__ import annotations

import hashlib
import time

from ..config import settings
from ..platform.gateway import ToolResult, tool
from ..platform.memory import bank


class LoadBoardAdapter:
    name = "base"

    async def search(self, origin_city: str, radius_mi: int = 150) -> list[dict]:
        raise NotImplementedError


class DATAdapter(LoadBoardAdapter):
    name = "DAT"
    # POST https://freight.api.dat.com/search/v3/searches with a bearer from
    # identity.api.dat.com — requires a signed DAT partner agreement.

    async def search(self, origin_city: str, radius_mi: int = 150) -> list[dict]:
        raise RuntimeError("DAT credentials not configured (vendor agreement pending)")


class TruckstopAdapter(LoadBoardAdapter):
    name = "Truckstop"

    async def search(self, origin_city: str, radius_mi: int = 150) -> list[dict]:
        raise RuntimeError("Truckstop API credentials not configured")


class SandboxAdapter(LoadBoardAdapter):
    """Replays the seeded board and pads it with deterministic filler postings
    so Scout genuinely pulls ~200 raw candidates that Margin must kill."""
    name = "sandbox"

    async def search(self, origin_city: str, radius_mi: int = 150) -> list[dict]:
        board = await bank.all("board")
        board.sort(key=lambda p: p["id"])
        out = [dict(p) for p in board]
        lanes = [(p["o"], p["d"], p["mi"]) for p in board if p.get("rate")]
        brokers = [p["mc"] for p in board]
        i = 0
        while len(out) < 200:
            o, d, mi = lanes[i % len(lanes)]
            h = int(hashlib.sha256(f"filler-{i}".encode()).hexdigest(), 16)
            rpm = 1.05 + (h % 90) / 100.0          # 1.05–1.94 — junk by design
            out.append({
                "id": f"F-{80000 + i}", "mc": brokers[h % len(brokers)],
                "o": o, "d": d, "mi": mi, "dh": 30 + h % 160,
                "rate": int(mi * rpm / 5) * 5, "eq": "Dry van",
                "posted_min": 5 + h % 400, "src": ("DAT", "Truckstop", "123LB")[h % 3],
                "filler": True, "posted_ts": time.time() - (5 + h % 400) * 60,
            })
            i += 1
        return out


def adapter() -> LoadBoardAdapter:
    kind = settings().loadboard_adapter.lower()
    if kind == "dat":
        return DATAdapter()
    if kind == "truckstop":
        return TruckstopAdapter()
    return SandboxAdapter()


@tool("loadboard.pull", scope="loadboard.read")
async def pull(origin_city: str) -> ToolResult:
    ad = adapter()
    postings = await ad.search(origin_city)
    by_src: dict[str, int] = {}
    for p in postings:
        by_src[p["src"]] = by_src.get(p["src"], 0) + 1
    detail = " · ".join(f"{k} {v}" for k, v in sorted(by_src.items()))
    backend = "sandbox" if ad.name == "sandbox" else "live"
    return ToolResult(postings, backend, 0, f"{detail} → {len(postings)} raw candidates")
