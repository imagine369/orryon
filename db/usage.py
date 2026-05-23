"""
db.usage — API token spend, voice usage, chat message quotas.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from db.connection import _USE_PG, get_connection
from db.crud import insert_row

logger = logging.getLogger(__name__)


_COST_PER_INPUT_TOKEN  = 0.30 / 1_000_000
_COST_PER_OUTPUT_TOKEN = 0.50 / 1_000_000


def _usage_period_key(user_id: str) -> str:
    try:
        conn = get_connection()
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        conn.close()
        if not row:
            return datetime.now(timezone.utc).strftime("%Y-%m")
        from core.usage_period import resolve_usage_period_key

        return resolve_usage_period_key(dict(row))
    except Exception as exc:
        logger.error("_usage_period_key error: %s", exc)
        return datetime.now(timezone.utc).strftime("%Y-%m")


def record_token_spend(user_id: str, prompt_tokens: int, completion_tokens: int) -> None:
    cost = prompt_tokens * _COST_PER_INPUT_TOKEN + completion_tokens * _COST_PER_OUTPUT_TOKEN
    now   = datetime.now(timezone.utc).isoformat()
    month = _usage_period_key(user_id)
    try:
        conn = get_connection()
        if _USE_PG:
            conn.execute(
                "INSERT INTO user_api_spend (id, user_id, month, prompt_tokens, completion_tokens, cost_usd, updated_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT(user_id, month) DO UPDATE SET "
                "  prompt_tokens = user_api_spend.prompt_tokens + EXCLUDED.prompt_tokens, "
                "  completion_tokens = user_api_spend.completion_tokens + EXCLUDED.completion_tokens, "
                "  cost_usd = user_api_spend.cost_usd + EXCLUDED.cost_usd, "
                "  updated_at = EXCLUDED.updated_at",
                (str(uuid.uuid4()), user_id, month, prompt_tokens, completion_tokens, cost, now),
            )
        else:
            conn.execute(
                "INSERT INTO user_api_spend (id, user_id, month, prompt_tokens, completion_tokens, cost_usd, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id, month) DO UPDATE SET "
                "  prompt_tokens = prompt_tokens + excluded.prompt_tokens, "
                "  completion_tokens = completion_tokens + excluded.completion_tokens, "
                "  cost_usd = cost_usd + excluded.cost_usd, "
                "  updated_at = excluded.updated_at",
                (str(uuid.uuid4()), user_id, month, prompt_tokens, completion_tokens, cost, now),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("record_token_spend error: %s", exc)


def get_monthly_spend(user_id: str) -> float:
    return get_monthly_token_usage(user_id)["cost_usd"]


def get_monthly_token_usage(user_id: str, month: str | None = None) -> dict:
    """Return prompt/completion token totals and estimated cost for the month."""
    if month is None:
        month = _usage_period_key(user_id)
    empty = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cost_usd": 0.0,
        "month": month,
    }
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT prompt_tokens, completion_tokens, cost_usd FROM user_api_spend "
            "WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchone()
        conn.close()
        if not row:
            return empty
        prompt = int(row["prompt_tokens"] or 0)
        completion = int(row["completion_tokens"] or 0)
        return {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion,
            "cost_usd": float(row["cost_usd"] or 0),
            "month": month,
        }
    except Exception as exc:
        logger.error("get_monthly_token_usage error: %s", exc)
        return empty


# ── Voice minute usage helpers ────────────────────────────────────────────────

def get_voice_seconds_used(user_id: str, month: str | None = None) -> float:
    """Return total voice seconds consumed by *user_id* in *month* (YYYY-MM)."""
    if month is None:
        month = _usage_period_key(user_id)
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT seconds_used FROM voice_minute_usage WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchone()
        conn.close()
        return float(row["seconds_used"]) if row else 0.0
    except Exception as exc:
        logger.error("get_voice_seconds_used error: %s", exc)
        return 0.0


def record_voice_seconds(user_id: str, seconds: float) -> None:
    """Atomically add *seconds* to the current month's voice usage bucket."""
    if seconds <= 0:
        return
    month = _usage_period_key(user_id)
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = get_connection()
        if _USE_PG:
            conn.execute(
                "INSERT INTO voice_minute_usage (id, user_id, month, seconds_used, updated_at) "
                "VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT(user_id, month) DO UPDATE SET "
                "  seconds_used = voice_minute_usage.seconds_used + EXCLUDED.seconds_used, "
                "  updated_at = EXCLUDED.updated_at",
                (str(uuid.uuid4()), user_id, month, seconds, now),
            )
        else:
            conn.execute(
                "INSERT INTO voice_minute_usage (id, user_id, month, seconds_used, updated_at) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id, month) DO UPDATE SET "
                "  seconds_used = seconds_used + excluded.seconds_used, "
                "  updated_at = excluded.updated_at",
                (str(uuid.uuid4()), user_id, month, seconds, now),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("record_voice_seconds error: %s", exc)


def get_voice_topup_minutes(user_id: str, month: str | None = None) -> int:
    """Return total bonus minutes purchased in the active billing period."""
    if month is None:
        from core.usage_period import resolve_usage_period

        conn = get_connection()
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        conn.close()
        if row:
            period = resolve_usage_period(dict(row))
            month_start = period.key
            month_end = period.reset_at.isoformat()
        else:
            month_start = datetime.now(timezone.utc).strftime("%Y-%m-01")
            month_end = ""
    elif len(month) == 7:
        month_start = f"{month}-01"
        y, m = int(month[:4]), int(month[5:7])
        if m == 12:
            month_end = f"{y + 1}-01-01"
        else:
            month_end = f"{y}-{m + 1:02d}-01"
    else:
        month_start = month
        month_end = ""
    try:
        conn = get_connection()
        if month_end:
            row = conn.execute(
                "SELECT COALESCE(SUM(minutes_added), 0) as total "
                "FROM voice_topups WHERE user_id=? AND created_at>=? AND created_at<?",
                (user_id, month_start, month_end),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT COALESCE(SUM(minutes_added), 0) as total "
                "FROM voice_topups WHERE user_id=? AND created_at>=?",
                (user_id, month_start),
            ).fetchone()
        conn.close()
        return int(row["total"]) if row else 0
    except Exception as exc:
        logger.error("get_voice_topup_minutes error: %s", exc)
        return 0


def add_voice_topup(
    user_id: str,
    minutes_added: int,
    price_usd: float,
    stripe_payment_intent: str = "",
) -> bool:
    """Record a voice-minute top-up purchase."""
    return insert_row("voice_topups", {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "minutes_added": minutes_added,
        "price_usd": price_usd,
        "stripe_payment_intent": stripe_payment_intent,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# ── User preferences ──────────────────────────────────────────────────────────

def get_chat_message_count(user_id: str, month: str | None = None) -> int:
    if month is None:
        month = _usage_period_key(user_id)
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT count FROM chat_message_counts WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchone()
        conn.close()
        return int(row["count"]) if row else 0
    except Exception as exc:
        logger.error("get_chat_message_count error: %s", exc)
        return 0


def increment_chat_message_count(user_id: str) -> int:
    """Increment and return the new count for this month."""
    month = _usage_period_key(user_id)
    try:
        conn = get_connection()
        if _USE_PG:
            row = conn.execute(
                "INSERT INTO chat_message_counts (id, user_id, month, count) VALUES (%s, %s, %s, 1) "
                "ON CONFLICT(user_id, month) DO UPDATE SET count = chat_message_counts.count + 1 "
                "RETURNING count",
                (str(uuid.uuid4()), user_id, month),
            ).fetchone()
        else:
            conn.execute(
                "INSERT INTO chat_message_counts (id, user_id, month, count) VALUES (?, ?, ?, 1) "
                "ON CONFLICT(user_id, month) DO UPDATE SET count = count + 1",
                (str(uuid.uuid4()), user_id, month),
            )
            row = conn.execute(
                "SELECT count FROM chat_message_counts WHERE user_id=? AND month=?",
                (user_id, month),
            ).fetchone()
        conn.commit()
        conn.close()
        return int(row["count"]) if row else 1
    except Exception as exc:
        logger.error("increment_chat_message_count error: %s", exc)
        return 0


# ── Health vitals ─────────────────────────────────────────────────────────────
