"""DDL for auth tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    display_name  TEXT,
    created_at    TEXT NOT NULL,
    default_reminder_minutes  INTEGER DEFAULT 30,
    daily_digest_enabled  INTEGER DEFAULT 1,
    daily_digest_time  TEXT DEFAULT '08:00',
    last_digest_sent  TEXT DEFAULT '',
    weekly_report_enabled  INTEGER DEFAULT 1,
    last_weekly_report  TEXT DEFAULT '',
    currency  TEXT DEFAULT 'USD',
    budget_cycle_start  INTEGER DEFAULT 1,
    spending_alert_pct  INTEGER DEFAULT 80,
    bill_due_alert_days  INTEGER DEFAULT 3,
    plan  TEXT DEFAULT 'free',
    trial_ends_at  TEXT DEFAULT '',
    stripe_customer_id  TEXT DEFAULT '',
    stripe_subscription_id  TEXT DEFAULT '',
    segment  TEXT DEFAULT '',
    billing_interval  TEXT DEFAULT '',
    phone  TEXT DEFAULT '',
    country  TEXT DEFAULT '',
    language  TEXT DEFAULT 'en',
    birth_date  TEXT DEFAULT '',
    gender  TEXT DEFAULT '',
    billing_period_start  TEXT DEFAULT '',
    billing_period_end  TEXT DEFAULT '',
    xai_api_key_enc TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS verification_codes (
    id          TEXT PRIMARY KEY,
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    used        INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waitlist (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    approved      INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL,
    approve_token TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    device_name TEXT DEFAULT '',
    ip_address  TEXT DEFAULT '',
    created_at  TEXT NOT NULL,
    last_active TEXT NOT NULL,
    revoked     INTEGER DEFAULT 0
);
"""
