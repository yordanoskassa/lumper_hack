"""FMCSA QCMobile: carrier/broker authority, insurance, out-of-service, and
the registered contact of record. Live for any real MC once FMCSA_WEBKEY is
set (Login.gov, free). Seeded sandbox brokers screen against their seeded
records, labeled 'sandbox' — we never claim a live federal check we didn't
make.

`fmcsa.contact` is deliberately a separate call: the whole point of the
callback cross-check is that the contact details come from the registry
*independently* of whatever the load posting claims."""
from __future__ import annotations

import httpx

from ..config import settings
from ..platform.gateway import ToolResult, tool
from ..platform.memory import bank

BASE = "https://mobile.fmcsa.dot.gov/qc/services"


async def _live_lookup(mc_number: str) -> dict | None:
    digits = mc_number.upper().replace("MC-", "").replace("MC", "").strip()
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(f"{BASE}/carriers/docket-number/{digits}",
                         params={"webKey": settings().fmcsa_webkey})
        if r.status_code == 404:
            return None
        r.raise_for_status()
        content = r.json().get("content") or []
    if not content:
        return None
    c = (content[0] or {}).get("carrier", {})
    return {
        "legal_name": c.get("legalName"),
        "dba": c.get("dbaName"),
        "allowed_to_operate": c.get("allowedToOperate") == "Y",
        "broker_authority": c.get("brokerAuthorityStatus"),
        "common_authority": c.get("commonAuthorityStatus"),
        "bipd_insurance_on_file": (c.get("bipdInsuranceOnFile") or "0") not in ("0", "", None),
        "oos_date": c.get("oosDate"),
        "dot_number": c.get("dotNumber"),
    }


@tool("fmcsa.screen", scope="fmcsa.read")
async def screen(mc_number: str) -> ToolResult:
    seeded = await bank.get("brokers", mc_number)
    if seeded and not seeded.get("real_mc"):
        yrs = seeded["authority_age_days"] / 365
        value = {
            "source": "sandbox-record",
            "authority_active": seeded["authority_age_days"] >= 90 and not seeded["oos"],
            "authority_age_days": seeded["authority_age_days"],
            "insurance_on_file": seeded["insurance"],
            "out_of_service": seeded["oos"],
            "legal_name": seeded["name"],
        }
        bits = []
        bits.append(f"authority {'active ' + f'{yrs:.1f}y' if seeded['authority_age_days'] >= 365 else 'registered ' + str(seeded['authority_age_days']) + ' days ago'}")
        bits.append("insurance on file" if seeded["insurance"] else "NO insurance filing")
        bits.append("OOS ORDER ACTIVE" if seeded["oos"] else "no out-of-service order")
        return ToolResult(value, "sandbox", 0, f"{mc_number}: " + " · ".join(bits))

    if settings().has_fmcsa:
        rec = await _live_lookup(mc_number)
        if rec is None:
            return ToolResult({"source": "qcmobile", "found": False}, "live", 0,
                              f"{mc_number}: no FMCSA record found")
        value = {
            "source": "qcmobile", "found": True,
            "authority_active": rec["allowed_to_operate"] and not rec["oos_date"],
            "insurance_on_file": rec["bipd_insurance_on_file"],
            "out_of_service": bool(rec["oos_date"]),
            "legal_name": rec["legal_name"], "dot_number": rec["dot_number"],
        }
        bits = [f"{rec['legal_name']}",
                "allowed to operate" if rec["allowed_to_operate"] else "NOT allowed to operate",
                "insurance on file" if rec["bipd_insurance_on_file"] else "no BIPD filing"]
        if rec["oos_date"]:
            bits.append(f"OOS since {rec['oos_date']}")
        return ToolResult(value, "live", 0, f"{mc_number}: " + " · ".join(bits))

    return ToolResult(
        {"source": "unavailable", "found": False}, "cached", 0,
        f"{mc_number}: FMCSA WebKey not configured — cannot verify live (treat as unverified)")


@tool("fmcsa.contact", scope="fmcsa.read")
async def registered_contact(mc_number: str) -> ToolResult:
    """The phone/email/domain on file for this MC, looked up independently of
    the posting. A posting that lists different ones is the classic
    double-brokering tell."""
    seeded = await bank.get("brokers", mc_number)
    if seeded and not seeded.get("real_mc"):
        value = {"source": "sandbox-record", "found": True, "mc": mc_number,
                 "name": seeded["name"], "phone": seeded.get("phone"),
                 "email": seeded.get("email"), "domain": seeded.get("domain")}
        return ToolResult(value, "sandbox", 0,
                          f"{mc_number} registered contact: {seeded.get('phone')} · "
                          f"{seeded.get('email')}")

    if settings().has_fmcsa:
        rec = await _live_lookup(mc_number)
        if rec is None:
            return ToolResult({"source": "qcmobile", "found": False, "mc": mc_number},
                              "live", 0, f"{mc_number}: no registered contact on file")
        value = {"source": "qcmobile", "found": True, "mc": mc_number,
                 "name": rec["legal_name"], "phone": rec.get("phone"),
                 "email": rec.get("email"), "domain": None}
        return ToolResult(value, "live", 0,
                          f"{mc_number} registered to {rec['legal_name']} · "
                          f"{rec.get('phone') or 'no phone on file'}")

    return ToolResult({"source": "unavailable", "found": False, "mc": mc_number},
                      "cached", 0,
                      f"{mc_number}: no registry contact available — cannot cross-check callback")
