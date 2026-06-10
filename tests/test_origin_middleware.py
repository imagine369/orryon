"""Origin enforcement — desktop / Vercel alias coverage."""

from unittest.mock import MagicMock

from backend.middleware import _has_signed_request_headers, _origin_is_allowed


def _request(origin: str = "", referer: str = ""):
    req = MagicMock()
    req.headers.get.side_effect = lambda key, default="": {
        "origin": origin,
        "referer": referer,
    }.get(key.lower(), default)
    return req


def test_vercel_origin_allowed_when_in_list():
    allowed = ["https://www.orryon.com", "https://orryon.vercel.app"]
    req = _request(origin="https://orryon.vercel.app")
    assert _origin_is_allowed(req, allowed) is True


def test_www_origin_allowed():
    allowed = ["https://www.orryon.com"]
    req = _request(origin="https://www.orryon.com")
    assert _origin_is_allowed(req, allowed) is True


def test_referer_fallback_when_origin_missing():
    allowed = ["https://www.orryon.com"]
    req = _request(referer="https://www.orryon.com/home")
    assert _origin_is_allowed(req, allowed) is True


def test_missing_origin_and_referer_rejected():
    allowed = ["https://www.orryon.com"]
    req = _request()
    assert _origin_is_allowed(req, allowed) is False


def test_signed_request_headers_detected():
    req = MagicMock()
    req.headers.get.side_effect = lambda key, default="": {
        "authorization": "Bearer tok",
        "x-orryon-sig": "abc",
        "x-orryon-ts": "1",
        "x-orryon-nonce": "n",
    }.get(key.lower(), default)
    assert _has_signed_request_headers(req) is True


def test_signed_request_headers_require_bearer():
    req = MagicMock()
    req.headers.get.side_effect = lambda key, default="": {
        "x-orryon-sig": "abc",
        "x-orryon-ts": "1",
        "x-orryon-nonce": "n",
    }.get(key.lower(), default)
    assert _has_signed_request_headers(req) is False


def test_forwarded_host_allowed_when_origin_missing():
    allowed = ["https://www.orryon.com"]
    req = MagicMock()
    req.headers.get.side_effect = lambda key, default="": {
        "origin": "",
        "referer": "",
        "x-forwarded-host": "www.orryon.com",
    }.get(key.lower(), default)
    assert _origin_is_allowed(req, allowed) is True
