"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, X, SquarePen, Trash2, MessageSquare, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/use-subscription";
import {
  streamChatAuto,
  warmConnection,
  connectChatWs,
  disconnectChatWs,
  api,
  PlanLimitError,
  type PlanLimitDetail,
} from "@/lib/api";
import { VoiceLimitError, textToSpeech } from "@/lib/voice";
import {
  planAllowsVoiceInput,
  planAllowsVoiceOutput,
  planShowsSpeakResponsesToggle,
} from "@/lib/voice-plan";
import { ChatInput, type VoiceStatus, type MessageSource } from "@/components/chat-input";
import { ChatThread } from "@/components/chat-thread";
import { VoiceLimitModal } from "@/components/voice-limit-modal";
import { UpgradeLimitModal, type LimitKind } from "@/components/upgrade-limit-modal";
import { UsageUpgradeBanner } from "@/components/usage-upgrade-banner";
import { useChatUsage } from "@/lib/use-chat-usage";
import { useSubscriptionService } from "@/lib/subscription-service";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dispatchDataChanged } from "@/lib/use-data-refresh";
import { usePreferences } from "@/lib/use-preferences";
import { deriveOrryonAliveState } from "@/lib/orryon-alive-state";
import { OrryonAliveAvatar } from "@/components/orryon-alive-avatar";
import { ChatStarterPrompts } from "@/components/chat-starter-prompts";
import {
  DeleteConfirmModal,
  type PendingDestructiveAction,
} from "@/components/delete-confirm-modal";
import { HEALTH_DISCLAIMER_SHORT, PRO_TEXT_ONLY_HINT } from "@/lib/life-os-copy";
import {
  POST_CHECKOUT_SESSION_KEY,
  readCheckoutIntent,
  clearCheckoutIntent,
  planDisplayName,
  isCheckoutComplete,
  storeCheckoutIntent,
} from "@/lib/post-checkout";
import type { Subscription } from "@/lib/use-subscription";
import { shouldShowToolCaption } from "@/lib/chat-tool-ui";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  /** Track how a user message was sent so Retry replays in the same mode. */
  source?: MessageSource;
}

interface ChatSession {
  id: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Shared max-width token used by every horizontal section
const CONTAINER = "mx-auto w-full max-w-3xl px-4";

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user } = useAuth();
  const { sub, refresh: refreshSub } = useSubscription();
  const router = useRouter();
  const { openUpgradePlans } = useSubscriptionService();
  const { usage: chatUsage, reload: reloadChatUsage } = useChatUsage();
  const searchParams = useSearchParams();


  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [toolLabel, setToolLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [tasksDueToday, setTasksDueToday] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [upgradeBanner, setUpgradeBanner] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationPlan, setActivationPlan] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const postCheckoutPollStartedRef = useRef(false);
  const postCheckoutPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sessionId, setSessionId] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<PendingDestructiveAction | null>(null);

  // ── Preferences (voice overlay, golden mode) ────────────────────────────────
  const { prefs, update: updatePrefs } = usePreferences();
  const voiceInputOn = planAllowsVoiceInput(sub?.plan);
  const voiceOverlayOn = planAllowsVoiceOutput(sub?.plan, prefs.voice_overlay_enabled);
  const showSpeakToggle = planShowsSpeakResponsesToggle(sub?.plan);

  // ── Voice ───────────────────────────────────────────────────────────────────
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const orryonAliveState = deriveOrryonAliveState(voiceStatus, streaming, thinking);

  // Voice limit modal — shown when the user exhausts their monthly minute cap.
  const [voiceLimitOpen, setVoiceLimitOpen] = useState(false);
  const [voiceLimitInfo, setVoiceLimitInfo] = useState<{
    minutesUsed: number;
    limitMinutes: number;
  } | null>(null);

  // ── Plan limit modal (messages or API allowance) ─────────────────────────────
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  const [planLimitInfo, setPlanLimitInfo] = useState<{
    kind: LimitKind;
    plan: string;
    upgradePlan?: string | null;
    messagesUsed: number;
    messageLimit: number;
    spendUsd: number;
    spendCapUsd: number;
  } | null>(null);

  const openPlanLimitModal = useCallback((detail: PlanLimitDetail) => {
    const isUsage = detail.code === "usage_limit_reached";
    setPlanLimitInfo({
      kind: isUsage ? "usage" : "messages",
      plan: detail.plan ?? sub?.plan ?? "pro",
      upgradePlan: detail.upgrade_plan ?? null,
      messagesUsed: detail.messages_used ?? chatUsage?.messages_used ?? 0,
      messageLimit: detail.limit ?? chatUsage?.limit ?? 0,
      spendUsd: detail.spend_usd ?? chatUsage?.spend_usd ?? 0,
      spendCapUsd: detail.cap_usd ?? chatUsage?.spend_cap_usd ?? 0,
    });
    setPlanLimitOpen(true);
  }, [sub?.plan, chatUsage]);

  // Auto-clear voice errors so they don't linger.
  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(() => setVoiceError(null), 3200);
    return () => clearTimeout(t);
  }, [voiceError]);

  // Handle voice errors — detect the minute-cap error and show the modal.
  const handleVoiceError = useCallback((errOrMsg: string | Error) => {
    if (errOrMsg instanceof VoiceLimitError) {
      setVoiceLimitInfo({
        minutesUsed: errOrMsg.minutesUsed,
        limitMinutes: errOrMsg.limitMinutes,
      });
      setVoiceLimitOpen(true);
      return;
    }
    setVoiceError(typeof errOrMsg === "string" ? errOrMsg : errOrMsg.message);
  }, []);

  // ── Side-effects ────────────────────────────────────────────────────────────

  // Post-Stripe: poll until DB reflects paid plan (webhook or /api/subscription/sync).
  // Do NOT complete on is_active_pro — in-app trial users are active before checkout.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlUpgraded = searchParams.get("upgraded") === "1";
    const planParam = searchParams.get("plan");

    if (urlUpgraded) {
      try {
        sessionStorage.setItem(POST_CHECKOUT_SESSION_KEY, "1");
        if (planParam) storeCheckoutIntent(planParam);
      } catch {
        /* ignore */
      }
    }

    let pending = false;
    try {
      pending = sessionStorage.getItem(POST_CHECKOUT_SESSION_KEY) === "1";
    } catch {
      pending = urlUpgraded;
    }

    if (!pending) {
      postCheckoutPollStartedRef.current = false;
      return;
    }

    if (postCheckoutPollStartedRef.current) return;
    postCheckoutPollStartedRef.current = true;

    const expected = planParam || readCheckoutIntent();
    setActivating(true);
    setActivationPlan(planDisplayName(expected));

    if (urlUpgraded) {
      window.history.replaceState({}, "", "/home");
    }

    const runSync = () =>
      api.post<Subscription>("/api/subscription/sync").then(() => refreshSub()).catch(() => {});

    void runSync();

    let attempts = 0;
    postCheckoutPollIntervalRef.current = setInterval(() => {
      if (attempts % 2 === 0) void runSync();
      else refreshSub();
      attempts++;
      if (attempts >= 30) {
        clearCheckoutIntent();
        postCheckoutPollStartedRef.current = false;
        if (postCheckoutPollIntervalRef.current) {
          clearInterval(postCheckoutPollIntervalRef.current);
          postCheckoutPollIntervalRef.current = null;
        }
        setActivating(false);
      }
    }, 1500);

    return () => {
      if (postCheckoutPollIntervalRef.current) {
        clearInterval(postCheckoutPollIntervalRef.current);
        postCheckoutPollIntervalRef.current = null;
      }
      postCheckoutPollStartedRef.current = false;
    };
  }, [searchParams, refreshSub]);

  useEffect(() => {
    if (!activating || !sub) return;
    const expected = readCheckoutIntent();
    if (!isCheckoutComplete(sub, expected)) return;

    clearCheckoutIntent();
    postCheckoutPollStartedRef.current = false;
    if (postCheckoutPollIntervalRef.current) {
      clearInterval(postCheckoutPollIntervalRef.current);
      postCheckoutPollIntervalRef.current = null;
    }
    setActivating(false);
    setActivationPlan(planDisplayName(sub.plan));
    setUpgradeBanner(true);
    const t = setTimeout(() => setUpgradeBanner(false), 8000);
    return () => clearTimeout(t);
  }, [activating, sub]);

  useEffect(() => {
    warmConnection();
    connectChatWs();
    return () => disconnectChatWs();
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    api
      .get<{ open_tasks: { due_date: string }[] }>("/api/dashboard/stats")
      .then((stats) => {
        if (stats?.open_tasks) {
          const count = stats.open_tasks.filter((t) => t.due_date === today).length;
          setTasksDueToday(count);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, thinking, toolLabel]);

  // ── Session management ──────────────────────────────────────────────────────

  const loadSessions = useCallback(() => {
    setSessionsLoading(true);
    api
      .get<ChatSession[]>("/api/chat/sessions")
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  const loadSessionMessages = useCallback((sid: string) => {
    api
      .get<{ role: string; content: string }[]>(
        `/api/chat/history?session_id=${sid}&limit=100`
      )
      .then((history) => {
        if (history?.length) {
          setMessages(
            history
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content || "",
              }))
          );
        } else {
          setMessages([]);
        }
      })
      .catch(() => setMessages([]));
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId("");
    setHistoryOpen(false);
  }, []);

  const handleSelectSession = useCallback(
    (session: ChatSession) => {
      setSessionId(session.id);
      loadSessionMessages(session.id);
      setHistoryOpen(false);
    },
    [loadSessionMessages]
  );

  const handleDeleteSession = useCallback(
    (sid: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      api.delete(`/api/chat/sessions/${sid}`).catch(() => {});
      if (sessionId === sid) {
        setSessionId("");
        setMessages([]);
      }
    },
    [sessionId]
  );

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
    loadSessions();
  }, [loadSessions]);

  // ── AI streaming ────────────────────────────────────────────────────────────

  const runAI = async (text: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreaming(true);
    setThinking(true);
    setToolLabel("");
    let aiText = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      for await (const event of streamChatAuto(text, sessionId, controller.signal)) {
        if (event.type === "session") {
          setSessionId(event.session_id || "");
        } else if (event.type === "token") {
          setThinking(false);
          aiText += event.content || "";
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: aiText };
            return updated;
          });
        } else if (event.type === "tool") {
          const toolName = event.name || "";
          if (shouldShowToolCaption(toolName)) {
            setThinking(false);
            setToolLabel(event.label || toolName.replace(/_/g, " ") || "Working…");
          } else {
            setThinking(true);
            setToolLabel("");
          }
        } else if (event.type === "confirm_required") {
          setThinking(false);
          setToolLabel("");
          setPendingDelete({
            action: event.action || "delete",
            message: event.message || "",
            args: event.args,
          });
        } else if (event.type === "done") {
          const final = event.message || aiText;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: final };
            return updated;
          });
          setToolLabel("");

          // Voice overlay: read the response aloud when enabled (Pro/Premium only)
          if (event.voice_overlay && final) {
            try { await textToSpeech(final); } catch { /* non-fatal */ }
          }

          // Notify every dashboard panel that its data may have changed.
          const tabs = Array.isArray(event.tabs) ? (event.tabs as string[]) : [];
          if (tabs.length > 0) dispatchDataChanged(tabs);
        } else if (event.type === "error") {
          if (event.limit?.code) {
            openPlanLimitModal(event.limit);
            setMessages((prev) => prev.slice(0, -1));
            return;
          }
          const msg = event.message || "";
          if (
            msg.includes("usage limit") ||
            msg.includes("usage allowance") ||
            msg.includes("monthly AI")
          ) {
            openPlanLimitModal({
              code: "usage_limit_reached",
              message: msg,
              plan: sub?.plan,
              upgrade_plan: chatUsage?.upgrade_plan,
              spend_usd: chatUsage?.spend_usd,
              cap_usd: chatUsage?.spend_cap_usd,
            });
            setMessages((prev) => prev.slice(0, -1));
            return;
          }
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: msg || "Something went wrong.",
              isError: true,
            };
            return updated;
          });
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      if (err instanceof PlanLimitError) {
        openPlanLimitModal(err.detail);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Connection failed. Please try again.",
          isError: true,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
      setThinking(false);
      setToolLabel("");
      abortRef.current = null;
      reloadChatUsage();
    }
  };

  const handleSend = (text: string, source: MessageSource = "text") => {
    setPendingDelete(null);
    setMessages((prev) => [...prev, { role: "user", content: text, source }]);
    runAI(text);
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    const argsJson = JSON.stringify(pendingDelete.args || {});
    const text = [
      `Yes, I confirm. Proceed with ${pendingDelete.action} using user_confirmed=true.`,
      `Use these exact arguments: ${argsJson}`,
    ].join(" ");
    setPendingDelete(null);
    setMessages((prev) => [...prev, { role: "user", content: "Yes, confirm delete." }]);
    runAI(text);
  };

  const handleCancelDelete = () => {
    setPendingDelete(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Cancel — do not delete anything." },
    ]);
    runAI("Cancel — do not delete anything.");
  };

  const handleRetry = () => {
    if (streaming) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    setMessages((prev) => prev.slice(0, -1));
    runAI(lastUserMsg.content);
  };

  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const hasMessages = messages.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  // Show clean activation screen during the post-payment webhook window.
  // This guarantees every paid tier (Pro/Premium/Premium+ , trial or direct) lands
  // on the real chat interface instead of the paywall creature.
  if (activating) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-center px-6">
          <div className="mx-auto mb-6 h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          <p className="text-[17px] font-medium text-white/90">Activating your {activationPlan}…</p>
          <p className="mt-2 text-[13px] text-white/55 max-w-[260px] mx-auto">
            You’ll be chatting with Orryon in just a moment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DeleteConfirmModal
        pending={pendingDelete}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* ── Voice limit modal ─────────────────────────────────────────────── */}
      <VoiceLimitModal
        open={voiceLimitOpen}
        onClose={() => setVoiceLimitOpen(false)}
        onContinueText={() => setVoiceLimitOpen(false)}
        onUpgrade={() => {
          setVoiceLimitOpen(false);
          router.push("/upgrade");
        }}
        minutesUsed={voiceLimitInfo?.minutesUsed}
        limitMinutes={voiceLimitInfo?.limitMinutes}
      />

      {/* ── Plan limit → upgrade modal ───────────────────────────────────── */}
      <UpgradeLimitModal
        open={planLimitOpen}
        onClose={() => setPlanLimitOpen(false)}
        onUpgrade={() => {
          setPlanLimitOpen(false);
          router.push("/upgrade");
        }}
        kind={planLimitInfo?.kind ?? "usage"}
        plan={planLimitInfo?.plan ?? sub?.plan ?? "pro"}
        upgradePlan={planLimitInfo?.upgradePlan}
        messagesUsed={planLimitInfo?.messagesUsed ?? 0}
        messageLimit={planLimitInfo?.messageLimit ?? 0}
        spendUsd={planLimitInfo?.spendUsd ?? 0}
        spendCapUsd={planLimitInfo?.spendCapUsd ?? 0}
      />

      {/* ── History sidebar ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {historyOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/55"
              onClick={() => setHistoryOpen(false)}
            />

            {/* Sidebar panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="fixed right-0 top-0 bottom-0 z-50 flex w-[300px] max-w-[82vw] flex-col border-l border-white/[0.07] bg-[#0a0a0a]"
            >
              {/* Sidebar header */}
              <div className="flex items-center justify-between px-5 pb-2 pt-5">
                <p className="text-sm font-semibold text-white/70">Chat History</p>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08]"
                >
                  <X className="h-4 w-4 text-white/45" strokeWidth={1.5} />
                </button>
              </div>

              {/* New chat */}
              <div className="px-4 pb-3">
                <button
                  onClick={handleNewChat}
                  className="flex w-full items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2.5 text-sm text-white/60 transition hover:bg-white/[0.08] hover:text-white/85"
                >
                  <SquarePen className="h-4 w-4" strokeWidth={1.5} />
                  New chat
                </button>
              </div>

              {/* Session list */}
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {sessionsLoading && sessions.length === 0 && (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/50" />
                  </div>
                )}
                {!sessionsLoading && sessions.length === 0 && (
                  <p className="py-10 text-center text-sm text-white/20">
                    No conversations yet.
                  </p>
                )}
                {sessions.map((s) => (
                  <div key={s.id} className="group relative">
                    <button
                      onClick={() => handleSelectSession(s)}
                      className={`mb-0.5 w-full rounded-xl border px-3 py-3 text-left transition ${
                        sessionId === s.id
                          ? "border-white/10 bg-white/[0.08]"
                          : "border-transparent hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <MessageSquare
                          className="mt-0.5 h-4 w-4 shrink-0 text-white/22"
                          strokeWidth={1.5}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] leading-snug text-white/70">
                            {s.preview || s.title || "New chat"}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[0.6rem] text-white/22">
                              {formatSessionDate(s.updated_at)}
                            </span>
                            {s.message_count > 0 && (
                              <span className="text-[0.6rem] text-white/18">
                                {s.message_count} msg{s.message_count !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(s.id);
                      }}
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <Trash2
                        className="h-3 w-3 text-white/28 hover:text-red-400/80"
                        strokeWidth={1.5}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Empty state (no messages) ─────────────────────────────────────── */}
      {!hasMessages ? (
        <div className="flex min-h-full flex-col">
          {/* Top action bar — aligned with chat container */}
          <div className={`${CONTAINER} flex shrink-0 items-center justify-end py-3`}>
            {/* Voice overlay toggle in empty state too */}
            {showSpeakToggle && (
              <button
                onClick={() => updatePrefs({ voice_overlay_enabled: !prefs.voice_overlay_enabled })}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08] ${voiceOverlayOn ? "text-white/70" : "text-white/25"}`}
                  title={voiceOverlayOn ? "Orryon speaks replies" : "Text replies only"}
              >
                {voiceOverlayOn
                  ? <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
                  : <VolumeX className="h-[18px] w-[18px]" strokeWidth={1.5} />}
              </button>
            )}
            <button
              onClick={handleOpenHistory}
              className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08]"
              title="Chat history"
            >
              <Clock className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
            </button>
            <button
              onClick={handleNewChat}
              className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08]"
              title="New chat"
            >
              <SquarePen className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
            </button>
          </div>


          {/* Upgrade success banner */}
          {upgradeBanner && (
            <div className={`${CONTAINER} mb-2`}>
              <div className="rounded-full border border-green-500/20 bg-green-500/10 px-4 py-2.5 text-center text-sm text-green-400 animate-in fade-in">
                {sub?.plan
                  ? `Welcome to ${sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}! Your upgrade is active.`
                  : "Your upgrade is active. Welcome!"}
              </div>
            </div>
          )}

          {/* Flex-1 body: greeting centered, input pinned to bottom */}
          <div className="flex flex-1 flex-col">

            {/* Avatar + greeting — centered in the remaining space */}
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="mb-5">
                <OrryonAliveAvatar
                  size={96}
                  state={orryonAliveState}
                  idlePulse
                  priority
                />
              </div>
              <p className="mb-4 max-w-[260px] text-center text-[15px] leading-tight text-white/50">
                {getGreeting()}{user?.display_name ? `, ${user.display_name}` : ""}.
              </p>
              <ChatStarterPrompts onPick={handleSend} disabled={streaming} />

              {tasksDueToday !== null && tasksDueToday > 0 && (
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-4 py-2.5 text-sm text-white/45 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white/75"
                >
                  <span className="text-white/25" aria-hidden>✦</span>
                  <span>
                    {getGreeting()}. You have {tasksDueToday} task
                    {tasksDueToday !== 1 ? "s" : ""} due today.
                  </span>
                </Link>
              )}

              {sub?.plan === "starter" && (
                <div className={`${CONTAINER} mt-4 w-full`}>
                  <Link
                    href="/breathe"
                    className="w-full flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 mb-2 text-left hover:bg-white/[0.06] active:scale-[0.98] transition-all"
                  >
                    <motion.div
                      className="shrink-0 rounded-full"
                      style={{
                        width: 35, height: 35,
                        background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
                      }}
                      animate={{
                        scale: [1, 1.13, 1],
                        boxShadow: [
                          "0 0 10px rgba(90,163,216,.40), 0 0 4px rgba(90,163,216,.20)",
                          "0 0 26px rgba(90,163,216,.72), 0 0 12px rgba(90,163,216,.36)",
                          "0 0 10px rgba(90,163,216,.40), 0 0 4px rgba(90,163,216,.20)",
                        ],
                      }}
                      transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/70 mb-0.5">Take a breath</p>
                      <p className="text-[0.72rem] text-white/38 leading-snug">Breathe, reset, or just be still</p>
                    </div>
                    <svg className="w-4 h-4 text-white/25 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </Link>
                  <p className="text-center text-[0.62rem] uppercase tracking-[2.5px] text-white/25">
                    Always free · works offline
                  </p>
                </div>
              )}
            </div>

            {/* Input — pinned to bottom */}
            <div
              className="shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-3"
              style={{
                paddingBottom: "max(1.25rem, calc(0.75rem + env(safe-area-inset-bottom)))",
              }}
            >
              <div className={CONTAINER}>
                {voiceError && (
                  <p className="mb-2 text-center text-[12px] text-white/55">{voiceError}</p>
                )}
                {(sub?.plan === "pro" || sub?.plan === "trial") && (
                  <p className="mb-2 text-center text-[11px] leading-snug text-white/40 px-2">
                    {PRO_TEXT_ONLY_HINT}
                  </p>
                )}
                <ChatInput
                  onSend={handleSend}
                  disabled={streaming}
                  enableMic={voiceInputOn}
                  externalStatus={voiceStatus}
                  onVoiceStatusChange={setVoiceStatus}
                  onVoiceError={handleVoiceError}
                />
                <p className="mt-2 text-center text-[10px] leading-snug text-white/25 px-2">
                  {HEALTH_DISCLAIMER_SHORT}
                </p>
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* ── Chat view (has messages) ─────────────────────────────────────── */
        <div className="flex h-full flex-col">
          {/* Upgrade banner */}
          {upgradeBanner && (
            <div className={`${CONTAINER} mt-2`}>
              <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-2.5 text-center text-sm text-green-400 animate-in fade-in">
                {sub?.plan
                  ? `Welcome to ${sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}! Your upgrade is active.`
                  : "Your upgrade is active. Welcome!"}
              </div>
            </div>
          )}

          {/* Chat header bar — border spans full width, buttons align to container */}
          <div className="shrink-0 border-b border-white/[0.06]">
            <div className={`${CONTAINER} flex items-center justify-between gap-2 py-2`}>
              {/* Take a breath — starter tier only */}
              {sub?.plan === "starter" && (
                <Link
                  href="/breathe"
                  className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2 text-left hover:bg-white/[0.06] active:scale-[0.985] transition-all"
                >
                  <div
                    className="shrink-0 rounded-full"
                    style={{
                      width: 28,
                      height: 28,
                      background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/70 leading-none mb-0.5">Take a breath</p>
                    <p className="text-[0.7rem] text-white/40 leading-none">Breathe, reset, or just be still</p>
                  </div>
                </Link>
              )}

              <div className="ml-auto flex items-center gap-1">
              {/* Speak responses — Premium Plus only */}
              {showSpeakToggle && (
                <button
                  onClick={() => updatePrefs({ voice_overlay_enabled: !prefs.voice_overlay_enabled })}
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08] ${voiceOverlayOn ? "text-white/70" : "text-white/25"}`}
                  title={voiceOverlayOn ? "Orryon speaks replies" : "Text replies only"}
                >
                  {voiceOverlayOn
                    ? <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    : <VolumeX className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                </button>
              )}
              <button
                onClick={handleOpenHistory}
                disabled={streaming}
                className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08] disabled:opacity-25"
                title="Chat history"
              >
                <Clock className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
              </button>
              <button
                onClick={handleNewChat}
                disabled={streaming}
                className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08] disabled:opacity-25"
                title="New chat"
              >
                <SquarePen className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
              </button>
              </div>
            </div>
          </div>

          <UsageUpgradeBanner
            usage={chatUsage}
            onUpgrade={() => router.push("/upgrade")}
          />

          {/* Scrollable messages — container width consistent with input */}
          <ScrollArea className="min-h-0 flex-1">
            <div className={`${CONTAINER} py-8`}>
              <ChatThread
                messages={messages}
                streaming={streaming}
                thinking={thinking}
                toolLabel={toolLabel}
                copiedIndex={copiedIndex}
                onCopy={handleCopy}
                onRetry={handleRetry}
                aliveState={orryonAliveState}
              />
              <div ref={bottomRef} className="h-4" />
            </div>
          </ScrollArea>

          {/* Sticky input footer — same max-w as messages */}
          <div
            className="shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-3"
            style={{
              paddingBottom: "max(1.25rem, calc(0.75rem + env(safe-area-inset-bottom)))",
            }}
          >
            <div className={CONTAINER}>
              {voiceError && (
                <p className="mb-2 text-center text-[12px] text-white/55">{voiceError}</p>
              )}
              {(sub?.plan === "pro" || sub?.plan === "trial") && (
                <p className="mb-2 text-center text-[11px] leading-snug text-white/40 px-2">
                  {PRO_TEXT_ONLY_HINT}
                </p>
              )}
              <ChatInput
                onSend={handleSend}
                disabled={streaming}
                enableMic={voiceInputOn}
                externalStatus={voiceStatus}
                onVoiceStatusChange={setVoiceStatus}
                onVoiceError={handleVoiceError}
              />
              <p className="mt-2 text-center text-[10px] leading-snug text-white/25 px-2">
                {HEALTH_DISCLAIMER_SHORT}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
