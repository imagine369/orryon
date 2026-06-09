// Settings panel constants

import type { Settings } from "./types";

// ── Constants ────────────────────────────────────────────────────────────────

export const CURRENCIES = [
  { code: "USD", label: "$ USD — US Dollar" },
  { code: "EUR", label: "€ EUR — Euro" },
  { code: "GBP", label: "£ GBP — British Pound" },
  { code: "CAD", label: "$ CAD — Canadian Dollar" },
  { code: "AUD", label: "$ AUD — Australian Dollar" },
  { code: "JPY", label: "¥ JPY — Japanese Yen" },
  { code: "CNY", label: "¥ CNY — Chinese Yuan" },
  { code: "INR", label: "₹ INR — Indian Rupee" },
  { code: "BRL", label: "R$ BRL — Brazilian Real" },
  { code: "MXN", label: "$ MXN — Mexican Peso" },
  { code: "SGD", label: "$ SGD — Singapore Dollar" },
  { code: "CHF", label: "Fr CHF — Swiss Franc" },
  { code: "NZD", label: "$ NZD — New Zealand Dollar" },
  { code: "KRW", label: "₩ KRW — South Korean Won" },
  { code: "SEK", label: "kr SEK — Swedish Krona" },
  { code: "NOK", label: "kr NOK — Norwegian Krone" },
  { code: "HKD", label: "$ HKD — Hong Kong Dollar" },
  { code: "ZAR", label: "R ZAR — South African Rand" },
];

export const REMINDER_OPTS = [
  { label: "None", value: 0 },
  { label: "10 min before", value: 10 },
  { label: "30 min before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "6 hours before", value: 360 },
  { label: "1 day before", value: 1440 },
];

export const DIGEST_TIMES = [
  "06:00", "06:30", "07:00", "07:30", "08:00",
  "08:30", "09:00", "09:30", "10:00",
];

export const ALERT_PCTS = [
  { label: "50%", value: 50 },
  { label: "75%", value: 75 },
  { label: "80%", value: 80 },
  { label: "90%", value: 90 },
  { label: "100% (over budget)", value: 100 },
];

export const BILL_ALERT_DAYS = [
  { label: "Same day", value: 0 },
  { label: "1 day before", value: 1 },
  { label: "3 days before", value: 3 },
  { label: "5 days before", value: 5 },
  { label: "1 week before", value: 7 },
];

export const COUNTRIES = [
  { label: "—", value: "" },
  { label: "United States", value: "US" },
  { label: "Canada", value: "CA" },
  { label: "United Kingdom", value: "GB" },
  { label: "Australia", value: "AU" },
  { label: "Germany", value: "DE" },
  { label: "France", value: "FR" },
  { label: "Spain", value: "ES" },
  { label: "Italy", value: "IT" },
  { label: "Netherlands", value: "NL" },
  { label: "Sweden", value: "SE" },
  { label: "Norway", value: "NO" },
  { label: "Denmark", value: "DK" },
  { label: "Switzerland", value: "CH" },
  { label: "Ireland", value: "IE" },
  { label: "India", value: "IN" },
  { label: "Japan", value: "JP" },
  { label: "South Korea", value: "KR" },
  { label: "China", value: "CN" },
  { label: "Singapore", value: "SG" },
  { label: "Hong Kong", value: "HK" },
  { label: "Brazil", value: "BR" },
  { label: "Mexico", value: "MX" },
  { label: "New Zealand", value: "NZ" },
  { label: "South Africa", value: "ZA" },
  { label: "United Arab Emirates", value: "AE" },
  { label: "Israel", value: "IL" },
  { label: "Philippines", value: "PH" },
  { label: "Indonesia", value: "ID" },
  { label: "Malaysia", value: "MY" },
  { label: "Thailand", value: "TH" },
  { label: "Vietnam", value: "VN" },
  { label: "Poland", value: "PL" },
  { label: "Portugal", value: "PT" },
  { label: "Belgium", value: "BE" },
  { label: "Austria", value: "AT" },
  { label: "Argentina", value: "AR" },
  { label: "Colombia", value: "CO" },
  { label: "Chile", value: "CL" },
  { label: "Turkey", value: "TR" },
  { label: "Saudi Arabia", value: "SA" },
  { label: "Egypt", value: "EG" },
  { label: "Nigeria", value: "NG" },
  { label: "Kenya", value: "KE" },
];

export const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Portuguese", value: "pt" },
  { label: "Italian", value: "it" },
  { label: "Dutch", value: "nl" },
  { label: "Japanese", value: "ja" },
  { label: "Korean", value: "ko" },
  { label: "Chinese (Simplified)", value: "zh" },
  { label: "Hindi", value: "hi" },
  { label: "Arabic", value: "ar" },
  { label: "Russian", value: "ru" },
  { label: "Polish", value: "pl" },
  { label: "Turkish", value: "tr" },
  { label: "Vietnamese", value: "vi" },
  { label: "Thai", value: "th" },
  { label: "Indonesian", value: "id" },
  { label: "Swedish", value: "sv" },
  { label: "Norwegian", value: "no" },
  { label: "Danish", value: "da" },
  { label: "Finnish", value: "fi" },
  { label: "Hebrew", value: "he" },
];

export const GENDER_OPTIONS = [
  { label: "Prefer not to say", value: "" },
  { label: "Woman", value: "woman" },
  { label: "Man", value: "man" },
  { label: "Non-binary", value: "nonbinary" },
  { label: "Other", value: "other" },
];

export const DEMO_SETTINGS: Settings = {
  display_name: "Alex",
  email: "demo@orryon.app",
  created_at: "2025-01-15T12:00:00Z",
  phone: "+1 555 0100",
  country: "US",
  language: "en",
  birth_date: "1990-06-15",
  gender: "",
  currency: "USD",
  budget_cycle_start: 1,
  spending_alert_pct: 80,
  bill_due_alert_days: 3,
  default_reminder_minutes: 30,
  daily_digest_enabled: 1,
  daily_digest_time: "08:00",
  weekly_report_enabled: 0,
  smtp_enabled: false,
  ai_connected: false,
  grok_model: "grok-4.3",
};

export const VIEW_TITLES: Record<string, string> = {
  account: "Account information",
  "security-access": "Security & Account Access",
  security: "Security",
  sessions: "Sessions",
  connected: "Connected Accounts",
  "privacy-safety": "Privacy & Safety",
  data: "Data",
  notifications: "Notifications",
  financial: "Financial Preferences",
  subscription: "Plan & Usage",
  app: "App",
  memory: "Memory",
  health: "Health",
  location: "My Places",
  briefing: "Daily Briefing",
  accessibility: "Accessibility",
  ambient: "Ambient Pickup",
};
