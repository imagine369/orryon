"""DDL for indexes."""

INDEXES = """

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created ON chat_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_budget_categories_user_month ON budget_categories(user_id, month);
CREATE INDEX IF NOT EXISTS idx_budget_templates_user ON budget_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_streaks_user ON streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_streak_days_streak ON streak_days(streak_id);
CREATE INDEX IF NOT EXISTS idx_streak_days_user_date ON streak_days(user_id, date_key);
CREATE INDEX IF NOT EXISTS idx_reset_completions_user ON reset_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_completions_user_date ON reset_completions(user_id, date_key);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_revoked ON auth_sessions(user_id, revoked);
CREATE INDEX IF NOT EXISTS idx_voice_usage_user_month ON voice_minute_usage(user_id, month);
CREATE INDEX IF NOT EXISTS idx_voice_topups_user ON voice_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_health_vitals_user ON health_vitals(user_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_medications_user ON medications(user_id);
CREATE INDEX IF NOT EXISTS idx_health_appts_user ON health_appointments(user_id, date);
CREATE INDEX IF NOT EXISTS idx_user_places_user ON user_places(user_id);
CREATE INDEX IF NOT EXISTS idx_commute_user ON commute_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_briefings_user_date ON briefings(user_id, date);
CREATE INDEX IF NOT EXISTS idx_approvals_user ON approval_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_counts_user_month ON chat_message_counts(user_id, month);

"""
