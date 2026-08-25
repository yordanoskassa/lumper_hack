"""FMCSA QCMobile: carrier/broker authority, insurance, out-of-service, and
the registered contact of record. Live for any real MC once FMCSA_WEBKEY is
set (Login.gov, free). Seeded sandbox brokers screen against their seeded
records, labeled 'sandbox' — we never claim a live federal check we didn't
make.

`fmcsa.contact` is deliberately a separate call: the whole point of the
callback cross-check is that the contact details come from the registry
*independently* of whatever the load posting claims.

QCMobile answers a bad or missing WebKey with **404 and a plain string body**
(`{"content": "Webkey not found"}`) — byte-identical in shape to a docket that
genuinely has no record. Conflating the two would report a broken key as "this
broker does not exist federally", which is the worst possible lie for a fraud
screen to tell, so `_live_lookup` distinguishes them and returns UNAVAILABLE
for anything that is our problem rather than the broker's."""
from __future__ import annotations

import httpx

from ..config import settings
from ..platform.gateway import ToolResult, tool
from ..platform.memory import bank

BASE = "https://mobile.fmcsa.dot.gov/qc/services"
UNAVAILABLE = "unavailable"   # our key/our network — never "no such broker"


async def _live_lookup(mc_number: str) -> dict | str | None:
    """A record, `None` for a docket FMCSA has no row for, or UNAVAILABLE."""
    digits = mc_number.upper().replace("MC-", "").replace("MC", "").strip()
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(f"{BASE}/carriers/docket-number/{digits}",
                             params={"webKey": settings().fmcsa_webkey})
        if r.status_code in (401, 403, 429) or r.status_code >= 500:
            return UNAVAILABLE
        content = r.json().get("content")
        # a rejected WebKey comes back as a string, a real answer as a list
        if isinstance(content, str):
            return UNAVAILABLE
        if r.status_code == 404 or not content:
            return None
    except (httpx.HTTPError, ValueError) as e:  # network, timeout, bad JSON
        del e
        return UNAVAILABLE
    c = (content[0] or {}).get("carrier") or {}
    return {
        "legal_name": c.get("legalName"),
        "dba": c.get("dbaName"),
        "allowed_to_operate": c.get("allowedToOperate") == "Y",
        "broker_authority": c.get("brokerAuthorityStatus"),
        "common_authority": c.get("commonAuthorityStatus"),
        "bipd_insurance_on_file": (c.get("bipdInsuranceOnFile") or "0") not in ("0", "", None),
        "oos_date": c.get("oosDate"),
        "dot_number": c.get("dotNumber"),
        # the callback cross-check is the reason this tool exists — carry the
        # contact fields, or `fmcsa.contact` returns None phone/None email the
        # moment a real WebKey lands and the cross-check silently stops running.
        "phone": c.get("phyPhone") or c.get("phone"),
        "email": c.get("emailAddress"),
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
        if rec == UNAVAILABLE:
            return ToolResult(
                {"source": "unavailable", "found": False}, "cached", 0,
                f"{mc_number}: QCMobile rejected the WebKey or is unreachable — "
                f"falling back to the keyless SAFER record")
        if rec is None:
            return ToolResult({"source": "qcmobile", "found": False}, "live", 0,
                              f"{mc_number}: no FMCSA record found")
        # A brokerage owns no trucks, so `allowedToOperate` is routinely N and
        # BIPD is routinely 0 on a perfectly licensed broker. Read the broker
        # authority status, not the motor-carrier fields.
        broker_ok = (rec.get("broker_authority") or "").upper().startswith(("A", "Y"))
        value = {
            "source": "qcmobile", "found": True,
            "authority_active": (rec["allowed_to_operate"] or broker_ok) and not rec["oos_date"],
            "insurance_on_file": rec["bipd_insurance_on_file"],
            "out_of_service": bool(rec["oos_date"]),
            "legal_name": rec["legal_name"], "dot_number": rec["dot_number"],
        }
        bits = [f"{rec['legal_name']}",
                f"broker authority {rec.get('broker_authority') or 'none'}",
                "allowed to operate" if rec["allowed_to_operate"] else "no motor-carrier authority",
                "insurance on file" if rec["bipd_insurance_on_file"] else "no BIPD filing"]
        if rec["oos_date"]:
            bits.append(f"OOS since {rec['oos_date']}")
        return ToolResult(value, "live", 0, f"{mc_number}: " + " · ".join(bits))

    return ToolResult(
        {"source": "unavailable", "found": False}, "cached", 0,
        f"{mc_number}: FMCSA WebKey not configured — authority read from the keyless "
        f"SAFER Licensing & Insurance record instead")


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
        if rec == UNAVAILABLE:
            return ToolResult({"source": "unavailable", "found": False, "mc": mc_number},
                              "cached", 0,
                              f"{mc_number}: QCMobile unavailable — cross-checking against "
                              f"the keyless SAFER census phone instead")
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
                      f"{mc_number}: no QCMobile WebKey — callback cross-check falls back "
                      f"to the keyless SAFER census phone")
