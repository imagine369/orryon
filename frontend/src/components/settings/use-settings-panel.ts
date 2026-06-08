"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { usePanels } from "@/lib/panel-context";
import { useSubscription } from "@/lib/use-subscription";
import { usePreferences } from "@/lib/use-preferences";
import { useChatUsage } from "@/lib/use-chat-usage";
import { formatDisplayName } from "@/lib/format-display-name";
import type { Settings, AuthSession, View } from "./types";
import type { EmailStep } from "./types";
import { DEMO_SETTINGS } from "./constants";
import { isDemo, parentOf } from "./utils";

export function useSettingsPanel() {
    const { openPanel, close } = usePanels();
    const { logout, login } = useAuth();
    const { sub, refresh: refreshSub } = useSubscription();
    const { prefs, update: updatePrefs } = usePreferences();
    const { usage: chatUsage, reload: reloadChatUsage } = useChatUsage();
    const isOpen = openPanel === "settings";

    const [settings, setSettings] = useState<Settings | null>(null);
    const [view, setView] = useState<View>(null);

    // Refresh plan + usage when opening Plan & Usage (pulls billing period from Stripe).
    useEffect(() => {
      if (view !== "subscription") return;
      refreshSub();
      reloadChatUsage();
    }, [view, reloadChatUsage, refreshSub]);

    // If Stripe charged but webhook missed, reconcile when opening Subscription settings.
    useEffect(() => {
      if (view !== "subscription" || !sub || sub.has_stripe_subscription) return;
      if (sub.plan !== "trial" && sub.plan !== "free") return;
      api.post("/api/subscription/sync").then(() => refreshSub()).catch(() => {});
    }, [view, sub?.plan, sub?.has_stripe_subscription, refreshSub]);

    const [accountDraft, setAccountDraft] = useState({
      display_name: "",
      phone: "",
      country: "",
      language: "en",
      birth_date: "",
      gender: "",
    });

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
    const [calOAuthAvailable, setCalOAuthAvailable] = useState(false);
    const [calSyncPaused, setCalSyncPaused] = useState(false);
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
      setEmailStep("idle");
      setNewEmail("");
      setEmailCode("");
      setEmailError("");
      if (isDemo()) { setSettings(DEMO_SETTINGS); return; }
      api.get<Settings>("/api/settings").then(setSettings).catch(() => {});
      api.get<{
        connected: boolean;
        oauth_available: boolean;
        sync_paused: boolean;
        synced_count: number;
      }>("/api/calendar/google/status")
        .then((d) => {
          setCalConnected(d.connected);
          setCalOAuthAvailable(d.oauth_available);
          setCalSyncPaused(d.sync_paused);
          setCalSynced(d.synced_count);
        })
        .catch(() => {});
      api.get<AuthSession[]>("/api/sessions").then(setSessions).catch(() => {});
    }, [isOpen]);

    const patch = async (updates: Record<string, unknown>) => {
      if (isDemo()) {
        setSettings((prev) => prev ? { ...prev, ...updates } as Settings : prev);
        return;
      }
      await api.patch("/api/settings", updates);
      setSettings((prev) => prev ? { ...prev, ...updates } as Settings : prev);
    };

    useEffect(() => {
      if (!settings || view !== "account") return;
      setAccountDraft({
        display_name: settings.display_name || "",
        phone: settings.phone || "",
        country: settings.country || "",
        language: settings.language || "en",
        birth_date: settings.birth_date || "",
        gender: settings.gender || "",
      });
    }, [settings, view]);

    const saveProfileField = async (
      key: "display_name" | "phone" | "country" | "language" | "birth_date" | "gender",
      value: string,
    ) => {
      const trimmed =
        key === "display_name" ? formatDisplayName(value) : value;
      const current = settings?.[key] ?? (key === "language" ? "en" : "");
      if (trimmed === current) return;
      await patch({ [key]: trimmed });
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

  return {
    openPanel, close, logout, login, sub, refreshSub, prefs, updatePrefs, chatUsage, reloadChatUsage, isOpen,
    settings, setSettings, view, setView,
    accountDraft, setAccountDraft,
    emailStep, setEmailStep, newEmail, setNewEmail, emailCode, setEmailCode, emailLoading, emailError, setEmailError, emailDevCode, setEmailDevCode,
    deleteConfirm, setDeleteConfirm, deleteLoading, setDeleteLoading,
    billingLoading, setBillingLoading, exportLoading, setExportLoading,
    calConnected, setCalConnected, calOAuthAvailable, setCalOAuthAvailable,
    calSyncPaused, setCalSyncPaused,
    calSynced, setCalSynced, calLoading, setCalLoading, calMsg, setCalMsg,
    sessions, setSessions, revokeAllLoading, setRevokeAllLoading, revokeAllDone, setRevokeAllDone,
    patch, saveProfileField, sendEmailCode, verifyEmailCode, handleDeleteAccount, goBack,
  };
}
