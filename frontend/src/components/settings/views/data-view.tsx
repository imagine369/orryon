"use client";

import type { SettingsPanel } from "../panel-types";

import { Download } from "lucide-react";
import { getApiBase } from "@/lib/api";
import { isDemo } from "../utils";


export function DataView({ panel }: { panel: SettingsPanel }) {
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
}
