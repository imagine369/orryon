"use client";

import type { SettingsPanel } from "../panel-types";

import { Download, FileText, Heart } from "lucide-react";
import { NavItem } from "../ui";


export function PrivacySafetyView({ panel }: { panel: SettingsPanel }) {
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
}
