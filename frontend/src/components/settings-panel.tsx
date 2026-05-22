"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  ChevronRight,
  ArrowLeft,
  Download,
  CreditCard,
  CalendarDays,
  RefreshCw,
  Unlink,
  Smartphone,
  Monitor,
  Shield,
  Lock,
  Bell,
  DollarSign,
  HelpCircle,
  ExternalLink,
  FileText,
  Heart,
  Mic,
  Brain,
  Activity,
  MapPin,
  Sunrise,
  Accessibility,
  Trash2,
  Plus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api, getApiBase } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { usePanels } from "@/lib/panel-context";
import { useSubscription } from "@/lib/use-subscription";
import { useVoiceUsage, startVoiceTopup } from "@/lib/use-voice-usage";
import { VoiceUsageMeter } from "@/components/voice-usage-meter";
import { InstallButton } from "@/components/install-prompt";
import { usePreferences } from "@/lib/use-preferences";
import { useChatUsage } from "@/lib/use-chat-usage";

// ── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  display_name: string;
  email: string;
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

interface AuthSession {
  id: string;
  device_name: string;
  ip_address: string;
  created_at: string;
  last_active: string;
  current: boolean;
}

type View =
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
  | "app"
  | "memory"
  | "health"
  | "location"
  | "briefing"
  | "accessibility";

// ── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = [
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

const REMINDER_OPTS = [
  { label: "None", value: 0 },
  { label: "10 min before", value: 10 },
  { label: "30 min before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "6 hours before", value: 360 },
  { label: "1 day before", value: 1440 },
];

const DIGEST_TIMES = [
  "06:00", "06:30", "07:00", "07:30", "08:00",
  "08:30", "09:00", "09:30", "10:00",
];

const ALERT_PCTS = [
  { label: "50%", value: 50 },
  { label: "75%", value: 75 },
  { label: "80%", value: 80 },
  { label: "90%", value: 90 },
  { label: "100% (over budget)", value: 100 },
];

const BILL_ALERT_DAYS = [
  { label: "Same day", value: 0 },
  { label: "1 day before", value: 1 },
  { label: "3 days before", value: 3 },
  { label: "5 days before", value: 5 },
  { label: "1 week before", value: 7 },
];

const DEMO_SETTINGS: Settings = {
  display_name: "Alex",
  email: "demo@orryon.app",
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

const VIEW_TITLES: Record<string, string> = {
  "security-access": "Security & Account Access",
  security: "Security",
  sessions: "Sessions",
  connected: "Connected Accounts",
  "privacy-safety": "Privacy & Safety",
  data: "Data",
  notifications: "Notifications",
  financial: "Financial Preferences",
  subscription: "Subscription",
  app: "App",
  memory: "Memory",
  health: "Health",
  location: "My Places",
  briefing: "Daily Briefing",
  accessibility: "Accessibility",
};

function parentOf(view: View): View {
  if (view === "security" || view === "sessions" || view === "connected")
    return "security-access";
  if (view === "data") return "privacy-safety";
  return null;
}

// ── Small shared components ──────────────────────────────────────────────────

function isDemo() {
  return typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true";
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-10 h-6 rounded-full transition-colors ${on ? "bg-green-500" : "bg-white/10"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`}
      />
    </button>
  );
}

function Row({ label, sublabel, right }: { label: string; sublabel?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-3 border-b border-white/5 last:border-0 gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/85">{label}</p>
        {sublabel && <p className="text-xs text-white/30 mt-0.5">{sublabel}</p>}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function SelectField({ value, onChange, options }: {
  value: string | number;
  onChange: (v: string) => void;
  options: { label: string; value: string | number }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#111] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/20 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function NavItem({
  icon,
  title,
  description,
  onClick,
  href,
  external,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <>
      <span className="text-white/25 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-white/85">{title}</p>
        <p className="text-xs text-white/30 mt-0.5 leading-relaxed">{description}</p>
      </div>
      {external ? (
        <ExternalLink className="h-3.5 w-3.5 text-white/15 shrink-0" strokeWidth={1.5} />
      ) : (
        <ChevronRight className="h-4 w-4 text-white/15 shrink-0" strokeWidth={1.5} />
      )}
    </>
  );

  const cls = "w-full flex items-center gap-4 px-1 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition text-left";

  if (href) {
    return (
      <a href={href} className={cls} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { openPanel, close } = usePanels();
  const { logout, login } = useAuth();
  const { sub, refresh: refreshSub } = useSubscription();
  const { usage: voiceUsage, isAtLimit: voiceAtLimit } = useVoiceUsage();
  const { prefs, update: updatePrefs } = usePreferences();
  const { usage: chatUsage } = useChatUsage();
  const isOpen = openPanel === "settings";

  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>(null);

  // If Stripe charged but webhook missed, reconcile when opening Subscription settings.
  useEffect(() => {
    if (view !== "subscription" || !sub || sub.has_stripe_subscription) return;
    if (sub.plan !== "trial" && sub.plan !== "free") return;
    api.post("/api/subscription/sync").then(() => refreshSub()).catch(() => {});
  }, [view, sub?.plan, sub?.has_stripe_subscription, refreshSub]);

  // display name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // email change flow
  type EmailStep = "idle" | "input" | "code";
  const [emailStep, setEmailStep] = useState<EmailStep>("idle");
  const [newEmail, setNewEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailDevCode, setEmailDevCode] = useState("");

  // delete account flow
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // billing portal
  const [billingLoading, setBillingLoading] = useState(false);

  // export
  const [exportLoading, setExportLoading] = useState(false);
  const [calConnected, setCalConnected] = useState(false);
  const [calSynced, setCalSynced] = useState(0);
  const [calLoading, setCalLoading] = useState(false);
  const [calMsg, setCalMsg] = useState("");

  // active sessions / devices
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [revokeAllLoading, setRevokeAllLoading] = useState(false);
  const [revokeAllDone, setRevokeAllDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setView(null);
    if (isDemo()) { setSettings(DEMO_SETTINGS); return; }
    api.get<Settings>("/api/settings").then(setSettings).catch(() => {});
    api.get<{ connected: boolean; synced_count: number }>("/api/calendar/google/status")
      .then((d) => { setCalConnected(d.connected); setCalSynced(d.synced_count); })
      .catch(() => {});
    api.get<AuthSession[]>("/api/sessions").then(setSessions).catch(() => {});
  }, [isOpen]);

  const patch = async (updates: Record<string, unknown>) => {
    await api.patch("/api/settings", updates);
    setSettings((prev) => prev ? { ...prev, ...updates } as Settings : prev);
  };

  const saveName = async () => {
    if (!nameInput.trim()) return;
    await patch({ display_name: nameInput.trim() });
    setEditingName(false);
  };

  const sendEmailCode = async () => {
    setEmailLoading(true);
    setEmailError("");
    setEmailDevCode("");
    try {
      const res = await api.post<{ sent: boolean; dev_code: string }>("/api/settings/email-change/send-code", { new_email: newEmail });
      if (res.dev_code) setEmailDevCode(res.dev_code);
      setEmailStep("code");
    } catch (e: unknown) {
      setEmailError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setEmailLoading(false);
    }
  };

  const verifyEmailCode = async () => {
    setEmailLoading(true);
    setEmailError("");
    try {
      const res = await api.post<{ email: string }>("/api/settings/email-change/verify", {
        new_email: newEmail,
        code: emailCode,
      });
      const me = await api.get<{ id: string; email: string; display_name: string }>("/api/auth/me");
      login({
        id: me.id,
        email: res.email,
        display_name: me.display_name || settings?.display_name || "",
      });
      setSettings((prev) => prev ? { ...prev, email: res.email } : prev);
      setEmailStep("idle");
      setNewEmail("");
      setEmailCode("");
    } catch (e: unknown) {
      setEmailError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await api.delete("/api/account");
      logout();
      close();
    } catch {
      setDeleteLoading(false);
    }
  };

  const goBack = () => setView(parentOf(view));

  const initials = (settings?.display_name || settings?.email || "?")
    .split(/[\s@]/)[0]
    .slice(0, 2)
    .toUpperCase();

  // ── View renderers ─────────────────────────────────────────────────────────

  const renderMainMenu = () => (
    <>
      {/* Profile card */}
      <div className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl mb-6">
        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-base font-bold text-white shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                className="flex-1 bg-white/5 border border-white/20 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none"
                placeholder="Display name"
              />
              <button onClick={saveName} className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition">
                <Check className="h-3.5 w-3.5 text-green-400" strokeWidth={2} />
              </button>
              <button onClick={() => setEditingName(false)} className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition">
                <X className="h-3.5 w-3.5 text-white/40" strokeWidth={2} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{settings!.display_name || "Set a name"}</p>
                <p className="text-xs text-white/30 mt-0.5 break-all">{settings!.email}</p>
              </div>
              <button
                onClick={() => { setNameInput(settings!.display_name || ""); setEditingName(true); }}
                className="text-xs text-white/40 hover:text-white/70 transition px-2 py-1 rounded-lg hover:bg-white/5"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation items */}
      <div>
        <NavItem
          icon={<Shield className="h-5 w-5" strokeWidth={1.5} />}
          title="Security & Account Access"
          description="Security, sessions, and connected accounts"
          onClick={() => setView("security-access")}
        />
        <NavItem
          icon={<Lock className="h-5 w-5" strokeWidth={1.5} />}
          title="Privacy & Safety"
          description="Manage your data and privacy settings"
          onClick={() => setView("privacy-safety")}
        />
        <NavItem
          icon={<Bell className="h-5 w-5" strokeWidth={1.5} />}
          title="Notifications"
          description="Reminders, digests, and email reports"
          onClick={() => setView("notifications")}
        />
        <NavItem
          icon={<DollarSign className="h-5 w-5" strokeWidth={1.5} />}
          title="Financial Preferences"
          description="Currency, budget cycle, and spending alerts"
          onClick={() => setView("financial")}
        />
        {sub && (
          <NavItem
            icon={<CreditCard className="h-5 w-5" strokeWidth={1.5} />}
            title="Subscription"
            description={
              sub.plan === "trial"
                ? `Pro trial · ${sub.trial_days_remaining} day${sub.trial_days_remaining !== 1 ? "s" : ""} left`
                : sub.plan === "pro"
                ? "Pro — active"
                : "Free — trial ended"
            }
            onClick={() => setView("subscription")}
          />
        )}
        {voiceUsage && sub?.is_active_pro && (
          <NavItem
            icon={<Mic className="h-5 w-5" strokeWidth={1.5} />}
            title="Voice minutes"
            description={
              voiceAtLimit
                ? "All included minutes used · Add more"
                : `${Math.round(voiceUsage.minutes_used)} / ${voiceUsage.total_available_minutes} min used`
            }
            onClick={() => setView("subscription")}
          />
        )}
        <NavItem
          icon={<Download className="h-5 w-5" strokeWidth={1.5} />}
          title="App"
          description="Install Orryon on your device"
          onClick={() => setView("app")}
        />

        {/* ── Separator ── */}
        {sub?.is_active_pro && (
          <div className="my-3 border-t border-white/[0.04]" />
        )}

        {/* ── AI & intelligence ── */}
        {sub?.is_active_pro && (
          <>
            <NavItem
              icon={<Brain className="h-5 w-5" strokeWidth={1.5} />}
              title="Memory"
              description="What Orryon knows about you"
              onClick={() => setView("memory")}
            />
            <NavItem
              icon={<Activity className="h-5 w-5" strokeWidth={1.5} />}
              title="Health"
              description="Vitals, medications, and appointments"
              onClick={() => setView("health")}
            />
            <NavItem
              icon={<MapPin className="h-5 w-5" strokeWidth={1.5} />}
              title="My Places"
              description="Home, work, and commute"
              onClick={() => setView("location")}
            />
            <NavItem
              icon={<Sunrise className="h-5 w-5" strokeWidth={1.5} />}
              title="Daily Briefing"
              description="Morning summary preferences"
              onClick={() => setView("briefing")}
            />
          </>
        )}

        {/* ── Accessibility ── */}
        {sub?.is_active_pro && (
          <NavItem
            icon={<Accessibility className="h-5 w-5" strokeWidth={1.5} />}
            title="Accessibility"
            description="Golden Mode, font size, animations"
            onClick={() => setView("accessibility")}
          />
        )}
      </div>

      {/* Help Center link */}
      <div className="mt-4 border-t border-white/[0.04] pt-2">
        <NavItem
          icon={<HelpCircle className="h-5 w-5" strokeWidth={1.5} />}
          title="Help Center"
          description="FAQs, guides, and support"
          href="/help"
        />
      </div>

      {/* Sign out + delete */}
      <div className="mt-6 pt-2">
        <button
          onClick={() => { logout(); close(); }}
          className="w-full py-3 text-sm text-white/40 hover:text-white/70 transition rounded-xl hover:bg-white/5"
        >
          Sign out
        </button>

        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="w-full text-xs text-white/20 hover:text-white/40 transition mt-1"
          >
            Delete account
          </button>
        ) : (
          <div className="space-y-3 mt-2">
            <p className="text-xs text-white/40 text-center">
              This permanently deletes all your data and cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2 text-xs text-white/30 border border-white/10 rounded-lg hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5 transition disabled:opacity-40"
              >
                {deleteLoading ? "Deleting…" : "Yes, delete everything"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const renderSecurityAccess = () => (
    <div>
      <p className="text-sm text-white/30 mb-6 leading-relaxed">
        Manage your account&apos;s security, active sessions, and connected apps.
      </p>
      <NavItem
        icon={<Shield className="h-5 w-5" strokeWidth={1.5} />}
        title="Security"
        description="Sign-in method and email settings"
        onClick={() => setView("security")}
      />
      <NavItem
        icon={<Smartphone className="h-5 w-5" strokeWidth={1.5} />}
        title="Sessions"
        description={
          sessions.length > 0
            ? `${sessions.length} active session${sessions.length !== 1 ? "s" : ""}`
            : "Manage devices signed into your account"
        }
        onClick={() => setView("sessions")}
      />
      <NavItem
        icon={<CalendarDays className="h-5 w-5" strokeWidth={1.5} />}
        title="Connected Accounts"
        description={calConnected ? "Google Calendar connected" : "Connect Google Calendar and more"}
        onClick={() => setView("connected")}
      />
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-4">
      <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <p className="text-xs text-white/40 mb-1">Sign-in method</p>
        <p className="text-sm text-white/70">Passwordless — one-time code via email</p>
      </div>

      {emailStep === "idle" && (
        <button
          onClick={() => { setEmailStep("input"); setEmailError(""); }}
          className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:bg-white/[0.06] transition text-sm text-white/70 hover:text-white"
        >
          <span>Change login email</span>
          <ChevronRight className="h-4 w-4 text-white/30" strokeWidth={1.5} />
        </button>
      )}

      {emailStep === "input" && (
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-3">
          <p className="text-xs text-white/40">Enter your new email address. We&apos;ll send a verification code to confirm.</p>
          <input
            autoFocus
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          {emailError && <p className="text-xs text-red-400">{emailError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setEmailStep("idle"); setNewEmail(""); setEmailError(""); }}
              className="flex-1 py-2 text-xs text-white/40 border border-white/10 rounded-lg hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              onClick={sendEmailCode}
              disabled={emailLoading || !newEmail.includes("@")}
              className="flex-1 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40"
            >
              {emailLoading ? "Sending…" : "Send code"}
            </button>
          </div>
        </div>
      )}

      {emailStep === "code" && (
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-3">
          <p className="text-xs text-white/40">
            Enter the 6-digit code sent to <span className="text-white/70">{newEmail}</span>
          </p>
          {emailDevCode && (
            <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">
              Dev mode — code: <span className="font-mono font-bold">{emailDevCode}</span>
            </p>
          )}
          <input
            autoFocus
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 tracking-widest text-center font-mono text-base"
            maxLength={6}
          />
          {emailError && <p className="text-xs text-red-400">{emailError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setEmailStep("input"); setEmailCode(""); setEmailError(""); }}
              className="flex-1 py-2 text-xs text-white/40 border border-white/10 rounded-lg hover:bg-white/5 transition"
            >
              Back
            </button>
            <button
              onClick={verifyEmailCode}
              disabled={emailLoading || emailCode.length < 6}
              className="flex-1 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40"
            >
              {emailLoading ? "Verifying…" : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderSessions = () => (
    <div>
      <p className="text-sm text-white/30 mb-4 leading-relaxed">
        Sessions signed into your account. If you lose a device, sign out all other devices to protect your data.
      </p>

      {sessions.length === 0 ? (
        <p className="text-xs text-white/20 text-center py-8">No active sessions found.</p>
      ) : (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
          {sessions.map((s) => {
            const isMobile = /iPhone|iPad|Android/i.test(s.device_name);
            const Icon = isMobile ? Smartphone : Monitor;
            const lastActive = (() => {
              if (!s.last_active) return "";
              const d = new Date(s.last_active);
              const now = new Date();
              const diffMs = now.getTime() - d.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              if (diffMins < 2) return "Just now";
              if (diffMins < 60) return `${diffMins}m ago`;
              const diffHours = Math.floor(diffMins / 60);
              if (diffHours < 24) return `${diffHours}h ago`;
              const diffDays = Math.floor(diffHours / 24);
              return `${diffDays}d ago`;
            })();

            return (
              <div key={s.id} className="flex items-center gap-3 px-3 py-3">
                <Icon className="h-4 w-4 text-white/30 shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white/80 truncate">
                      {s.device_name || "Unknown device"}
                    </p>
                    {s.current && (
                      <span className="text-[10px] font-medium text-emerald-400/80 bg-emerald-400/10 px-1.5 py-0.5 rounded shrink-0">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/25 mt-0.5">
                    {lastActive}{s.ip_address ? ` · ${s.ip_address}` : ""}
                  </p>
                </div>
                {!s.current && (
                  <button
                    onClick={async () => {
                      try {
                        await api.delete(`/api/sessions/${s.id}`);
                        setSessions((prev) => prev.filter((x) => x.id !== s.id));
                      } catch {}
                    }}
                    className="text-xs text-red-400/70 hover:text-red-400 transition shrink-0 px-2 py-1"
                  >
                    Sign out
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sessions.filter((s) => !s.current).length > 0 && (
        <button
          onClick={async () => {
            setRevokeAllLoading(true);
            try {
              await api.post("/api/sessions/revoke-all");
              setSessions((prev) => prev.filter((s) => s.current));
              setRevokeAllDone(true);
              setTimeout(() => setRevokeAllDone(false), 3000);
            } catch {}
            setRevokeAllLoading(false);
          }}
          disabled={revokeAllLoading}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/15 transition text-sm text-red-400 disabled:opacity-50"
        >
          <Shield className="h-4 w-4" strokeWidth={1.5} />
          {revokeAllLoading
            ? "Signing out…"
            : revokeAllDone
            ? "All other devices signed out"
            : "Sign out all other devices"}
        </button>
      )}
    </div>
  );

  const renderConnected = () => (
    <div>
      <p className="text-sm text-white/30 mb-4 leading-relaxed">
        Manage third-party apps and services connected to your account.
      </p>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
          <CalendarDays className="w-4 h-4 text-white/50" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 font-medium">Google Calendar</p>
          <p className="text-xs text-white/30 mt-0.5">
            {calConnected
              ? `Connected · ${calSynced} event${calSynced !== 1 ? "s" : ""} synced`
              : "Sync your Google Calendar events"}
          </p>
          {calMsg && <p className="text-xs text-green-400 mt-1">{calMsg}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {calConnected ? (
            <>
              <button
                onClick={async () => {
                  setCalLoading(true); setCalMsg("");
                  try {
                    const res = await api.post<{ synced: number; message: string }>("/api/calendar/google/sync", {});
                    setCalSynced((p) => p + res.synced);
                    setCalMsg(res.message);
                  } catch { setCalMsg("Sync failed. Try again."); }
                  finally { setCalLoading(false); }
                }}
                disabled={calLoading}
                className="w-11 h-11 flex items-center justify-center text-white/30 hover:text-white/70 transition disabled:opacity-40"
                title="Sync now"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${calLoading ? "animate-spin" : ""}`} strokeWidth={1.5} />
              </button>
              <button
                onClick={async () => {
                  setCalLoading(true);
                  try {
                    await api.delete("/api/calendar/google/disconnect");
                    setCalConnected(false); setCalSynced(0); setCalMsg("");
                  } catch { }
                  finally { setCalLoading(false); }
                }}
                disabled={calLoading}
                className="w-11 h-11 flex items-center justify-center text-white/20 hover:text-red-400 transition disabled:opacity-40"
                title="Disconnect"
              >
                <Unlink className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                const token = localStorage.getItem("orryon_token") ?? "";
                window.location.href = `${getApiBase()}/api/calendar/google/auth?token=${token}`;
              }}
              className="text-xs px-3 py-2.5 min-h-[44px] rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white transition flex items-center gap-1.5"
            >
              <ChevronRight className="w-3 h-3" strokeWidth={2} />
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderPrivacySafety = () => (
    <div>
      <p className="text-sm text-white/30 mb-6 leading-relaxed">
        Control your data and review Orryon&apos;s privacy and safety policies.
      </p>
      <NavItem
        icon={<Download className="h-5 w-5" strokeWidth={1.5} />}
        title="Your Data"
        description="Export or delete your account data"
        onClick={() => setView("data")}
      />
      <NavItem
        icon={<FileText className="h-5 w-5" strokeWidth={1.5} />}
        title="Privacy Policy"
        description="How we collect, use, and protect your information"
        href="/privacy"
      />
      <NavItem
        icon={<FileText className="h-5 w-5" strokeWidth={1.5} />}
        title="Terms of Service"
        description="Usage terms and conditions"
        href="/terms"
      />
      <NavItem
        icon={<Heart className="h-5 w-5" strokeWidth={1.5} />}
        title="Wellness Disclaimer"
        description="Reset Anchors are not a substitute for professional care"
        href="/terms#wellness"
      />
    </div>
  );

  const renderData = () => (
    <div>
      <p className="text-sm text-white/30 mb-4 leading-relaxed">
        Your streaks, reset sessions, and preferences are synced to your account.
        {isDemo() && " In demo mode, data is saved to this browser only and won\u2019t transfer across devices."}
      </p>
      <button
        onClick={async () => {
          setExportLoading(true);
          try {
            const token = localStorage.getItem("orryon_token");
            const res = await fetch(`${getApiBase()}/api/export`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "orryon_export.zip";
            a.click();
            URL.revokeObjectURL(url);
          } catch {
          } finally {
            setExportLoading(false);
          }
        }}
        disabled={exportLoading}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm text-white/60 hover:text-white border border-white/[0.06] rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition disabled:opacity-40"
      >
        <Download className="h-4 w-4" strokeWidth={1.5} />
        {exportLoading ? "Exporting…" : "Export all data (ZIP)"}
      </button>
    </div>
  );

  const renderNotifications = () => (
    <div>
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
        <Row
          label="Default reminder"
          right={
            <SelectField
              value={settings!.default_reminder_minutes}
              onChange={(v) => patch({ default_reminder_minutes: parseInt(v) })}
              options={REMINDER_OPTS}
            />
          }
        />
        <Row
          label="Bill due alert"
          sublabel="Get notified before a bill is due"
          right={
            <SelectField
              value={settings!.bill_due_alert_days ?? 3}
              onChange={(v) => patch({ bill_due_alert_days: parseInt(v) })}
              options={BILL_ALERT_DAYS}
            />
          }
        />
        <Row
          label="Daily morning digest"
          right={
            <Toggle
              on={!!settings!.daily_digest_enabled}
              onToggle={() => patch({ daily_digest_enabled: settings!.daily_digest_enabled ? 0 : 1 })}
            />
          }
        />
        {!!settings!.daily_digest_enabled && (
          <Row
            label="Digest time"
            right={
              <SelectField
                value={settings!.daily_digest_time}
                onChange={(v) => patch({ daily_digest_time: v })}
                options={DIGEST_TIMES.map((t) => ({ label: t, value: t }))}
              />
            }
          />
        )}
        <Row
          label="Weekly email report"
          right={
            <Toggle
              on={!!settings!.weekly_report_enabled}
              onToggle={() => patch({ weekly_report_enabled: settings!.weekly_report_enabled ? 0 : 1 })}
            />
          }
        />
      </div>

      <p className="text-xs text-white/25 mt-3">
        {settings!.smtp_enabled
          ? "Email notifications active"
          : "SMTP not configured — set in .env to enable email alerts"}
      </p>
    </div>
  );

  const renderFinancial = () => (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
      <Row
        label="Currency"
        sublabel="Used for display across the app"
        right={
          <select
            value={settings!.currency || "USD"}
            onChange={(e) => patch({ currency: e.target.value })}
            className="bg-[#111] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/20 cursor-pointer max-w-[160px]"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        }
      />
      <Row
        label="Budget cycle starts"
        sublabel="Day of month your budget resets"
        right={
          <SelectField
            value={settings!.budget_cycle_start || 1}
            onChange={(v) => patch({ budget_cycle_start: parseInt(v) })}
            options={Array.from({ length: 28 }, (_, i) => ({
              label: i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`,
              value: i + 1,
            }))}
          />
        }
      />
      <Row
        label="Spending alert"
        sublabel="Notify when category reaches"
        right={
          <SelectField
            value={settings!.spending_alert_pct || 80}
            onChange={(v) => patch({ spending_alert_pct: parseInt(v) })}
            options={ALERT_PCTS}
          />
        }
      />
    </div>
  );

  const renderSubscription = () => {
    if (!sub) return null;
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
        <Row
          label="Current plan"
          sublabel={
            sub.plan === "trial"
              ? `Pro trial · ${sub.trial_days_remaining} day${sub.trial_days_remaining !== 1 ? "s" : ""} left`
              : sub.plan === "pro"
              ? "Pro"
              : "Free — trial ended"
          }
          right={
            <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/60 uppercase tracking-wider">
              {sub.plan === "trial" ? "Trial" : sub.plan === "pro" ? "Active" : "Expired"}
            </span>
          }
        />
        {/* AI usage allowance (chat + tools) */}
        {chatUsage && sub.is_active_pro && (chatUsage.spend_cap_usd ?? 0) > 0 && (
          <div className="px-3 py-3 border-b border-white/5 space-y-2">
            <div className="flex justify-between text-xs text-white/45">
              <span>AI allowance this month</span>
              <span>
                ${(chatUsage.spend_usd ?? 0).toFixed(2)} / ${(chatUsage.spend_cap_usd ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  chatUsage.at_limit ? "bg-amber-500" : "bg-white/30"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((chatUsage.spend_usd ?? 0) / (chatUsage.spend_cap_usd ?? 1)) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
            {(chatUsage.at_limit || chatUsage.near_limit) && chatUsage.upgrade_plan && (
              <p className="text-xs text-amber-200/80">
                {chatUsage.at_limit
                  ? "Allowance reached — upgrade for more headroom."
                  : "Running low — upgrade for a higher monthly allowance."}
              </p>
            )}
          </div>
        )}

        {/* Voice minute usage meter */}
        {voiceUsage && (sub.plan === "trial" || sub.plan === "pro" || sub.plan === "premium" || sub.plan === "premium_plus") && (
          <div className="px-3 py-3 border-b border-white/5">
            <VoiceUsageMeter usage={voiceUsage} variant="full" />
            {voiceAtLimit && (
              <button
                onClick={async () => {
                  try { await startVoiceTopup(); } catch { /* handled inside */ }
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 text-sm text-white/80
                  border border-white/10 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] transition"
              >
                <Mic className="h-4 w-4" strokeWidth={1.5} />
                Add 60 minutes · $6.00
              </button>
            )}
          </div>
        )}

        {sub.plan === "pro" && (
          <div className="px-3 py-3">
            <button
              onClick={async () => {
                setBillingLoading(true);
                try {
                  const res = await api.post<{ portal_url: string }>("/api/subscription/portal");
                  window.location.href = res.portal_url;
                } catch {
                  setBillingLoading(false);
                }
              }}
              disabled={billingLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-white/60 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition disabled:opacity-40"
            >
              <CreditCard className="h-4 w-4" strokeWidth={1.5} />
              {billingLoading ? "Opening…" : "Manage billing & cancel"}
            </button>
          </div>
        )}
        {sub.plan !== "pro" && (
          <div className="px-3 py-3">
            <button
              onClick={() => {
                window.location.href = "/upgrade";
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-white font-semibold border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 transition"
            >
              <CreditCard className="h-4 w-4" strokeWidth={1.5} />
              {sub.plan === "trial"
                ? "Subscribe or change plan"
                : sub.plan === "free" || sub.plan === "past_due"
                  ? "View plans & upgrade"
                  : "Change plan"}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderApp = () => (
    <div>
      <InstallButton variant="settings" />
      <a
        href="/download"
        className="mt-3 block text-center text-xs text-white/25 hover:text-white/45 transition"
      >
        View all download options →
      </a>
    </div>
  );

  // ── Memory view ─────────────────────────────────────────────────────────────
  const renderMemory = () => <MemoryView />;

  // ── Health view ─────────────────────────────────────────────────────────────
  const renderHealth = () => <HealthView />;

  // ── Location view ───────────────────────────────────────────────────────────
  const renderLocation = () => <LocationView />;

  // ── Briefing view ───────────────────────────────────────────────────────────
  const renderBriefing = () => (
    <BriefingView prefs={prefs} onUpdate={updatePrefs} />
  );

  // ── Accessibility view ──────────────────────────────────────────────────────
  const renderAccessibility = () => (
    <AccessibilityView prefs={prefs} onUpdate={updatePrefs} sub={sub} />
  );

  const renderView = () => {
    switch (view) {
      case "security-access": return renderSecurityAccess();
      case "security": return renderSecurity();
      case "sessions": return renderSessions();
      case "connected": return renderConnected();
      case "privacy-safety": return renderPrivacySafety();
      case "data": return renderData();
      case "notifications": return renderNotifications();
      case "financial": return renderFinancial();
      case "subscription": return renderSubscription();
      case "app": return renderApp();
      case "memory": return renderMemory();
      case "health": return renderHealth();
      case "location": return renderLocation();
      case "briefing": return renderBriefing();
      case "accessibility": return renderAccessibility();
      default: return renderMainMenu();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={close}
          />

          <motion.div
            key="settings-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.2 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 500) close();
            }}
            className="fixed top-0 right-0 h-full z-50 flex flex-col"
            style={{ width: "95vw", maxWidth: 600 }}
          >
            <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl overflow-y-auto flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 sticky top-0 bg-[#080808] z-10 border-b border-white/5 rounded-tl-2xl">
                <div className="flex items-center gap-3">
                  {view && (
                    <button
                      onClick={goBack}
                      className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/5 transition-colors -ml-1"
                    >
                      <ArrowLeft className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                    </button>
                  )}
                  <h1 className="text-lg font-bold">
                    {view ? VIEW_TITLES[view] : "Your Account"}
                  </h1>
                </div>
                <button
                  onClick={close}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                </button>
              </div>

              {!settings ? (
                <div className="flex items-center justify-center flex-1">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                </div>
              ) : (
                <div className="px-5 py-5 flex-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={view ?? "main"}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      {renderView()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Memory View ──────────────────────────────────────────────────────────────

interface MemoryFact { id: string; fact: string; category: string; created_at: string; }

function MemoryView() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ facts: MemoryFact[]; count: number; cap: number }>("/api/memory")
      .then((d) => { setFacts(d.facts); setCount(d.count); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const forget = async (id: string) => {
    setFacts((p) => p.filter((f) => f.id !== id));
    setCount((c) => c - 1);
    try { await api.delete(`/api/memory/${id}`); } catch { /* non-fatal */ }
  };

  if (loading) return <div className="py-8 flex justify-center"><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/50" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/35 leading-relaxed">
        Orryon remembers facts about you across conversations to give personalised advice.
        You can remove any fact at any time.
      </p>
      <div className="flex items-center justify-between text-xs text-white/30">
        <span>{count} facts stored</span>
        {count >= 50 && <span className="text-amber-400/70">Starter cap: 50 facts</span>}
      </div>
      {facts.length === 0 && (
        <p className="py-6 text-center text-sm text-white/20">No memories stored yet.</p>
      )}
      {facts.map((f) => (
        <div key={f.id} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/70 leading-relaxed">{f.fact}</p>
            <p className="text-[0.65rem] text-white/25 mt-1 uppercase tracking-wide">{f.category}</p>
          </div>
          <button
            onClick={() => forget(f.id)}
            className="shrink-0 w-11 h-11 flex items-center justify-center text-white/20 hover:text-red-400/70 transition"
            title="Forget this"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Health View ───────────────────────────────────────────────────────────────

interface Medication { id: string; name: string; dose: string; frequency: string; next_dose_at: string; }
interface Appointment { id: string; type: string; provider: string; date: string; location: string; }

function HealthView() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [addingMed, setAddingMed] = useState(false);
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");

  useEffect(() => {
    api.get<{ medications: Medication[] }>("/api/health/medications").then((d) => setMeds(d.medications)).catch(() => {});
    api.get<{ appointments: Appointment[] }>("/api/health/appointments?upcoming=true").then((d) => setAppts(d.appointments)).catch(() => {});
  }, []);

  const addMed = async () => {
    if (!medName.trim()) return;
    try {
      const row = await api.post<Medication>("/api/health/medications", { name: medName.trim(), dose: medDose.trim() });
      setMeds((p) => [...p, row]);
      setMedName(""); setMedDose(""); setAddingMed(false);
    } catch { /* non-fatal */ }
  };

  const removeMed = async (id: string) => {
    setMeds((p) => p.filter((m) => m.id !== id));
    try { await api.delete(`/api/health/medications/${id}`); } catch { /* non-fatal */ }
  };

  return (
    <div className="space-y-5">
      {/* Medications */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Medications</p>
          <button onClick={() => setAddingMed((v) => !v)} className="text-white/30 hover:text-white/60 transition">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        {addingMed && (
          <div className="mb-3 space-y-2 rounded-xl border border-white/[0.07] p-3">
            <input autoFocus value={medName} onChange={(e) => setMedName(e.target.value)}
              placeholder="Medication name" className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none border-b border-white/10 pb-1" />
            <input value={medDose} onChange={(e) => setMedDose(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMed()}
              placeholder="Dose (e.g. 10mg daily)" className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none border-b border-white/10 pb-1" />
            <div className="flex gap-2 pt-1">
              <button onClick={addMed} className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-lg">Save</button>
              <button onClick={() => setAddingMed(false)} className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 transition">Cancel</button>
            </div>
          </div>
        )}
        {meds.length === 0 && !addingMed && <p className="text-sm text-white/20 py-3">No medications added.</p>}
        {meds.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04]">
            <div className="flex-1">
              <p className="text-sm text-white/75">{m.name}</p>
              {m.dose && <p className="text-xs text-white/30 mt-0.5">{m.dose}</p>}
            </div>
            <button onClick={() => removeMed(m.id)} className="w-11 h-11 flex items-center justify-center text-white/15 hover:text-red-400/70 transition">
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      {/* Upcoming appointments */}
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Upcoming Appointments</p>
        {appts.length === 0 && <p className="text-sm text-white/20">No upcoming appointments.</p>}
        {appts.map((a) => (
          <div key={a.id} className="py-2.5 border-b border-white/[0.04]">
            <p className="text-sm text-white/75">{a.provider || a.type || "Appointment"}</p>
            <p className="text-xs text-white/30 mt-0.5">{a.date}{a.location ? ` · ${a.location}` : ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Location View ─────────────────────────────────────────────────────────────

interface Place { id: string; label: string; address: string; }

function LocationView() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    api.get<{ places: Place[] }>("/api/location/places").then((d) => setPlaces(d.places)).catch(() => {});
  }, []);

  const addPlace = async () => {
    if (!label.trim()) return;
    try {
      const row = await api.post<Place>("/api/location/places", { label: label.trim(), address: address.trim() });
      setPlaces((p) => [...p, row]);
      setLabel(""); setAddress(""); setAdding(false);
    } catch { /* non-fatal */ }
  };

  const removePlace = async (id: string) => {
    setPlaces((p) => p.filter((pl) => pl.id !== id));
    try { await api.delete(`/api/location/places/${id}`); } catch { /* non-fatal */ }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/35 leading-relaxed">
        Save places Orryon should know about — home, work, gym. No live GPS tracking.
      </p>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Places</p>
        <button onClick={() => setAdding((v) => !v)} className="text-white/30 hover:text-white/60 transition">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      {adding && (
        <div className="space-y-2 rounded-xl border border-white/[0.07] p-3">
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Home, Work)" className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none border-b border-white/10 pb-1" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlace()}
            placeholder="Address (optional)" className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none border-b border-white/10 pb-1" />
          <div className="flex gap-2 pt-1">
            <button onClick={addPlace} className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-lg">Save</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 transition">Cancel</button>
          </div>
        </div>
      )}
      {places.length === 0 && !adding && <p className="text-sm text-white/20">No places saved yet.</p>}
      {places.map((pl) => (
        <div key={pl.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04]">
          <MapPin className="h-4 w-4 text-white/25 shrink-0" strokeWidth={1.5} />
          <div className="flex-1">
            <p className="text-sm text-white/75">{pl.label}</p>
            {pl.address && <p className="text-xs text-white/30 mt-0.5">{pl.address}</p>}
          </div>
          <button onClick={() => removePlace(pl.id)} className="w-11 h-11 flex items-center justify-center text-white/15 hover:text-red-400/70 transition">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Briefing View ─────────────────────────────────────────────────────────────

const BRIEFING_SECTIONS = [
  { key: "finance",  label: "Finances" },
  { key: "health",   label: "Health & medications" },
  { key: "calendar", label: "Calendar & events" },
  { key: "goals",    label: "Goals progress" },
];

const BRIEFING_TIMES = ["06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00"];

function BriefingView({ prefs, onUpdate }: { prefs: ReturnType<typeof usePreferences>["prefs"]; onUpdate: ReturnType<typeof usePreferences>["update"]; }) {
  const includes = (prefs.briefing_includes || "finance,health,calendar,goals").split(",");

  const toggleSection = (key: string) => {
    const next = includes.includes(key) ? includes.filter((k) => k !== key) : [...includes, key];
    onUpdate({ briefing_includes: next.join(",") });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Briefing time</p>
        <div className="grid grid-cols-3 gap-2">
          {BRIEFING_TIMES.map((t) => (
            <button
              key={t}
              onClick={() => onUpdate({ briefing_time: t })}
              className={`min-h-[44px] rounded-xl text-xs font-medium transition border ${prefs.briefing_time === t ? "border-white/20 bg-white/10 text-white/90" : "border-white/[0.06] bg-white/[0.03] text-white/35 hover:bg-white/[0.06]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Include in briefing</p>
        {BRIEFING_SECTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-2 border-b border-white/[0.04] min-h-[52px]">
            <p className="text-sm text-white/70">{label}</p>
            <button
              onClick={() => toggleSection(key)}
              className={`relative flex items-center justify-center w-11 h-11 rounded-full transition-colors duration-200`}
              aria-checked={includes.includes(key)}
              role="switch"
            >
              <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 block ${includes.includes(key) ? "bg-white/80" : "bg-white/10"}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-200 ${includes.includes(key) ? "translate-x-4" : "translate-x-0"}`} />
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Accessibility View ────────────────────────────────────────────────────────

function AccessibilityView({ prefs, onUpdate, sub }: {
  prefs: ReturnType<typeof usePreferences>["prefs"];
  onUpdate: ReturnType<typeof usePreferences>["update"];
  sub: ReturnType<typeof useSubscription>["sub"];
}) {
  const plan = sub?.plan;
  const isPlus = plan === "premium_plus";
  const isPremiumTier = plan === "premium" || plan === "premium_plus";

  return (
    <div className="space-y-4">
      {/* Golden Mode */}
      <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.04]">
        <div>
          <p className="text-sm text-white/80 font-medium">Gentle Mode</p>
          <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
            A warmer, unhurried Orryon. Speaks more carefully, checks in often,
            and keeps everything simple.
          </p>
        </div>
        <button
          onClick={() => onUpdate({ golden_mode_enabled: !prefs.golden_mode_enabled })}
          className="relative shrink-0 flex items-center justify-center w-11 h-11 mt-0.5"
          role="switch"
          aria-checked={prefs.golden_mode_enabled}
        >
          <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 block ${prefs.golden_mode_enabled ? "bg-white/80" : "bg-white/10"}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-200 ${prefs.golden_mode_enabled ? "translate-x-4" : "translate-x-0"}`} />
          </span>
        </button>
      </div>

      {/* TTS — Premium Plus only */}
      {isPlus && (
        <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.04]">
          <div>
            <p className="text-sm text-white/80 font-medium">Speak responses aloud</p>
            <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
              Hear Orryon read each reply (Premium Plus). Off = text only. Uses voice minutes.
            </p>
          </div>
          <button
            onClick={() => onUpdate({ voice_overlay_enabled: !prefs.voice_overlay_enabled })}
            className="relative shrink-0 flex items-center justify-center w-11 h-11 mt-0.5"
            role="switch"
            aria-checked={prefs.voice_overlay_enabled}
          >
            <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 block ${prefs.voice_overlay_enabled ? "bg-white/80" : "bg-white/10"}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-200 ${prefs.voice_overlay_enabled ? "translate-x-4" : "translate-x-0"}`} />
            </span>
          </button>
        </div>
      )}

      {!isPlus && sub?.is_active_pro && (
        <p className="text-xs text-white/25 leading-relaxed">
          Trial, Pro, and Premium: speak or type — Orryon replies in text.
          Premium Plus can turn on spoken replies aloud.
        </p>
      )}

      {/* Live Orryon — Premium speak-in, text replies */}
      {isPremiumTier && (
        <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.04]">
          <div>
            <p className="text-sm text-white/80 font-medium">Live Orryon</p>
            <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
              Floating companion — click or press ` to speak. Orryon replies in text
              {isPlus ? "; turn on Speak responses aloud to hear replies too." : " (Premium Plus hears replies aloud)."}
            </p>
          </div>
          <button
            onClick={() => onUpdate({ live_orryon_enabled: !prefs.live_orryon_enabled })}
            className="relative shrink-0 flex items-center justify-center w-11 h-11 mt-0.5"
            role="switch"
            aria-checked={prefs.live_orryon_enabled}
          >
            <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 block ${prefs.live_orryon_enabled ? "bg-white/80" : "bg-white/10"}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-200 ${prefs.live_orryon_enabled ? "translate-x-4" : "translate-x-0"}`} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
