"""ELD read + hours-of-service legality. The truck is simulated (a real fleet
would wire Motive/Samsara here); the HOS math itself is real FMCSA logic:
11h driving cap within a 14h on-duty window, 10h reset."""
from __future__ import annotations

from ..platform.gateway import ToolResult, tool
from ..platform.memory import bank

AVG_MPH = 52.0


@tool("eld.read", scope="eld.read")
async def eld_read() -> ToolResult:
    tenant = await bank.get("settings", "tenant")
    t = tenant["truck"]
    detail = (f"truck {t['id']} at {t['city']} · {t['hos_left_h']:.1f}h drive remaining"
              f" · empty in {t['empty_in_h']:.1f}h")
    return ToolResult(t, "sandbox", 0, detail)


@tool("hos.check", scope="hos.check")
async def hos_check(drive_hours: float, hos_left_h: float) -> ToolResult:
    same_day = drive_hours <= hos_left_h
    with_reset = drive_hours <= min(11.0, hos_left_h + 11.0)
    verdict = ("legal today" if same_day
               else "needs 10h reset" if with_reset else "illegal to run")
    value = {"same_day": same_day, "with_reset": with_reset, "verdict": verdict,
             "drive_hours": round(drive_hours, 1)}
    return ToolResult(value, "live", 0,
                      f"{drive_hours:.1f}h drive vs {hos_left_h:.1f}h available → {verdict}")
