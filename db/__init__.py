"""
db — Database setup and helpers for orryon.

Supports PostgreSQL (when DATABASE_URL is set) or SQLite for local dev.
Re-exports the public API so ``from db import X`` continues to work.
"""

from __future__ import annotations

from db.connection import (
    _DbConn,
    _USE_PG,
    _pg_pool,
    close_pool,
    decrypt_value,
    encrypt_value,
    get_connection,
    init_pool,
)
from db.schema import init_db
from db.crud import (
    _ALLOWED_TABLES,
    delete_row,
    fetch_rows,
    insert_row,
    update_row,
)
from db.auth import (
    _check_otp_lockout,
    create_verification_code,
    get_or_create_user_by_email,
    verify_code,
)
from db.chat import (
    create_chat_session,
    delete_chat_session,
    get_session_summary_meta,
    list_chat_sessions,
    load_chat_history,
    save_chat_message,
    update_chat_session_title,
    update_session_summary,
)
from db.links import INSPO_DIR, get_link_page_by_token, get_or_create_link_page
from db.memory import (
    count_user_memory,
    delete_memory_fact,
    get_user_memories,
    get_user_memory,
    prune_user_memory,
    save_user_memory,
)
from db.finance import (
    adjust_balance,
    get_balance,
    get_nw_history,
    get_or_create_balance_account,
    get_recurring_income,
    get_total_monthly_income,
    snapshot_net_worth,
    update_balance,
)
from db.usage import (
    add_voice_topup,
    get_chat_message_count,
    get_monthly_spend,
    get_monthly_token_usage,
    get_voice_seconds_used,
    get_voice_topup_minutes,
    increment_chat_message_count,
    record_token_spend,
    record_voice_seconds,
)
from db.preferences import get_user_preferences, upsert_user_preferences
from db.health import (
    add_health_appointment,
    add_health_vital,
    add_medication,
    delete_health_appointment,
    delete_health_vital,
    delete_medication,
    get_health_appointments,
    get_health_vitals,
    get_medications,
    update_medication,
)
from db.location import (
    add_user_place,
    delete_user_place,
    get_commute_pattern,
    get_user_places,
    upsert_commute_pattern,
)
from db.briefings import get_briefing, mark_briefing_read, save_briefing
from db.approvals import (
    create_approval_request,
    get_approval_requests,
    resolve_approval_request,
)

# SQLite auto-init when DATABASE_URL is unset (local dev).
import db.bootstrap  # noqa: F401

__all__ = [
    "_ALLOWED_TABLES",
    "_DbConn",
    "_USE_PG",
    "_check_otp_lockout",
    "_pg_pool",
    "INSPO_DIR",
    "add_health_appointment",
    "add_health_vital",
    "add_medication",
    "add_user_place",
    "add_voice_topup",
    "adjust_balance",
    "close_pool",
    "count_user_memory",
    "create_approval_request",
    "create_chat_session",
    "create_verification_code",
    "decrypt_value",
    "delete_chat_session",
    "delete_health_appointment",
    "delete_health_vital",
    "delete_medication",
    "delete_memory_fact",
    "delete_row",
    "delete_user_place",
    "encrypt_value",
    "fetch_rows",
    "get_approval_requests",
    "get_balance",
    "get_briefing",
    "get_chat_message_count",
    "get_commute_pattern",
    "get_connection",
    "get_health_appointments",
    "get_health_vitals",
    "get_link_page_by_token",
    "get_medications",
    "get_monthly_spend",
    "get_monthly_token_usage",
    "get_nw_history",
    "get_or_create_balance_account",
    "get_or_create_link_page",
    "get_or_create_user_by_email",
    "get_recurring_income",
    "get_total_monthly_income",
    "get_user_memories",
    "get_user_memory",
    "get_user_places",
    "get_user_preferences",
    "get_voice_seconds_used",
    "get_voice_topup_minutes",
    "increment_chat_message_count",
    "init_db",
    "init_pool",
    "insert_row",
    "list_chat_sessions",
    "load_chat_history",
    "mark_briefing_read",
    "record_token_spend",
    "record_voice_seconds",
    "resolve_approval_request",
    "save_briefing",
    "save_chat_message",
    "save_user_memory",
    "snapshot_net_worth",
    "update_balance",
    "update_chat_session_title",
    "update_medication",
    "update_row",
    "upsert_commute_pattern",
    "upsert_user_preferences",
    "verify_code",
]
