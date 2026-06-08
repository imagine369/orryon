"use client";

import type { SettingsPanel } from "../panel-types";

import { Smartphone, Monitor, Shield } from "lucide-react";
import { api } from "@/lib/api";


export function SessionsView({ panel }: { panel: SettingsPanel }) {
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
}
