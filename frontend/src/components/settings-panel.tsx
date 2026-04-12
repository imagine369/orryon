"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ChevronRight } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { usePanels } from "@/lib/panel-context";
import { Separator } from "@/components/ui/separator";

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.65rem] uppercase tracking-widest text-white/25 font-semibold mb-3 mt-1">
      {children}
    </p>
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

export function SettingsPanel() {
  const { openPanel, close } = usePanels();
  const { logout, login } = useAuth();
  const isOpen = openPanel === "settings";

  const [settings, setSettings] = useState<Settings | null>(null);

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

  useEffect(() => {
    if (isOpen) {
      api.get<Settings>("/api/settings").then(setSettings).catch(() => {});
    }
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
      const res = await api.post<{ token: string; email: string }>("/api/settings/email-change/verify", {
        new_email: newEmail,
        code: emailCode,
      });
      setToken(res.token);
      login(res.token, {
        id: "",
        email: res.email,
        display_name: settings?.display_name || "",
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

  const initials = (settings?.display_name || settings?.email || "?")
    .split(/[\s@]/)[0]
    .slice(0, 2)
    .toUpperCase();

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
            dragElastic={{ left: 0.2, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -500) close();
            }}
            className="fixed top-0 right-0 h-full z-50 flex flex-col"
            style={{ width: "95vw", maxWidth: 600 }}
          >
            <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl overflow-y-auto flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-6 pb-4 sticky top-0 bg-[#080808] z-10 border-b border-white/5 rounded-tl-2xl">
                <h1 className="text-2xl font-extrabold">Settings</h1>
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
                <div className="px-5 py-5 flex-1 space-y-6">

                  {/* ── PROFILE ── */}
                  <section>
                    <SectionLabel>Profile</SectionLabel>

                    <div className="flex items-center gap-4 mb-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
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
                            <button onClick={saveName} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition">
                              <Check className="h-3.5 w-3.5 text-green-400" strokeWidth={2} />
                            </button>
                            <button onClick={() => setEditingName(false)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition">
                              <X className="h-3.5 w-3.5 text-white/40" strokeWidth={2} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{settings.display_name || "Set a name"}</p>
                              <p className="text-xs text-white/30 mt-0.5 break-all">{settings.email}</p>
                            </div>
                            <button
                              onClick={() => { setNameInput(settings.display_name || ""); setEditingName(true); }}
                              className="text-xs text-white/40 hover:text-white/70 transition px-2 py-1 rounded-lg hover:bg-white/5"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  <Separator className="bg-white/5" />

                  {/* ── SECURITY ── */}
                  <section>
                    <SectionLabel>Security</SectionLabel>

                    <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl mb-3">
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
                  </section>

                  <Separator className="bg-white/5" />

                  {/* ── FINANCIAL PREFERENCES ── */}
                  <section>
                    <SectionLabel>Financial Preferences</SectionLabel>

                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
                      <Row
                        label="Currency"
                        sublabel="Used for display across the app"
                        right={
                          <select
                            value={settings.currency || "USD"}
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
                            value={settings.budget_cycle_start || 1}
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
                            value={settings.spending_alert_pct || 80}
                            onChange={(v) => patch({ spending_alert_pct: parseInt(v) })}
                            options={ALERT_PCTS}
                          />
                        }
                      />
                    </div>
                  </section>

                  <Separator className="bg-white/5" />

                  {/* ── NOTIFICATIONS ── */}
                  <section>
                    <SectionLabel>Notifications</SectionLabel>

                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
                      <Row
                        label="Default reminder"
                        right={
                          <SelectField
                            value={settings.default_reminder_minutes}
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
                            value={settings.bill_due_alert_days ?? 3}
                            onChange={(v) => patch({ bill_due_alert_days: parseInt(v) })}
                            options={BILL_ALERT_DAYS}
                          />
                        }
                      />
                      <Row
                        label="Daily morning digest"
                        right={
                          <Toggle
                            on={!!settings.daily_digest_enabled}
                            onToggle={() => patch({ daily_digest_enabled: settings.daily_digest_enabled ? 0 : 1 })}
                          />
                        }
                      />
                      {!!settings.daily_digest_enabled && (
                        <Row
                          label="Digest time"
                          right={
                            <SelectField
                              value={settings.daily_digest_time}
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
                            on={!!settings.weekly_report_enabled}
                            onToggle={() => patch({ weekly_report_enabled: settings.weekly_report_enabled ? 0 : 1 })}
                          />
                        }
                      />
                    </div>

                    <p className="text-xs text-white/25 mt-2">
                      {settings.smtp_enabled
                        ? "Email notifications active"
                        : "SMTP not configured — set in .env to enable email alerts"}
                    </p>
                  </section>

                  <Separator className="bg-white/5" />

                  {/* ── SIGN OUT + DELETE ── */}
                  <section className="pb-6">
                    <button
                      onClick={() => { logout(); close(); }}
                      className="w-full py-3 text-sm text-white/40 hover:text-white/70 transition rounded-xl hover:bg-white/5"
                    >
                      Sign out
                    </button>



                    {!deleteConfirm ? (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="w-full text-xs text-white/20 hover:text-white/40 transition"
                      >
                        Delete account
                      </button>
                    ) : (
                      <div className="space-y-3">
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
                  </section>

                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
