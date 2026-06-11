"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { usePanels } from "@/lib/panel-context";
import { useSubscription } from "@/lib/use-subscription";
import { usePreferences } from "@/lib/use-preferences";
import { useChatUsage } from "@/lib/use-chat-usage";
import { formatDisplayName } from "@/lib/format-display-name";
import type { Settings, AuthSession, View } from "./types";
import type { EmailStep } from "./types";
import { DEMO_SETTINGS, bootstrapSettingsFromUser } from "./constants";
import { isDemo, parentOf } from "./utils";

const SETTINGS_RETRY_DELAYS_MS = [0, 400, 1200, 2500];
const SETTINGS_FETCH_TIMEOUT_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnauthorized(err: unknown): boolean {
  return (
    (err instanceof ApiError && err.status === 401) ||
    (err instanceof Error && err.message === "Unauthorized")
  );
}

function fetchSettingsWithTimeout(): Promise<Settings> {
  return Promise.race([
    api.get<Settings>("/api/settings"),
    sleep(SETTINGS_FETCH_TIMEOUT_MS).then(() => {
      throw new Error("Settings request timed out. Check your connection and try again.");
    }),
  ]);
}

export function useSettingsPanel() {
  const { openPanel, close } = usePanels();
  const { user, logout, login } = useAuth();
  const { sub, refresh: refreshSub } = useSubscription();
  const { prefs, update: updatePrefs } = usePreferences();
  const { usage: chatUsage, reload: reloadChatUsage } = useChatUsage();
  const isOpen = openPanel === "settings";

  const [fetchedSettings, setFetchedSettings] = useState<Settings | null>(null);
  const [settingsSyncing, setSettingsSyncing] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [view, setView] = useState<View>(null);

  // Bootstrap from auth user whenever logged in — never gate on isOpen (panel can
  // open on the same render; gating caused settings=null + spinner).
  const settings = useMemo(() => {
    if (isDemo()) return DEMO_SETTINGS;
    if (fetchedSettings) return fetchedSettings;
    if (user) return bootstrapSettingsFromUser(user);
    return null;
  }, [fetchedSettings, user]);

  useEffect(() => {
    if (view !== "subscription") return;
    refreshSub();
    reloadChatUsage();
  }, [view, reloadChatUsage, refreshSub]);

  useEffect(() => {
    if (view !== "subscription" || !sub || sub.has_stripe_subscription) return;
    if (sub.plan !== "trial" && sub.plan !== "free") return;
    api.post("/api/subscription/sync").then(() => refreshSub()).catch(() => {});
  }, [view, sub, refreshSub]);

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

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [calConnected, setCalConnected] = useState(false);
  const [calOAuthAvailable, setCalOAuthAvailable] = useState(false);
  const [calSyncPaused, setCalSyncPaused] = useState(false);
  const [calSynced, setCalSynced] = useState(0);
  const [calLoading, setCalLoading] = useState(false);
  const [calMsg, setCalMsg] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailAvailable, setGmailAvailable] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailMsg, setGmailMsg] = useState("");
  const [contactsGranted, setContactsGrantedState] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("orryon_contacts_granted") === "true";
  });
  const setContactsGranted = (granted: boolean) => {
    localStorage.setItem("orryon_contacts_granted", granted ? "true" : "false");
    setContactsGrantedState(granted);
  };
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [revokeAllLoading, setRevokeAllLoading] = useState(false);
  const [revokeAllDone, setRevokeAllDone] = useState(false);

  const syncSettings = useCallback(async (cancelled: () => boolean) => {
    if (isDemo()) {
      setFetchedSettings(DEMO_SETTINGS);
      setSettingsSyncing(false);
      setSettingsError(null);
      return;
    }

    setSettingsSyncing(true);
    setSettingsError(null);

    let lastErr: unknown;
    for (let i = 0; i < SETTINGS_RETRY_DELAYS_MS.length; i++) {
      const delay = SETTINGS_RETRY_DELAYS_MS[i];
      if (delay > 0) await sleep(delay);
      if (cancelled()) {
        setSettingsSyncing(false);
        return;
      }

      try {
        const data = await fetchSettingsWithTimeout();
        if (cancelled()) {
          setSettingsSyncing(false);
          return;
        }
        setFetchedSettings(data);
        setSettingsSyncing(false);
        setSettingsError(null);
        return;
      } catch (err) {
        lastErr = err;
        if (isUnauthorized(err)) break;
      }
    }

    if (cancelled()) {
      setSettingsSyncing(false);
      return;
    }
    setSettingsSyncing(false);
    setSettingsError(
      lastErr instanceof Error ? lastErr.message : "Couldn't load settings",
    );
  }, []);

  const loadAuxiliaryData = useCallback((cancelled: () => boolean) => {
    api.get<{
      connected: boolean;
      oauth_available: boolean;
      sync_paused: boolean;
      synced_count: number;
    }>("/api/calendar/google/status")
      .then((d) => {
        if (cancelled()) return;
        setCalConnected(d.connected);
        setCalOAuthAvailable(d.oauth_available);
        setCalSyncPaused(d.sync_paused);
        setCalSynced(d.synced_count);
      })
      .catch(() => {});
    api.get<{ gmail_available: boolean; connected: boolean }>("/api/gmail/status")
      .then((d) => {
        if (cancelled()) return;
        setGmailAvailable(d.gmail_available);
        setGmailConnected(d.connected);
      })
      .catch(() => {});
    api.get<AuthSession[]>("/api/sessions")
      .then((rows) => {
        if (cancelled()) return;
        setSessions(rows);
      })
      .catch(() => {});
  }, []);

  useQueuedEffect(() => {
    if (!isOpen || !user) return;

    setView(null);
    setEmailStep("idle");
    setNewEmail("");
    setEmailCode("");
    setEmailError("");
    setSettingsError(null);

    let cancelled = false;
    const isCancelled = () => cancelled;

    void syncSettings(isCancelled);
    loadAuxiliaryData(isCancelled);

    return () => {
      cancelled = true;
      setSettingsSyncing(false);
    };
  }, [isOpen, user?.id, syncSettings, loadAuxiliaryData]);

  const patch = useCallback(async (updates: Record<string, unknown>) => {
    if (isDemo()) {
      setFetchedSettings((prev) => {
        const base = prev ?? DEMO_SETTINGS;
        return { ...base, ...updates } as Settings;
      });
      return;
    }
    await api.patch("/api/settings", updates);
    setFetchedSettings((prev) => {
      const base = prev ?? (user ? bootstrapSettingsFromUser(user) : null);
      return base ? ({ ...base, ...updates } as Settings) : prev;
    });
  }, [user]);

  useQueuedEffect(() => {
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
      const res = await api.post<{ sent: boolean; dev_code: string }>(
        "/api/settings/email-change/send-code",
        { new_email: newEmail },
      );
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
      setFetchedSettings((prev) => {
        const base = prev ?? (settings ?? null);
        return base ? { ...base, email: res.email } : prev;
      });
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

  const reloadSettings = useCallback(() => {
    if (!isOpen || !user) return;
    void syncSettings(() => false);
  }, [isOpen, user, syncSettings]);

  return {
    openPanel, close, logout, login, sub, refreshSub, prefs, updatePrefs, chatUsage, reloadChatUsage, isOpen,
    settings, setSettings: setFetchedSettings, settingsLoading: settingsSyncing, settingsError, reloadSettings, view, setView,
    accountDraft, setAccountDraft,
    emailStep, setEmailStep, newEmail, setNewEmail, emailCode, setEmailCode, emailLoading, emailError, setEmailError, emailDevCode, setEmailDevCode,
    deleteConfirm, setDeleteConfirm, deleteLoading, setDeleteLoading,
    billingLoading, setBillingLoading, exportLoading, setExportLoading,
    calConnected, setCalConnected, calOAuthAvailable, setCalOAuthAvailable,
    calSyncPaused, setCalSyncPaused,
    calSynced, setCalSynced, calLoading, setCalLoading, calMsg, setCalMsg,
    gmailConnected, setGmailConnected, gmailAvailable, setGmailAvailable,
    gmailLoading, setGmailLoading, gmailMsg, setGmailMsg,
    contactsGranted, setContactsGranted,
    sessions, setSessions, revokeAllLoading, setRevokeAllLoading, revokeAllDone, setRevokeAllDone,
    patch, saveProfileField, sendEmailCode, verifyEmailCode, handleDeleteAccount, goBack,
  };
}
