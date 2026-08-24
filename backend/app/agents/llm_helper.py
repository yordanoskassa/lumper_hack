"""Shared Gemini helper that keeps agent LLM output on the trace with a
backend label. Falls back to the supplied template string with no key."""
from __future__ import annotations

import re

from ..tools import llm


def _clean(text: str, max_sentences: int = 2) -> str:
    """Live models like to answer with markdown, bullets, or a mini-essay.
    Flatten to a plain 1-2 sentence line that fits the trace and UI."""
    text = re.sub(r"[*_#`>]+", "", text)              # strip markdown marks
    text = re.sub(r"^\s*[-•]\s*", "", text, flags=re.M)  # strip bullet leaders
    text = " ".join(text.split())                      # collapse whitespace
    parts = re.split(r"(?<=[.!?])\s+", text)
    out = " ".join(parts[:max_sentences]).strip()
    return out[:240]


async def explain(run_id, agent, *, system: str, prompt: str, template: str,
                  tone: str = "ok") -> str:
    text, backend = await llm.generate(
        prompt, system=system + " Reply in one or two plain sentences, no markdown, no lists.",
        template=template, max_tokens=512)
    if backend == "live":
        text = _clean(text) or template
        agent.say(run_id, f"Gemini: {text}", tone, backend="live")
    return text
