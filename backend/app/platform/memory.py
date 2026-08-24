"""Memory Bank: persistent cross-session state — the broker graph, lane rate
history, runs, outbox and quarantine. MongoDB (motor) when reachable, JSON
snapshot on disk otherwise; same interface either way, and the active driver
is reported honestly to the UI."""
from __future__ import annotations

import asyncio
import copy
import json
from typing import Any

from ..config import RUNTIME_DIR, settings


class MemoryBank:
    driver: str = "local"

    def __init__(self) -> None:
        self._data: dict[str, dict[str, dict]] = {}
        self._path = RUNTIME_DIR / "memory_bank.json"
        self._lock = asyncio.Lock()
        self._mongo = None

    async def connect(self) -> str:
        cfg = settings()
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(cfg.mongo_uri, serverSelectionTimeoutMS=900)
            await client.admin.command("ping")
            self._mongo = client[cfg.mongo_db]
            self.driver = "mongodb"
        except Exception:
            self._mongo = None
            self.driver = "local"
            if self._path.exists():
                try:
                    self._data = json.loads(self._path.read_text())
                except (json.JSONDecodeError, OSError):
                    self._data = {}
        return self.driver

    async def _flush(self) -> None:
        if self._mongo is None:
            try:
                self._path.write_text(json.dumps(self._data, default=str))
            except OSError:
                pass

    async def put(self, coll: str, key: str, doc: dict[str, Any]) -> None:
        doc = {**doc, "_key": key}
        async with self._lock:
            if self._mongo is not None:
                await self._mongo[coll].replace_one({"_key": key}, doc, upsert=True)
            else:
                self._data.setdefault(coll, {})[key] = copy.deepcopy(doc)
                await self._flush()

    async def patch(self, coll: str, key: str, patch: dict[str, Any]) -> dict | None:
        async with self._lock:
            if self._mongo is not None:
                await self._mongo[coll].update_one({"_key": key}, {"$set": patch})
                return await self._mongo[coll].find_one({"_key": key}, {"_id": 0})
            doc = self._data.setdefault(coll, {}).get(key)
            if doc is not None:
                doc.update(copy.deepcopy(patch))
                await self._flush()
            return copy.deepcopy(doc)

    async def get(self, coll: str, key: str) -> dict | None:
        if self._mongo is not None:
            return await self._mongo[coll].find_one({"_key": key}, {"_id": 0})
        doc = self._data.get(coll, {}).get(key)
        return copy.deepcopy(doc)

    async def all(self, coll: str) -> list[dict]:
        if self._mongo is not None:
            return [d async for d in self._mongo[coll].find({}, {"_id": 0})]
        return [copy.deepcopy(d) for d in self._data.get(coll, {}).values()]

    async def find(self, coll: str, **filters: Any) -> list[dict]:
        docs = await self.all(coll)
        return [d for d in docs if all(d.get(k) == v for k, v in filters.items())]

    async def clear(self, coll: str) -> None:
        async with self._lock:
            if self._mongo is not None:
                await self._mongo[coll].delete_many({})
            else:
                self._data.pop(coll, None)
                await self._flush()

    # ---- domain helpers -------------------------------------------------

    async def broker_collisions(self, mc: str) -> dict[str, list[dict]]:
        """Graph query: other brokers sharing this broker's phone or ACH
        routing — the shell-reuse fingerprint."""
        me = await self.get("brokers", mc)
        out: dict[str, list[dict]] = {"phone": [], "ach": []}
        if not me:
            return out
        for other in await self.all("brokers"):
            if other["_key"] == mc:
                continue
            if me.get("phone") and other.get("phone") == me["phone"]:
                out["phone"].append(other)
            if me.get("ach") and other.get("ach") == me["ach"]:
                out["ach"].append(other)
        return out

    async def lane_avg(self, origin: str, dest: str) -> float | None:
        lane = await self.get("lanes", f"{origin}→{dest}")
        return lane["avg_rpm"] if lane else None


bank = MemoryBank()
