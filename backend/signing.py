"""
backend/signing.py — HMAC request signing for expensive endpoints.

Layered on top of cookie-based auth, this makes it significantly harder for
someone who has *only* managed to grab a session cookie (e.g. via a narrow
XSS window) to then walk up to our expensive endpoints (`/api/chat`,
`/api/voice/*`) with curl. They also need a short-lived signing key, which
is issued once per session via POST /api/auth/sign-key and only scoped to
this endpoint family.

Scheme (intentionally boring — easier to audit):

    digest  = sha256(body)                              # hex
    msg     = f"{METHOD}|{PATH}|{digest}|{TIMESTAMP}|{NONCE}"
    sig     = hmac_sha256(signing_key, msg)             # hex

Client sends (all required):
    X-Orryon-Sig:   <sig>
    X-Orryon-Ts:    <unix-seconds>
    X-Orryon-Nonce: <random 128 bits, hex>

Server:
    - Rejects if |now - ts| > 60s                       (replay window)
    - Rejects if nonce has already been consumed        (replay protection)
    - Recomputes sig from the session's signing key and compares constant-time

The signing key is *derived* server-side from JWT_SECRET + user_id + iat, so
there's no storage layer. The client fetches it once per session from
POST /api/auth/sign-key (cookie-auth'd) and keeps it in memory only.

Rollout mode — REQUEST_SIGNING_MODE env var:
    "off"     → skip all checks (default in dev; curl works unchanged).
    "warn"    → attempt verification; log mismatches but don't reject. Use
                this for the first production rollout so you can watch for
                legitimate traffic that somehow slipped through unsigned.
    "enforce" → reject any request that fails any check with 401.

Legacy escape hatch `DISABLE_REQUEST_SIGNING=1` is honored as "off" so
existing dev environments keep working.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time

from fastapi import Depends, HTTPException, Request

from backend.auth import decode_token, get_current_user
from backend.cache import consume_nonce_async

logger = logging.getLogger(__name__)


_MAX_SKEW_SECONDS = 60

# How long a nonce is remembered. Must be >= 2 × skew so a replay attempt
# straddling the timestamp window still hits the nonce table.
_NONCE_TTL_SECONDS = 180

_SIGN_KEY_DOMAIN = b"orryon.sign.v1"


def _jwt_secret() -> bytes:
    secret = os.getenv("JWT_SECRET", "")
    if not secret:
        from backend.auth import _get_secret  # falls back to the cached dev secret
        secret = _get_secret()
    return secret.encode("utf-8")


def get_signing_mode() -> str:
    """Return the active request-signing mode: off | warn | enforce."""
    from backend.deps import IS_LOCAL_DEV, IS_PRODUCTION

    if os.getenv("DISABLE_REQUEST_SIGNING", "").lower() in {"1", "true", "yes"}:
        if IS_PRODUCTION:
            logger.error(
                "DISABLE_REQUEST_SIGNING is set but ignored in production — "
                "remove it and use REQUEST_SIGNING_MODE instead."
            )
        else:
            return "off"

    mode = (os.getenv("REQUEST_SIGNING_MODE") or "").strip().lower()
    if mode in {"off", "warn", "enforce"}:
        return mode

    # Default: off in local dev, enforce everywhere else (staging/prod).
    return "off" if IS_LOCAL_DEV else "enforce"


def _signing_mode() -> str:
    return get_signing_mode()


def validate_signing_config() -> None:
    """Fail fast on boot when production cannot enforce signed expensive routes."""
    from backend.deps import IS_LOCAL_DEV, IS_PRODUCTION

    mode = get_signing_mode()
    if IS_PRODUCTION and mode != "enforce":
        raise RuntimeError(
            f"REQUEST_SIGNING_MODE must be 'enforce' in production (got {mode!r}). "
            "Unset DISABLE_REQUEST_SIGNING and set REQUEST_SIGNING_MODE=enforce."
        )
    if IS_PRODUCTION and not os.getenv("JWT_SECRET", "").strip():
        raise RuntimeError(
            "JWT_SECRET must be set in production — session tokens and signing "
            "keys are derived from it."
        )


def derive_signing_key(user_id: str, iat: int) -> str:
    """Deterministic per-session signing key. Never persisted anywhere."""
    msg = f"{user_id}:{iat}".encode("utf-8")
    digest = hmac.new(_jwt_secret() + _SIGN_KEY_DOMAIN, msg, hashlib.sha256).hexdigest()
    return digest


def issue_signing_key_for_token(token: str) -> dict[str, str | int]:
    """Return `{key, kid, iat}` for a raw JWT string."""
    from backend.auth import jwt_iat_unix

    payload = decode_token(token)
    uid = payload["sub"]
    iat = jwt_iat_unix(payload)
    return {
        "key": derive_signing_key(uid, iat),
        "kid": f"{uid[:8]}:{iat}",
        "iat": iat,
    }


def _compute_signature(
    key: str, method: str, path: str, body: bytes, ts: str, nonce: str
) -> str:
    digest = hashlib.sha256(body).hexdigest()
    msg = f"{method.upper()}|{path}|{digest}|{ts}|{nonce}".encode("utf-8")
    return hmac.new(key.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def _fail(mode: str, reason: str, path: str, uid: str | None = None) -> None:
    """Log + (in enforce mode) raise a 401."""
    logger.warning(
        "Request signature check failed: %s on %s (mode=%s, uid=%s)",
        reason, path, mode, uid,
    )
    if mode == "enforce":
        raise HTTPException(401, "Invalid or missing request signature.")


async def require_signed_request(
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    """FastAPI dependency — enforce HMAC signature on a request.

    Behaviour is controlled by `REQUEST_SIGNING_MODE`:
      - off:     pass through (used in dev / curl / tests).
      - warn:    check everything; log failures; pass through anyway.
      - enforce: check everything; raise 401 on any failure.

    Even in "warn" mode we still call `get_current_user`, so callers must
    present a valid JWT — the signature is a *second* factor on top of that.
    """
    mode = _signing_mode()
    if mode == "off":
        return user

    path = request.url.path
    uid = user.get("user_id")

    sig = request.headers.get("x-orryon-sig", "")
    ts = request.headers.get("x-orryon-ts", "")
    nonce = request.headers.get("x-orryon-nonce", "")
    if not sig or not ts or not nonce:
        _fail(mode, "missing sig/ts/nonce header", path, uid)
        return user

    try:
        ts_int = int(ts)
    except ValueError:
        _fail(mode, "non-integer timestamp", path, uid)
        return user

    if abs(time.time() - ts_int) > _MAX_SKEW_SECONDS:
        _fail(mode, "timestamp outside skew window", path, uid)
        return user

    # Claim the nonce — rejects replays inside the skew window. Scope the
    # nonce to the user so two different users can't collide by accident.
    claimed = await consume_nonce_async(f"{uid}:{nonce}", _NONCE_TTL_SECONDS)
    if not claimed:
        _fail(mode, "nonce already used", path, uid)
        return user

    # Compute the body digest. For multipart uploads we intentionally sign an
    # empty payload — the browser's FormData doesn't expose a stable
    # serialization and the HMAC still binds method+path+timestamp+nonce,
    # which is sufficient to defeat replay from non-browser callers that
    # cannot obtain a signing key.
    content_type = (request.headers.get("content-type") or "").lower()
    if content_type.startswith("multipart/form-data"):
        body = b""
    else:
        body = await request.body()

    # Signing key is derived from user_id + JWT iat (already validated by
    # get_current_user). The Next.js proxy injects Authorization from the
    # HttpOnly session cookie — we do not require the browser to send Bearer.
    iat = int(user.get("iat") or 0)
    if not iat:
        _fail(mode, "missing session iat for signing key", path, uid)
        return user
    key = derive_signing_key(uid, iat)

    expected = _compute_signature(key, request.method, path, body, ts, nonce)
    if not hmac.compare_digest(expected, sig):
        _fail(mode, "signature mismatch", path, uid)
        return user

    return user
