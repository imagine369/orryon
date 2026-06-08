"use client";

import type { SettingsPanel } from "../panel-types";

import { Row, SelectField, Toggle } from "../ui";
import { REMINDER_OPTS, BILL_ALERT_DAYS, DIGEST_TIMES } from "../constants";


export function NotificationsView({ panel }: { panel: SettingsPanel }) {
  const {
    logout, close, sub, prefs, updatePrefs, chatUsage,
    settings, view, setView,
    accountDraft, setAccountDraft,
    emailStep, setEmailStep, newEmail, setNewEmail, emailCode, setEmailCode,
    emailLoading, emailError, setEmailError, emailDevCode,
    deleteConfirm, setDeleteConfirm, deleteLoading, setDeleteLoading,
    billingLoading, setBillingLoading, exportLoading, setExportLoading,
    calConnected, setCalConnected, calSynced, setCalSynced, calLoading, setCalLoading, calMsg, setCalMsg,
    sessions, setSessions, revokeAllLoading, setRevokeAllLoading, revokeAllDone, setRevokeAllDone,
    patch, saveProfileField, sendEmailCode, verifyEmailCode, handleDeleteAccount,
  } = panel;

  return (
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
}
