"""
db.auth — Email OTP and user creation.
"""
from __future__ import annotations

import hashlib
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

from db.connection import get_connection
from db.crud import insert_row

logger = logging.getLogger(__name__)

# ── OTP helpers ───────────────────────────────────────────────────────────────

def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


# ── User auth (email OTP — no passwords stored) ───────────────────────────────

def get_or_create_user_by_email(
    email: str, display_name: str = "", segment: str = ""
) -> dict:
    """Return the existing user for *email*, or create a new one.

    Free-breathing signups (segment='free_breathe') get plan='free' with no
    trial period — they are stored under the 'Free Breathe Users' segment and
    never automatically promoted to trial.
    """
    email = email.strip().lower()
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM users WHERE email = ? LIMIT 1", (email,)
        ).fetchone()
        conn.close()
        if row:
            return dict(row)
    except Exception as exc:
        logger.error("get_or_create_user_by_email lookup error: %s", exc)

    name = display_name.strip() or email.split("@")[0]
    is_free_breathe = segment == "free_breathe"

    if is_free_breathe:
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "display_name": name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "plan": "free",
            "trial_ends_at": "",
            "segment": "free_breathe",
        }
        insert_row("users", user)
        logger.info("Created Free Breathe user: %s (%s)", email, user["id"])
    else:
        from config import TRIAL_DAYS
        trial_ends_at = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat()
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "display_name": name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "plan": "trial",
            "trial_ends_at": trial_ends_at,
            "segment": segment,
        }
        insert_row("users", user)
        logger.info("Created user: %s (%s) — trial until %s", email, user["id"], trial_ends_at)

    return user


def create_verification_code(email: str) -> str:
    """Generate a 6-digit OTP. Stores SHA-256 hash with 10-minute expiry."""
    email = email.strip().lower()
    code = f"{random.SystemRandom().randint(0, 999999):06d}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    insert_row("verification_codes", {
        "id": str(uuid.uuid4()),
        "email": email,
        "code_hash": _hash_code(code),
        "expires_at": expires_at,
        "used": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return code


_OTP_MAX_ATTEMPTS = 5
_OTP_LOCKOUT_MINUTES = 15

# In-memory lockout tracker: email -> (attempt_count, first_attempt_epoch)
_otp_attempts: dict[str, tuple[int, float]] = {}


def _check_otp_lockout(email: str) -> bool:
    """Return True if the email is currently locked out from OTP attempts."""
    import time
    entry = _otp_attempts.get(email)
    if not entry:
        return False
    count, first_ts = entry
    if time.time() - first_ts > _OTP_LOCKOUT_MINUTES * 60:
        _otp_attempts.pop(email, None)
        return False
    return count >= _OTP_MAX_ATTEMPTS


def _record_otp_failure(email: str) -> None:
    """Increment failed OTP attempt counter for the email."""
    import time
    entry = _otp_attempts.get(email)
    now = time.time()
    if not entry or now - entry[1] > _OTP_LOCKOUT_MINUTES * 60:
        _otp_attempts[email] = (1, now)
    else:
        _otp_attempts[email] = (entry[0] + 1, entry[1])


def _clear_otp_attempts(email: str) -> None:
    """Reset the failed attempt counter on successful verification."""
    _otp_attempts.pop(email, None)


def verify_code(email: str, code: str) -> bool:
    """Check OTP validity. Marks as used on success. Enforces lockout after repeated failures."""
    email = email.strip().lower()
    if _check_otp_lockout(email):
        return False
    code_hash = _hash_code(code.strip())
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT id FROM verification_codes "
            "WHERE email = ? AND code_hash = ? AND used = 0 AND expires_at > ? "
            "ORDER BY created_at DESC LIMIT 1",
            (email, code_hash, now),
        ).fetchone()
        if not row:
            conn.close()
            _record_otp_failure(email)
            return False
        conn.execute("UPDATE verification_codes SET used = 1 WHERE id = ?", (row["id"],))
        conn.commit()
        conn.close()
        _clear_otp_attempts(email)
        return True
    except Exception as exc:
        logger.error("verify_code error: %s", exc)
        return False


# ── Chat persistence ──────────────────────────────────────────────────────────
