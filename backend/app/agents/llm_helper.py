"""Shared Gemini helper that keeps agent LLM output on the trace with a
backend label. Falls back to the supplied template string with no key."""
from __future__ import annotations

from ..tools import llm


async def explain(run_id, agent, *, system: str, prompt: str, template: str,
                  tone: str = "ok") -> str:
    text, backend = await llm.generate(prompt, system=system, template=template, max_tokens=160)
    if backend == "live":
        agent.say(run_id, f"Gemini: {text}", tone, backend="live")
    return text
