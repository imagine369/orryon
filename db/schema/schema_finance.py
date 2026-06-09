"""DDL for finance tables."""

TABLES = """
CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    institution   TEXT,
    balance       REAL DEFAULT 0,
    currency      TEXT DEFAULT 'USD',
    last_updated  TEXT,
    metadata      TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id           TEXT PRIMARY KEY,
    account_id   TEXT,
    user_id      TEXT NOT NULL,
    date         TEXT NOT NULL,
    amount       REAL NOT NULL,
    description  TEXT,
    category     TEXT,
    subcategory  TEXT,
    is_recurring INTEGER DEFAULT 0,
    merchant     TEXT,
    metadata     TEXT,
    currency  TEXT DEFAULT 'USD',
    attachment_path  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS holdings (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    account_id   TEXT,
    symbol       TEXT NOT NULL,
    name         TEXT,
    quantity     REAL DEFAULT 0,
    cost_basis   REAL DEFAULT 0,
    asset_type   TEXT,
    last_updated TEXT
);

CREATE TABLE IF NOT EXISTS goals (
    id                     TEXT PRIMARY KEY,
    user_id                TEXT NOT NULL,
    name                   TEXT NOT NULL,
    target_amount          REAL NOT NULL,
    current_amount         REAL DEFAULT 0,
    target_date            TEXT,
    category               TEXT,
    linked_budget_category TEXT DEFAULT '',
    notes                  TEXT,
    created_at             TEXT,
    is_completed           INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goal_contributions (
    id         TEXT PRIMARY KEY,
    goal_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    amount     REAL NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    amount          REAL DEFAULT 0,
    frequency       TEXT DEFAULT 'monthly',
    next_due        TEXT,
    category        TEXT,
    account_id      TEXT,
    is_active       INTEGER DEFAULT 1,
    detected_at     TEXT,
    previous_amount REAL DEFAULT 0,
    last_changed    TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS credit_scores (
    id       TEXT PRIMARY KEY,
    user_id  TEXT NOT NULL,
    score    INTEGER NOT NULL,
    provider TEXT,
    date     TEXT NOT NULL,
    factors  TEXT
);

CREATE TABLE IF NOT EXISTS budget_categories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    category    TEXT NOT NULL,
    planned     REAL DEFAULT 0,
    month       TEXT NOT NULL,
    created_at  TEXT,
    rollover    INTEGER DEFAULT 0,
    UNIQUE(user_id, category, month)
);

CREATE TABLE IF NOT EXISTS budget_templates (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    category    TEXT NOT NULL,
    planned     REAL DEFAULT 0,
    rollover    INTEGER DEFAULT 0,
    created_at  TEXT,
    updated_at  TEXT,
    UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS custom_categories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT DEFAULT '#6366f1',
    icon        TEXT DEFAULT '',
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS share_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    token       TEXT UNIQUE NOT NULL,
    view_type   TEXT DEFAULT 'finance_readonly',
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recurring_income (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    amount      REAL NOT NULL,
    frequency   TEXT DEFAULT 'monthly',
    source      TEXT DEFAULT '',
    next_date   TEXT,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    total_assets    REAL DEFAULT 0,
    total_liabilities REAL DEFAULT 0,
    net_worth       REAL DEFAULT 0,
    snapshot_date   TEXT NOT NULL,
    UNIQUE(user_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS user_api_spend (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    month             TEXT NOT NULL,
    prompt_tokens     INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    cost_usd          REAL DEFAULT 0,
    updated_at        TEXT NOT NULL,
    UNIQUE(user_id, month)
);
"""
