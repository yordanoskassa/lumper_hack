"""Shared Gemini helper that keeps agent LLM output on the trace with a
backend label. Falls back to the supplied template string with no key.

Two hard-won details live here. The flash models spend 400-500 tokens on a
hidden reasoning pass whatever `thinking_budget` says, so the output cap has
to be generous or every verdict comes back cut off mid-word. And the trim to
trace length is sentence-aware for the same reason — a verdict that ends
"...does not match the" reads like a crash, not an answer."""
from __future__ import annotations

import re

from ..tools import llm

MAX_TRACE_CHARS = 300


def _clean(text: str, max_sentences: int = 2) -> str:
    """Live models like to answer with markdown, bullets, or a mini-essay.
    Flatten to a plain 1-2 sentence line that fits the trace and UI."""
    text = re.sub(r"[*_#`>]+", "", text)              # strip markdown marks
    text = re.sub(r"^\s*[-•]\s*", "", text, flags=re.M)  # strip bullet leaders
    text = " ".join(text.split())                      # collapse whitespace
    parts = [p for p in re.split(r"(?<=[.!?])\s+", text) if p]
    out = " ".join(parts[:max_sentences]).strip()
    # never hand the UI a half-word: drop whole sentences, then whole words
    while len(out) > MAX_TRACE_CHARS and len(parts) > 1:
        parts = parts[:-1]
        out = " ".join(parts[:max_sentences]).strip()
    if len(out) > MAX_TRACE_CHARS:
        out = out[:MAX_TRACE_CHARS].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return out


async def explain(run_id, agent, *, system: str, prompt: str, template: str,
                  tone: str = "ok") -> str:
    text, backend = await llm.generate(
        prompt, system=system + " Reply in one or two plain sentences, no markdown, no lists.",
        template=template, max_tokens=2048)
    if backend == "live":
        text = _clean(text) or template
        agent.say(run_id, f"Gemini: {text}", tone, backend="live")
    return text
