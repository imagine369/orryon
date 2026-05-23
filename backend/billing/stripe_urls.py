"""Validate Stripe Checkout success/cancel redirect URLs."""
from __future__ import annotations

import os

from fastapi import HTTPException

from config import APP_URL

# Hosts we'll always trust for Stripe success/cancel redirects, in addition to
# whatever's configured via APP_URL / FRONTEND_URL. This keeps local dev and
# Vercel preview URLs working even when env vars point elsewhere — the real
# Orryon domain list lives in `_TRUSTED_STRIPE_HOST_SUFFIXES` below.
_TRUSTED_STRIPE_HOSTS = {"localhost", "127.0.0.1"}
_TRUSTED_STRIPE_HOST_SUFFIXES = (".orryon.com",)
_TRUSTED_STRIPE_HOST_PATTERNS = ("orryon",)  # only orryon*.vercel.app, not arbitrary


def validate_stripe_return_url(url: str, field: str) -> str:
    """Allow only URLs that belong to our own app/frontend.

    Stripe uses the success_url/cancel_url verbatim, so without this guard the
    endpoint becomes an open-redirect primitive. We accept:

      * Any URL whose origin matches APP_URL / FRONTEND_URL / config.APP_URL
      * Any URL whose host is localhost or 127.0.0.1 (dev)
      * Any URL whose host ends in `.orryon.com` or `.vercel.app` (prod + preview)
    """
    from urllib.parse import urlparse

    if not url:
        raise HTTPException(400, f"{field} is required")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(400, f"{field} must be an absolute http(s) URL")

    host = parsed.hostname or ""
    if host in _TRUSTED_STRIPE_HOSTS:
        return url
    if any(host == s.lstrip(".") or host.endswith(s) for s in _TRUSTED_STRIPE_HOST_SUFFIXES):
        return url
    if host.endswith(".vercel.app") and any(host.startswith(p) for p in _TRUSTED_STRIPE_HOST_PATTERNS):
        return url

    allowed: list[str] = []
    for val in (os.getenv("APP_URL", ""), os.getenv("FRONTEND_URL", ""), APP_URL):
        if val:
            allowed.append(val.rstrip("/"))

    base = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    if any(base == a.rstrip("/") or base.startswith(a.rstrip("/") + "/") for a in allowed):
        return url
    allowed_hosts = {urlparse(a).netloc for a in allowed if a}
    if parsed.netloc in allowed_hosts:
        return url

    raise HTTPException(400, f"{field} points to an untrusted host")


# Back-compat alias for internal imports during refactor.
_validate_stripe_return_url = validate_stripe_return_url
