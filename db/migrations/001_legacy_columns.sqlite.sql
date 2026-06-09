-- Legacy column additions for SQLite (no ADD COLUMN IF NOT EXISTS).
-- migrate.py ignores duplicate-column errors per statement.

ALTER TABLE users ADD COLUMN default_reminder_minutes INTEGER DEFAULT 30;
ALTER TABLE users ADD COLUMN daily_digest_enabled INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN daily_digest_time TEXT DEFAULT '08:00';
ALTER TABLE users ADD COLUMN last_digest_sent TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN weekly_report_enabled INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN last_weekly_report TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN currency TEXT DEFAULT 'USD';
ALTER TABLE users ADD COLUMN budget_cycle_start INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN spending_alert_pct INTEGER DEFAULT 80;
ALTER TABLE users ADD COLUMN bill_due_alert_days INTEGER DEFAULT 3;
ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN trial_ends_at TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN segment TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN billing_interval TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN phone TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN country TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN birth_date TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN gender TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN billing_period_start TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN billing_period_end TEXT DEFAULT '';

ALTER TABLE transactions ADD COLUMN currency TEXT DEFAULT 'USD';
ALTER TABLE transactions ADD COLUMN attachment_path TEXT DEFAULT '';

ALTER TABLE notes ADD COLUMN is_journal INTEGER DEFAULT 0;
ALTER TABLE notes ADD COLUMN entry_date TEXT DEFAULT '';

ALTER TABLE waitlist ADD COLUMN approve_token TEXT DEFAULT '';

ALTER TABLE user_preferences ADD COLUMN life_priorities TEXT DEFAULT '';
ALTER TABLE user_preferences ADD COLUMN life_priorities_set INTEGER DEFAULT 0;

ALTER TABLE chat_sessions ADD COLUMN summary TEXT DEFAULT '';
ALTER TABLE chat_sessions ADD COLUMN summary_message_count INTEGER DEFAULT 0;

ALTER TABLE user_memory ADD COLUMN confidence REAL DEFAULT 1.0;
