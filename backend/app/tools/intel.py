"""Carrier intelligence held in the Memory Bank: lane rate history (the
BigQuery role) and the broker graph (collisions + payment behavior)."""
from __future__ import annotations

from ..platform.gateway import ToolResult, tool
from ..platform.memory import bank


@tool("lanes.read", scope="lanes.read")
async def lane_history(origin: str, dest: str) -> ToolResult:
    lane = await bank.get("lanes", f"{origin}→{dest}")
    if lane is None:
        return ToolResult({"avg_rpm": None}, "sandbox", 0,
                          f"{origin}→{dest}: no lane history (first haul)")
    return ToolResult(
        {"avg_rpm": lane["avg_rpm"], "samples": lane.get("samples"), "window_days": lane.get("window_days", 90)},
        "sandbox", 0,
        f"{origin}→{dest} {lane.get('window_days', 90)}d avg ${lane['avg_rpm']:.2f}/loaded mi ({lane.get('samples', '?')} hauls)")


@tool("graph.query", scope="graph.read")
async def graph_query(mc_number: str) -> ToolResult:
    b = await bank.get("brokers", mc_number)
    col = await bank.broker_collisions(mc_number)
    value = {"record": b, "collisions": col}
    if b is None:
        return ToolResult(value, "live", 0, f"{mc_number}: no record in graph")
    bits = []
    if col["phone"]:
        bits.append(f"phone {b['phone']} shared with {', '.join(x['name'] for x in col['phone'])}")
    if col["ach"]:
        bits.append(f"ACH routing shared with {len(col['ach'])} other entit{'ies' if len(col['ach']) > 1 else 'y'}")
    if b.get("unpaid"):
        bits.append(f"${b['unpaid']:,} unpaid to this carrier")
    if b.get("prior_loads"):
        bits.append(f"{b['prior_loads']} prior loads · avg pay {b['avg_pay_days']}d")
    if not bits:
        bits.append("no collisions, no history")
    return ToolResult(value, "live", 0, f"{mc_number}: " + " · ".join(bits))


@tool("graph.write", scope="graph.write")
async def graph_write(mc_number: str, patch: dict) -> ToolResult:
    doc = await bank.get("brokers", mc_number)
    if doc is None:
        doc = {"_key": mc_number, "name": mc_number, "prior_loads": 0,
               "avg_pay_days": 0, "unpaid": 0, "real_mc": True}
        await bank.put("brokers", mc_number, doc)
    updated = await bank.patch("brokers", mc_number, patch)
    changed = ", ".join(f"{k}={v}" for k, v in patch.items())
    return ToolResult(updated, "live", 0, f"graph updated {mc_number}: {changed}")
