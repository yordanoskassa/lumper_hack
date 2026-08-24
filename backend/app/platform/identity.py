"""Agent Identity: zero-trust between agents and tools. Each agent is issued a
short-lived HMAC-signed token carrying its scopes; the Gateway verifies the
signature, expiry and scope on every tool invocation. No token, no tool."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

_SIGNING_KEY = secrets.token_bytes(32)  # rotated on every process start
TOKEN_TTL_S = 15 * 60


class IdentityError(Exception):
    pass


def mint_token(agent: str, scopes: list[str]) -> str:
    body = {"sub": agent, "scopes": sorted(scopes), "iat": time.time(),
            "exp": time.time() + TOKEN_TTL_S, "jti": secrets.token_hex(6)}
    raw = json.dumps(body, separators=(",", ":")).encode()
    sig = hmac.new(_SIGNING_KEY, raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw).decode() + "." + base64.urlsafe_b64encode(sig).decode()


def verify_token(token: str) -> dict:
    try:
        raw_b64, sig_b64 = token.split(".")
        raw = base64.urlsafe_b64decode(raw_b64)
        sig = base64.urlsafe_b64decode(sig_b64)
    except (ValueError, TypeError) as e:
        raise IdentityError("malformed token") from e
    if not hmac.compare_digest(sig, hmac.new(_SIGNING_KEY, raw, hashlib.sha256).digest()):
        raise IdentityError("bad signature")
    body = json.loads(raw)
    if body["exp"] < time.time():
        raise IdentityError("token expired")
    return body


def check_scope(token: str, required_scope: str) -> dict:
    body = verify_token(token)
    if required_scope not in body["scopes"]:
        raise IdentityError(
            f"agent '{body['sub']}' lacks scope '{required_scope}' "
            f"(has: {', '.join(body['scopes']) or 'none'})"
        )
    return body
