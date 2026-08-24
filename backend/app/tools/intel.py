"""Carrier intelligence held in the Memory Bank: lane rate history (the
BigQuery role), the broker graph (collisions + payment behavior), a reverse
index from a phone/ACH/domain back to whoever registered it, and episodic
memory — the specific things that happened to this carrier, which is what an
agent should be able to cite instead of a score."""
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


@tool("graph.who_owns", scope="graph.read")
async def who_owns(phone: str | None = None, email: str | None = None,
                   domain: str | None = None) -> ToolResult:
    """Reverse lookup: which registered entity actually holds this phone,
    email or domain. Turns 'the posting gave a different number' into
    'the posting gave a shell's number'."""
    dom = domain or (email.split("@", 1)[1] if email and "@" in email else None)
    hits = []
    for b in await bank.all("brokers"):
        if (phone and b.get("phone") == phone) or (dom and b.get("domain") == dom) \
                or (email and b.get("email") == email):
            hits.append(b)
    if not hits:
        return ToolResult({"owners": []}, "live", 0,
                          f"{phone or dom}: not registered to anyone in the graph")
    names = ", ".join(f"{h['name']} ({h['_key']})" for h in hits)
    return ToolResult({"owners": hits}, "live", 0, f"{phone or dom} belongs to {names}")


@tool("memory.recall", scope="memory.read")
async def memory_recall(mc_number: str | None = None, ach: str | None = None,
                        phone: str | None = None, limit: int = 4) -> ToolResult:
    """Episodic recall. Anything this desk remembers about the MC, or about the
    bank account / phone number it is standing behind."""
    keys = {"mc": mc_number, "ach": ach, "phone": phone}
    out = []
    for m in await bank.all("memories"):
        if any(v and m.get(k) == v for k, v in keys.items()):
            out.append(m)
    out.sort(key=lambda m: m.get("days_ago", 999))
    out = out[:limit]
    if not out:
        return ToolResult({"memories": []}, "live", 0,
                          f"{mc_number or ach or phone}: nothing remembered")
    detail = " · ".join(f"{m['kind']} {m['days_ago']}d ago" for m in out)
    return ToolResult({"memories": out}, "live", 0,
                      f"{len(out)} memory hit(s): {detail}")


@tool("memory.write", scope="memory.write")
async def memory_write(key: str, kind: str, text: str, mc_number: str | None = None,
                       amount: float = 0, ach: str | None = None) -> ToolResult:
    doc = {"kind": kind, "text": text, "mc": mc_number, "amount": amount,
           "ach": ach, "days_ago": 0}
    await bank.put("memories", key, doc)
    return ToolResult(doc, "live", 0, f"remembered: {text[:80]}")


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
