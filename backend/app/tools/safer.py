"""SAFER — the federal record of who a carrier or broker actually is.

FMCSA's public SAFER Company Snapshot is an HTML form behind a session, which
is no good in an agent loop. The same federal data is published as open JSON on
data.transportation.gov with no key and no signup, so this is a genuinely LIVE
federal retrieval on any machine:

  6eyk-hxee  Licensing & Insurance  — legal name, registered business address,
             broker/common/contract authority status, bond and BIPD filings,
             and `undeliverable_mail`: FMCSA's own mail to them came back.
  az4n-8mr2  Motor Carrier Census   — the phone number of record, power units,
             DOT status, and the MC docket the DOT number maps to.

The cross-check is the point. A double-brokering scam posts a load under a real
broker's MC number but with its own phone, email and lookalike domain, banking
on nobody pulling the registry copy. We pull it, field by field, and diff it.
"""
from __future__ import annotations

import re

import httpx

from ..platform.gateway import ToolResult, tool

SODA = "https://data.transportation.gov/resource"
LI = f"{SODA}/6eyk-hxee.json"      # Licensing & Insurance
CENSUS = f"{SODA}/az4n-8mr2.json"  # Motor Carrier Census

AUTHORITY = {"A": "active", "I": "inactive", "N": "none", "P": "pending", "R": "revoked"}


def _digits(mc: str) -> str:
    return re.sub(r"\D", "", mc or "")


def _docket(mc: str) -> str:
    """SODA stores dockets zero-padded to six digits, e.g. MC012892."""
    return f"MC{_digits(mc).zfill(6)}"


def normalize_phone(p: str | None) -> str:
    return re.sub(r"\D", "", p or "")


def phones_match(a: str | None, b: str | None) -> bool:
    """Compare on the last 10 digits so a leading 1 or +1 isn't a false alarm."""
    x, y = normalize_phone(a)[-10:], normalize_phone(b)[-10:]
    return bool(x) and x == y


async def _get(cx: httpx.AsyncClient, url: str, params: dict) -> list[dict]:
    r = await cx.get(url, params=params, headers={"accept": "application/json"})
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else []


@tool("safer.lookup", scope="fmcsa.read")
async def lookup(mc_number: str) -> ToolResult:
    """Pull the federal record of an MC number. Live and keyless."""
    docket = _docket(mc_number)
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as cx:
        li = await _get(cx, LI, {"docket_number": docket})
        if not li:
            return ToolResult({"found": False, "mc": mc_number, "docket": docket},
                              "live", 0,
                              f"{mc_number} — no federal record under {docket}")
        rec = li[0]
        dot = str(rec.get("dot_number") or "").lstrip("0")
        census: dict = {}
        if dot:
            rows = await _get(cx, CENSUS, {"dot_number": dot})
            census = rows[0] if rows else {}

    addr = " ".join(
        str(rec.get(k) or "").strip()
        for k in ("bus_street_po", "bus_city", "bus_state_code", "bus_zip_code")
    ).strip()

    value = {
        "found": True,
        "mc": mc_number,
        "docket": docket,
        "dot_number": dot,
        "legal_name": (rec.get("legal_name") or "").strip(),
        "dba_name": (rec.get("dba_name") or "").strip(),
        "registered_address": addr,
        "registered_phone": census.get("phone"),
        "broker_authority": AUTHORITY.get(rec.get("broker_stat", ""), rec.get("broker_stat")),
        "common_authority": AUTHORITY.get(rec.get("common_stat", ""), rec.get("common_stat")),
        "contract_authority": AUTHORITY.get(rec.get("contract_stat", ""), rec.get("contract_stat")),
        # FMCSA's own mail bounced. On a broker this is a strong shell signal.
        "undeliverable_mail": rec.get("undeliverable_mail") == "Y",
        "bond_on_file": rec.get("bond_file") == "Y",
        "bond_required": rec.get("bond_req") == "Y",
        "power_units": int(census["power_units"]) if str(census.get("power_units", "")).isdigit() else None,
        "dot_status": census.get("status_code"),
        "source": "FMCSA Licensing & Insurance + Motor Carrier Census (data.transportation.gov)",
    }
    name = value["legal_name"] or mc_number
    return ToolResult(value, "live", 0, f"SAFER: {name} · broker authority {value['broker_authority']}"
                + (" · FMCSA mail undeliverable" if value["undeliverable_mail"] else ""),
    )


@tool("safer.crosscheck", scope="fmcsa.read")
async def crosscheck(
    mc_number: str,
    posted_phone: str | None = None,
    posted_email: str | None = None,
    posted_company: str | None = None,
) -> ToolResult:
    """Diff what the load posting claims against the federal record.

    Every finding names both sides, because "MISMATCH" on its own is a claim and
    "posting says X, the registry says Y" is evidence.
    """
    fed = await lookup(mc_number)
    rec = fed.value
    if not rec.get("found"):
        return ToolResult({"verdict": "UNKNOWN", "risk": 50, "findings": [
                {"field": "registry", "ok": False,
                 "detail": f"No federal record exists for {mc_number}"}
            ], "federal": rec}, "live", 0, f"{mc_number} is not in the federal registry")

    findings: list[dict] = []
    risk = 0

    if posted_phone and rec.get("registered_phone"):
        ok = phones_match(posted_phone, rec["registered_phone"])
        findings.append({
            "field": "phone", "ok": ok,
            "posted": posted_phone, "registry": rec["registered_phone"],
            "detail": (
                f"Posting says {posted_phone} · federal registry says {rec['registered_phone']}"
                if not ok else f"Phone matches the registry ({posted_phone})"
            ),
        })
        if not ok:
            risk += 40

    if posted_company and rec.get("legal_name"):
        a = re.sub(r"[^a-z]", "", posted_company.lower())
        b = re.sub(r"[^a-z]", "", rec["legal_name"].lower())
        ok = a in b or b in a
        findings.append({
            "field": "name", "ok": ok,
            "posted": posted_company, "registry": rec["legal_name"],
            "detail": (
                f"Posting says “{posted_company}” · registry says “{rec['legal_name']}”"
                if not ok else f"Name matches the registry ({rec['legal_name']})"
            ),
        })
        if not ok:
            risk += 20

    if posted_email:
        # A broker emailing from a domain unrelated to its registered name is
        # how a lookalike gets read as the real company.
        domain = posted_email.split("@")[-1].lower()
        stem = re.sub(r"[^a-z]", "", (rec.get("legal_name") or "").lower())[:10]
        ok = bool(stem) and stem[:6] in re.sub(r"[^a-z]", "", domain)
        findings.append({
            "field": "email", "ok": ok, "posted": posted_email,
            "registry": rec.get("legal_name"),
            "detail": (
                f"{domain} does not belong to {rec.get('legal_name')}"
                if not ok else f"{domain} matches the registered name"
            ),
        })
        if not ok:
            risk += 15

    ba = rec.get("broker_authority")
    if ba != "active":
        findings.append({"field": "authority", "ok": False,
                         "detail": f"Broker authority is {ba}, not active"})
        risk += 25
    else:
        findings.append({"field": "authority", "ok": True,
                         "detail": "Broker authority is active"})

    if rec.get("undeliverable_mail"):
        findings.append({"field": "mail", "ok": False,
                         "detail": "Federal mail to this company came back undeliverable"})
        risk += 20

    if rec.get("bond_required") and not rec.get("bond_on_file"):
        findings.append({"field": "bond", "ok": False,
                         "detail": "Required surety bond is not on file"})
        risk += 15

    risk = min(100, risk)
    verdict = "REFUSE" if risk >= 55 else "REVIEW" if risk >= 25 else "CLEAR"
    failed = sum(1 for f in findings if not f["ok"])
    return ToolResult({"verdict": verdict, "risk": risk, "findings": findings, "federal": rec}, "live", 0, f"SAFER cross-check {rec.get('legal_name') or mc_number}: "
                f"{verdict} · risk {risk}/100 · {failed}/{len(findings)} checks failed",
    )
