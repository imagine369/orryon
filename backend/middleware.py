"""
backend/middleware.py — Cross-cutting HTTP middleware.

These middlewares run on every request and provide defense-in-depth on top of
FastAPI's per-route auth:

1. Origin enforcement on state-changing requests. CORS is enforced by the
   browser only; curl, a cloned frontend, or a malicious server-side script
   ignores it. This middleware rejects any mutating request whose Origin/Referer
   header doesn't match our allowlist — even if the caller has a valid JWT.

2. Per-IP rate limiting as a safety net against abuse of anonymous endpoints
   (waitlist/contact/OTP) and as a circuit-breaker if an authenticated user's
   token is stolen and scripted. Per-user limits in backend/deps.py still apply;
   this is an upstream, coarser ceiling.

Public endpoints intentionally exempt from Origin enforcement are documented in
`_ORIGIN_EXEMPT_PATHS`. Everything else must come from an allowlisted origin.
"""

from __future__ import annotations

import logging
from typing import Iterable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# ── Origin enforcement ────────────────────────────────────────────────────────

# Methods that may mutate state and therefore require a trusted origin.
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Paths that intentionally accept cross-origin / no-origin requests:
# - health checks (monitors/probes)
# - public sign-up funnel (waitlist / contact / OTP flows fire before the user
#   has any session and may be submitted from marketing sub-pages)
# - Stripe + Google OAuth callbacks (Referer comes from Stripe/Google)
_ORIGIN_EXEMPT_PATHS: frozenset[str] = frozenset({
    "/api/health",
    "/health",
    "/api/ready",
    "/api/subscription/plans",
    "/api/waitlist",
    "/api/contact",
    "/api/auth/send-code",
    "/api/auth/email-status",
    "/api/auth/verify",
    "/api/auth/demo",
    "/api/stripe/webhook",
    "/api/calendar/google/callback",
})


def validate_origin_config(allowed_origins: list[str]) -> None:
    """Fail fast on boot when production has no CORS/origin allowlist."""
    from backend.deps import IS_PRODUCTION

    allowed = [o.rstrip("/") for o in allowed_origins if o]
    if IS_PRODUCTION and not allowed:
        raise RuntimeError(
            "FRONTEND_URL and/or APP_URL must be set in production — "
            "origin enforcement requires at least one allowed origin."
        )


def _host_matches_allowed(host: str, allowed: Iterable[str]) -> bool:
    host = host.split(":")[0].lower()
    for allowed_origin in allowed:
        if not allowed_origin:
            continue
        # https://www.orryon.com → www.orryon.com
        origin_host = allowed_origin.split("://", 1)[-1].split("/")[0].split(":")[0].lower()
        if host == origin_host:
            return True
    return False


def _has_signed_request_headers(request: Request) -> bool:
    """True when the client sent HMAC signing headers for expensive endpoints.

    Voice/chat routes validate the signature in ``require_signed_request``; we
    skip the coarse Origin gate here so the Electron desktop shell (which may
    omit or send a stale Origin on same-origin POSTs) is not blocked before
    the real auth + signing checks run.
    """
    auth = request.headers.get("authorization") or ""
    return bool(
        auth.startswith("Bearer ")
        and request.headers.get("x-orryon-sig")
        and request.headers.get("x-orryon-ts")
        and request.headers.get("x-orryon-nonce")
    )


def _origin_is_allowed(request: Request, allowed: Iterable[str]) -> bool:
    origin = request.headers.get("origin") or ""
    referer = request.headers.get("referer") or ""
    if origin or referer:
        for allowed_origin in allowed:
            if not allowed_origin:
                continue
            if origin and origin.startswith(allowed_origin):
                return True
            if referer and referer.startswith(allowed_origin):
                return True
    # Next.js / Railway proxy may strip Origin; trust X-Forwarded-Host when present.
    forwarded = request.headers.get("x-forwarded-host") or ""
    if forwarded:
        for host in forwarded.split(","):
            if _host_matches_allowed(host.strip(), allowed):
                return True
    return False


class OriginEnforcementMiddleware(BaseHTTPMiddleware):
    """Reject mutating requests whose Origin/Referer isn't in the allowlist."""

    def __init__(self, app: FastAPI, allowed_origins: list[str]):
        super().__init__(app)
        self._allowed = [o.rstrip("/") for o in allowed_origins if o]

    async def dispatch(self, request: Request, call_next):
        if request.method not in _MUTATING_METHODS:
            return await call_next(request)

        path = request.url.path
        if path in _ORIGIN_EXEMPT_PATHS:
            return await call_next(request)

        if _has_signed_request_headers(request):
            return await call_next(request)

        if not self._allowed:
            from backend.deps import IS_PRODUCTION

            if IS_PRODUCTION:
                logger.warning(
                    "Rejected %s %s — origin allowlist empty in production",
                    request.method, path,
                )
                return JSONResponse({"detail": "Forbidden origin"}, status_code=403)
            # Local dev: no allowlist configured.
            return await call_next(request)

        if _origin_is_allowed(request, self._allowed):
            return await call_next(request)

        logger.warning(
            "Rejected %s %s — origin=%r referer=%r not in allowlist",
            request.method, path,
            request.headers.get("origin"),
            request.headers.get("referer"),
        )
        return JSONResponse({"detail": "Forbidden origin"}, status_code=403)


# ── Per-IP rate limiting ──────────────────────────────────────────────────────

# Generous global ceiling — legitimate interactive use is < 60 req/min; this
# only trips on scripts/scrapers. Tuned so that a single chat turn + a couple
# of dashboard refreshes never hits the ceiling.
_IP_RATE_LIMIT = 300
_IP_RATE_WINDOW = 60  # seconds


class PerIpRateLimitMiddleware(BaseHTTPMiddleware):
    """Coarse per-IP rate limit across all /api/* traffic.

    Uses the shared Redis-backed limiter when available, in-memory otherwise.
    Only applies to `/api/*` so static assets and the Next.js shell never hit
    it. WebSocket upgrades skip HTTP middleware in Starlette.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in {"/api/health", "/health", "/api/ready", "/api/subscription/plans", "/api/auth/email-status"}:
            return await call_next(request)
        if not path.startswith("/api/"):
            return await call_next(request)

        ip = self._client_ip(request)
        from backend.cache import check_rate_limit_async

        allowed = await check_rate_limit_async(
            f"ip:{ip}", limit=_IP_RATE_LIMIT, window_seconds=_IP_RATE_WINDOW
        )
        if not allowed:
            logger.warning("IP %s exceeded global rate limit on %s", ip, path)
            return JSONResponse(
                {"detail": "Too many requests. Please wait a moment."},
                status_code=429,
            )
        return await call_next(request)

    @staticmethod
    def _client_ip(request: Request) -> str:
        # Respect the first hop in X-Forwarded-For when present (Vercel/Railway
        # both set it). Fall back to the socket peer.
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"
