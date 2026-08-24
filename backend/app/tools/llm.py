"""Gemini access. One place builds the client; every caller degrades to a
labeled template when no key is configured so the demo never dies on stage."""
from __future__ import annotations

import asyncio
from typing import Any

from ..config import settings

_client = None


def client():
    global _client
    if _client is None and settings().has_gemini:
        from google import genai
        _client = genai.Client(api_key=settings().gemini_api_key)
    return _client


async def generate(prompt: str, *, system: str | None = None,
                   template: str = "", max_tokens: int = 300) -> tuple[str, str]:
    """Returns (text, backend) where backend is 'live' or 'template'."""
    c = client()
    if c is None:
        return template, "template"
    from google.genai import types
    cfg = types.GenerateContentConfig(
        system_instruction=system, max_output_tokens=max_tokens, temperature=0.4)
    try:
        resp = await asyncio.wait_for(
            c.aio.models.generate_content(
                model=settings().gemini_model, contents=prompt, config=cfg),
            timeout=25,
        )
        text = (resp.text or "").strip()
        return (text or template), ("live" if text else "template")
    except Exception:
        return template, "template"


async def generate_with_file(prompt: str, *, data: bytes, mime: str,
                             template: str = "", max_tokens: int = 500) -> tuple[str, str]:
    c = client()
    if c is None:
        return template, "template"
    from google.genai import types
    try:
        resp = await asyncio.wait_for(
            c.aio.models.generate_content(
                model=settings().gemini_model,
                contents=[types.Part.from_bytes(data=data, mime_type=mime), prompt],
                config=types.GenerateContentConfig(max_output_tokens=max_tokens, temperature=0.1),
            ),
            timeout=40,
        )
        text = (resp.text or "").strip()
        return (text or template), ("live" if text else "template")
    except Exception:
        return template, "template"


async def function_call(prompt: str, *, system: str, tools: list[dict],
                        history: list[dict] | None = None) -> dict[str, Any]:
    """Chat turn with function calling. Returns {'text': ..., 'call': {name, args} | None, 'backend': ...}."""
    c = client()
    if c is None:
        return {"text": "", "call": None, "backend": "template"}
    from google.genai import types
    decls = [types.FunctionDeclaration(**t) for t in tools]
    contents: list[Any] = []
    for h in history or []:
        contents.append(types.Content(role=h["role"], parts=[types.Part(text=h["text"])]))
    contents.append(types.Content(role="user", parts=[types.Part(text=prompt)]))
    try:
        resp = await asyncio.wait_for(
            c.aio.models.generate_content(
                model=settings().gemini_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    tools=[types.Tool(function_declarations=decls)],
                    temperature=0.2,
                ),
            ),
            timeout=30,
        )
    except Exception as e:
        return {"text": f"(Gemini unavailable: {type(e).__name__})", "call": None, "backend": "template"}
    call = None
    text_parts: list[str] = []
    cand = resp.candidates[0] if resp.candidates else None
    for part in (cand.content.parts if cand and cand.content else []) or []:
        if getattr(part, "function_call", None):
            call = {"name": part.function_call.name, "args": dict(part.function_call.args or {})}
        elif getattr(part, "text", None):
            text_parts.append(part.text)
    return {"text": "\n".join(text_parts).strip(), "call": call, "backend": "live"}
