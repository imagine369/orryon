// Settings panel shared types

// ── Types ────────────────────────────────────────────────────────────────────

export interface Settings {
  display_name: string;
  email: string;
  created_at?: string;
  phone?: string;
  country?: string;
  language?: string;
  birth_date?: string;
  gender?: string;
  currency: string;
  budget_cycle_start: number;
  spending_alert_pct: number;
  bill_due_alert_days: number;
  default_reminder_minutes: number;
  daily_digest_enabled: number;
  daily_digest_time: string;
  weekly_report_enabled: number;
  smtp_enabled: boolean;
  ai_connected: boolean;
  grok_model: string;
}

export interface AuthSession {
  id: string;
  device_name: string;
  ip_address: string;
  created_at: string;
  last_active: string;
  current: boolean;
}

export type View =
  | null
  | "security-access"
  | "security"
  | "sessions"
  | "connected"
  | "privacy-safety"
  | "data"
  | "notifications"
  | "financial"
  | "subscription"
  | "account"
  | "app"
  | "memory"
  | "health"
  | "location"
  | "briefing"
  | "accessibility"
  | "ambient";


export type EmailStep = "idle" | "input" | "code";
