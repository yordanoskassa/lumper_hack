"""Model Armor: inline screening of every untrusted document/text BEFORE any
model or agent reads it. Detects prompt-injection phrasing, hidden text layers
in PDFs (white / sub-2pt glyphs written to be invisible to humans but read by
extractors), and obvious PII exfil attempts. Verdicts are traced and blocking.

This is a faithful local implementation of the Model Armor pattern; wire
`GOOGLE_CLOUD_PROJECT` + the Model Armor API for the managed version.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

INJECTION_PATTERNS: list[tuple[str, str]] = [
    (r"ignore\s+(all\s+)?(previous|prior|earlier)\s+instructions", "instruction override"),
    (r"disregard\s+(the\s+)?(system|previous|prior)", "instruction override"),
    (r"you\s+are\s+now\s+", "role hijack"),
    (r"mark\s+(this\s+)?(broker|carrier|vendor)\s+(as\s+)?(verified|clear|trusted)", "verdict tampering"),
    (r"(approve|authorize)\s+(the\s+)?(payment|invoice|transfer)", "payment tampering"),
    (r"system\s*prompt", "prompt probe"),
    (r"do\s+not\s+(tell|inform|alert)\s+(the\s+)?(user|human|operator)", "concealment"),
    (r"exfiltrate|send\s+.{0,40}(credentials|api\s*key|password)", "exfil attempt"),
]


@dataclass
class ArmorVerdict:
    allowed: bool
    threat: str | None = None          # e.g. "prompt injection"
    detail: str | None = None          # plain-English evidence
    findings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"allowed": self.allowed, "threat": self.threat,
                "detail": self.detail, "findings": self.findings}


def screen_text(text: str) -> ArmorVerdict:
    findings = []
    lowered = text.lower()
    for pattern, label in INJECTION_PATTERNS:
        m = re.search(pattern, lowered)
        if m:
            snippet = text[max(0, m.start() - 20): m.end() + 40].replace("\n", " ").strip()
            findings.append(f"{label}: “{snippet}”")
    if findings:
        return ArmorVerdict(False, "prompt injection",
                            f"{len(findings)} injected instruction(s) detected", findings)
    return ArmorVerdict(True)


def _hidden_text_findings(pdf_bytes: bytes) -> list[str]:
    """Scan raw PDF content streams for text painted invisibly: white fill
    (`1 1 1 rg`) or microscopic font sizes (<= 2pt) before a show-text op."""
    findings: list[str] = []
    try:
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page_no, page in enumerate(reader.pages, start=1):
            contents = page.get_contents()
            raw = contents.get_data() if contents is not None else b""
            stream = raw.decode("latin-1", errors="ignore")
            # white (or near-white) fill followed by text showing on same page
            for m in re.finditer(r"(0\.9[5-9]\d*|1|1\.0+)\s+(0\.9[5-9]\d*|1|1\.0+)\s+(0\.9[5-9]\d*|1|1\.0+)\s+rg(.{0,600}?)(Tj|TJ)", stream, re.S):
                findings.append(f"white-on-white text layer, page {page_no}")
                break
            for m in re.finditer(r"/\w+\s+([0-2](\.\d+)?)\s+Tf", stream):
                if float(m.group(1)) <= 2:
                    findings.append(f"{m.group(1)}pt micro text, page {page_no}")
                    break
    except Exception as e:  # pragma: no cover - corrupt files just get flagged
        findings.append(f"unreadable structure ({type(e).__name__})")
    return findings


def screen_pdf(pdf_bytes: bytes, extracted_text: str) -> ArmorVerdict:
    hidden = _hidden_text_findings(pdf_bytes)
    text_verdict = screen_text(extracted_text)
    if hidden and not text_verdict.allowed:
        return ArmorVerdict(False, "prompt injection",
                            f"hidden text layer detected ({hidden[0]}) carrying injected instructions",
                            hidden + text_verdict.findings)
    if not text_verdict.allowed:
        return text_verdict
    if hidden:
        return ArmorVerdict(False, "hidden content",
                            f"invisible text layer detected ({hidden[0]})", hidden)
    return ArmorVerdict(True)
