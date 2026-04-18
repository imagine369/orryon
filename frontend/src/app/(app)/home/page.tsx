"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { Clock, X, SquarePen, Trash2, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { streamChatAuto, warmConnection, connectChatWs, disconnectChatWs, api } from "@/lib/api";
import { ChatInput, type VoiceStatus } from "@/components/chat-input";
import { ChatThread } from "@/components/chat-thread";
import { ScrollArea } from "@/components/ui/scroll-area";
import { textToSpeech } from "@/lib/voice";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
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
// Voice Mode toggle — compact pill switch that matches existing header buttons.
// Stays visually quiet when OFF; lights up subtly when ON.
// ─────────────────────────────────────────────────────────────────────────────

function VoiceModeToggle({
  enabled,
  onToggle,
  disabled,
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      role="switch"
      aria-checked={enabled}
      title={enabled ? "Voice Mode on — tap mic to talk" : "Enable Voice Chat"}
      className={`group flex h-9 items-center gap-2 rounded-full border px-2.5 pr-3 text-[12px] font-medium transition disabled:opacity-25 ${
        enabled
          ? "border-white/20 bg-white/[0.08] text-white/85 hover:bg-white/[0.12]"
          : "border-white/[0.08] text-white/45 hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-white/70"
      }`}
    >
      <span
        className={`relative inline-block h-[14px] w-[26px] shrink-0 rounded-full transition-colors duration-150 ${
          enabled ? "bg-white/85" : "bg-white/15"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-black transition-all duration-150 ${
            enabled ? "left-[14px]" : "left-[2px] bg-white/55"
          }`}
        />
      </span>
      <span className="hidden sm:inline">Voice Mode</span>
      <span className="inline sm:hidden">Voice</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [toolLabel, setToolLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [tasksDueToday, setTasksDueToday] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [upgradeBanner, setUpgradeBanner] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [sessionId, setSessionId] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // ── Voice Mode ──────────────────────────────────────────────────────────────
  // Persisted across reloads so the user's preference sticks. Default OFF so
  // nothing about the text-only experience changes until they opt in.
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      setVoiceMode(localStorage.getItem("orryon_voice_mode") === "1");
    } catch {
      // no-op (private mode / disabled storage)
    }
  }, []);

  const stopAudioPlayback = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.src = "";
      } catch {
        /* ignore */
      }
    }
    audioRef.current = null;
  }, []);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("orryon_voice_mode", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (!next) {
        stopAudioPlayback();
        setVoiceStatus("idle");
      }
      return next;
    });
  }, [stopAudioPlayback]);

  useEffect(() => {
    // Cleanup on unmount — don't leave audio playing after navigation.
    return () => stopAudioPlayback();
  }, [stopAudioPlayback]);

  // Auto-clear voice errors so they don't linger.
  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(() => setVoiceError(null), 3200);
    return () => clearTimeout(t);
  }, [voiceError]);

  // ── Side-effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      setUpgradeBanner(true);
      const t = setTimeout(() => setUpgradeBanner(false), 5000);
      window.history.replaceState({}, "", "/home");
      return () => clearTimeout(t);
    }
  }, [searchParams]);

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

  // Strip markdown so TTS doesn't read "asterisk" / "pound" / URL junk aloud.
  const stripMarkdownForSpeech = (md: string): string => {
    return md
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_~]+/g, " ")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const playAssistantReply = useCallback(
    async (reply: string) => {
      if (!reply) return;
      const spoken = stripMarkdownForSpeech(reply);
      if (!spoken) return;

      stopAudioPlayback();
      const controller = new AbortController();
      ttsAbortRef.current = controller;

      setVoiceStatus("speaking");
      try {
        const blob = await textToSpeech(spoken, "eve");
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (audioRef.current === audio) audioRef.current = null;
          setVoiceStatus("idle");
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (audioRef.current === audio) audioRef.current = null;
          setVoiceStatus("idle");
          setVoiceError("Couldn't play the response.");
        };
        await audio.play();
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setVoiceStatus("idle");
        setVoiceError(err instanceof Error ? err.message : "Voice playback failed.");
      }
    },
    [stopAudioPlayback]
  );

  const runAI = async (text: string, speakReply: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Any audio currently playing is interrupted by the new turn.
    stopAudioPlayback();
    if (speakReply) setVoiceStatus("thinking");

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
          setThinking(false);
          setToolLabel(event.label || event.name || "Working…");
        } else if (event.type === "done") {
          const final = event.message || aiText;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: final };
            return updated;
          });
          setToolLabel("");
          if (speakReply) void playAssistantReply(final);
        } else if (event.type === "error") {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: event.message || "Something went wrong.",
              isError: true,
            };
            return updated;
          });
          if (speakReply) setVoiceStatus("idle");
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Connection failed. Please try again.",
          isError: true,
        };
        return updated;
      });
      if (speakReply) setVoiceStatus("idle");
    } finally {
      setStreaming(false);
      setThinking(false);
      setToolLabel("");
      abortRef.current = null;
    }
  };

  const handleSend = (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    runAI(text, voiceMode);
  };

  const handleRetry = () => {
    if (streaming) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    setMessages((prev) => prev.slice(0, -1));
    runAI(lastUserMsg.content, voiceMode);
  };

  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const hasMessages = messages.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
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
                  className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/[0.08]"
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
                      className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition hover:bg-white/[0.08] group-hover:opacity-100"
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
          <div className={`${CONTAINER} flex shrink-0 items-center justify-end gap-1 py-3`}>
            <VoiceModeToggle enabled={voiceMode} onToggle={toggleVoiceMode} />
            <button
              onClick={handleOpenHistory}
              className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/[0.08]"
              title="Chat history"
            >
              <Clock className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
            </button>
            <button
              onClick={handleNewChat}
              className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/[0.08]"
              title="New chat"
            >
              <SquarePen className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
            </button>
          </div>

          {/* Upgrade success banner */}
          {upgradeBanner && (
            <div className={`${CONTAINER} mb-2`}>
              <div className="rounded-full border border-green-500/20 bg-green-500/10 px-4 py-2.5 text-center text-sm text-green-400 animate-in fade-in">
                Welcome to Pro! Your upgrade is active.
              </div>
            </div>
          )}

          {/* Flex-1 body: greeting centered, input pinned to bottom */}
          <div className="flex flex-1 flex-col">

            {/* Avatar + greeting — centered in the remaining space */}
            <div className="flex flex-1 flex-col items-center justify-center">
              <motion.div
                className="mb-5"
                animate={{ y: [0, -6, 0], scale: [1, 1.025, 1] }}
                transition={{
                  duration: 3.8,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "loop",
                }}
              >
                <Image
                  src="/avatar.png"
                  alt="Orryon"
                  width={96}
                  height={96}
                  className="rounded-full object-cover ring-1 ring-white/[0.09]"
                />
              </motion.div>

              <p className="mb-5 max-w-[220px] text-center text-[15px] leading-tight text-white/50">
                {getGreeting()}{user?.display_name ? `, ${user.display_name}` : ""}.
              </p>

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
            </div>

            {/* Input — pinned to bottom, identical structure to chat view footer */}
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
                <ChatInput
                  onSend={handleSend}
                  disabled={streaming}
                  voiceMode={voiceMode}
                  externalStatus={voiceMode ? voiceStatus : "idle"}
                  onVoiceStatusChange={setVoiceStatus}
                  onVoiceError={setVoiceError}
                />
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
                Welcome to Pro! Your upgrade is active.
              </div>
            </div>
          )}

          {/* Chat header bar — border spans full width, buttons align to container */}
          <div className="shrink-0 border-b border-white/[0.06]">
            <div className={`${CONTAINER} flex items-center justify-end gap-1 py-2`}>
              <VoiceModeToggle
                enabled={voiceMode}
                onToggle={toggleVoiceMode}
                disabled={streaming}
              />
              <button
                onClick={handleOpenHistory}
                disabled={streaming}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/[0.08] disabled:opacity-25"
                title="Chat history"
              >
                <Clock className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
              </button>
              <button
                onClick={handleNewChat}
                disabled={streaming}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/[0.08] disabled:opacity-25"
                title="New chat"
              >
                <SquarePen className="h-[18px] w-[18px] text-white/40" strokeWidth={1.5} />
              </button>
            </div>
          </div>

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
              <ChatInput
                onSend={handleSend}
                disabled={streaming}
                voiceMode={voiceMode}
                externalStatus={voiceMode ? voiceStatus : "idle"}
                onVoiceStatusChange={setVoiceStatus}
                onVoiceError={setVoiceError}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
