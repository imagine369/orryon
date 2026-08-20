"use client";

import type { SettingsPanel } from "../panel-types";

import { User, CreditCard, Accessibility, Bell, Download, Shield, Lock, HelpCircle, DollarSign, Brain, Sunrise, Activity, MapPin, Sparkles, KeyRound } from "lucide-react";
import { NavItem } from "../ui";


export function MainMenuView({ panel }: { panel: SettingsPanel }) {
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
  <>
    <div>
      {/* ── Account ── */}
      <NavItem
        icon={<User className="h-5 w-5" strokeWidth={1.5} />}
        title="Account information"
        description="Name, contact details, and profile"
        onClick={() => setView("account")}
      />
      <NavItem
        icon={<KeyRound className="h-5 w-5" strokeWidth={1.5} />}
        title="Grok (xAI)"
        description={
          settings?.xai_key_set
            ? `Key saved${settings.xai_key_masked ? ` · ${settings.xai_key_masked}` : ""}`
            : "Paste your API key to chat"
        }
        onClick={() => setView("grok")}
      />
      {sub && settings?.billing_enabled && (
        <NavItem
          icon={<CreditCard className="h-5 w-5" strokeWidth={1.5} />}
          title="Plan & Usage"
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

      {/* ── Easy to use ── */}
      {sub?.is_active_pro && (
        <NavItem
          icon={<Accessibility className="h-5 w-5" strokeWidth={1.5} />}
          title="Accessibility"
          description="Golden Mode, font size, animations"
          onClick={() => setView("accessibility")}
        />
      )}
      <NavItem
        icon={<Bell className="h-5 w-5" strokeWidth={1.5} />}
        title="Notifications"
        description="Reminders, digests, and email reports"
        onClick={() => setView("notifications")}
      />
      <NavItem
        icon={<Download className="h-5 w-5" strokeWidth={1.5} />}
        title="App"
        description="Install Orryon on your device"
        onClick={() => setView("app")}
      />
      <NavItem
        icon={<Sparkles className="h-5 w-5" strokeWidth={1.5} />}
        title="Ambient Pickup"
        description="Wake Orryon when you pick up your phone"
        onClick={() => setView("ambient")}
      />

      {/* ── Your day ── */}
      {sub?.is_active_pro && (
        <>
          <div className="my-3 border-t border-white/[0.04]" />
          <NavItem
            icon={<Sunrise className="h-5 w-5" strokeWidth={1.5} />}
            title="Daily Briefing"
            description="Morning summary preferences"
            onClick={() => setView("briefing")}
          />
          <NavItem
            icon={<Activity className="h-5 w-5" strokeWidth={1.5} />}
            title="Health"
            description="Vitals, medications, and appointments"
            onClick={() => setView("health")}
          />
        </>
      )}
      <NavItem
        icon={<DollarSign className="h-5 w-5" strokeWidth={1.5} />}
        title="Financial Preferences"
        description="Currency, budget cycle, and spending alerts"
        onClick={() => setView("financial")}
      />
      {sub?.is_active_pro && (
        <NavItem
          icon={<MapPin className="h-5 w-5" strokeWidth={1.5} />}
          title="My Places"
          description="Home, work, and commute"
          onClick={() => setView("location")}
        />
      )}

      {/* ── Account access & privacy ── */}
      <div className="my-3 border-t border-white/[0.04]" />
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

      {/* ── AI transparency ── */}
      {sub?.is_active_pro && (
        <>
          <div className="my-3 border-t border-white/[0.04]" />
          <NavItem
            icon={<Brain className="h-5 w-5" strokeWidth={1.5} />}
            title="Memory"
            description="What Orryon knows about you"
            onClick={() => setView("memory")}
          />
        </>
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
}
