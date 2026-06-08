"use client";

import type { SettingsPanel } from "../panel-types";

import { Shield, Smartphone, CalendarDays } from "lucide-react";
import { NavItem } from "../ui";


export function SecurityAccessView({ panel }: { panel: SettingsPanel }) {
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
}
