"""Fine Print — audits the broker's rate con against the locked terms. Model
Armor screens the PDF BEFORE any model reads it; if clean, Document AI extracts
it and Fine Print diffs every field, drafting a correction email on a short.
This is where the prompt-injection attack is caught."""
from __future__ import annotations

from .base import Agent
from ..platform import armor
from ..platform.memory import bank
from ..platform.observability import TraceEvent, hub
from . import llm_helper


class FinePrint(Agent):
    key = "FINE"

    async def audit(self, run_id: str, load_id: str, pdf_bytes: bytes,
                    injected: bool = False) -> dict:
        locked = await bank.get("locked_terms", load_id) or {}
        self.say(run_id, f"auditing rate con for {load_id} against locked terms")

        # 1) Model Armor BEFORE extraction — the whole point of the ordering
        text_layer = _extract_raw_text(pdf_bytes)
        verdict = armor.screen_pdf(pdf_bytes, text_layer)
        hub.emit(TraceEvent(run_id=run_id, agent="Model Armor", kind="armor",
                            backend="live",
                            tone="block" if not verdict.allowed else "pass",
                            msg=(f"BLOCKED — {verdict.detail}" if not verdict.allowed
                                 else "screen PASS · no hidden layer, no injection")))
        if not verdict.allowed:
            for f in verdict.findings[:2]:
                hub.emit(TraceEvent(run_id=run_id, agent="Model Armor", kind="armor",
                                    tone="block", msg=f))
            quarantine = {"load_id": load_id, "threat": verdict.threat,
                          "findings": verdict.findings}
            await bank.put("quarantine", load_id, quarantine)
            self.say(run_id, "document quarantined · extraction aborted · broker record untouched",
                     "block")
            return {"blocked": True, "verdict": verdict.to_dict()}

        # 2) Document AI extraction (Gemini multimodal)
        ext = await self.call(run_id, "doc.extract", pdf_bytes=pdf_bytes, template=locked,
                              trace="Document AI — {detail}")
        parsed = ext.value

        # 3) diff vs locked terms
        diffs = []
        for field in ("rate", "detention_rate", "free_hours"):
            want, got = locked.get(field), parsed.get(field)
            if want is not None and got is not None and str(want) != str(got):
                diffs.append({"field": field, "agreed": want, "on_paper": got})

        if not diffs:
            self.say(run_id, "diff vs locked terms: rate ✓ detention ✓ · no exceptions", "pass")
            return {"blocked": False, "exceptions": [], "parsed": parsed}

        short = next((d for d in diffs if d["field"] == "rate"), diffs[0])
        template = (f"Rate con shows {short['field']} {short['on_paper']} but we agreed "
                    f"{short['agreed']}. Please correct and resend.")
        draft = await llm_helper.explain(
            run_id, self,
            system="You are Fine Print. Draft a 2-sentence, firm-but-polite correction email to the broker.",
            prompt=f"Load {load_id}. Discrepancies: {diffs}. Agreed terms are the reference.",
            template=template)
        await self.call(run_id, "mail.send",
                        to=locked.get("broker_email", "dispatch@broker.example"),
                        subject=f"Correction needed — rate con {load_id}",
                        body=draft, kind="correction", trace="Gmail — {detail}")
        self.say(run_id, f"caught {len(diffs)} exception(s) · correction drafted and sent", "warn")
        return {"blocked": False, "exceptions": diffs, "parsed": parsed}


def _extract_raw_text(pdf_bytes: bytes) -> str:
    try:
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""
