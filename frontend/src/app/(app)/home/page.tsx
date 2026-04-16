"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, RefreshCw, Clock, X, SquarePen, Trash2, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { streamChatAuto, warmConnection, connectChatWs, disconnectChatWs, api } from "@/lib/api";
import { ChatInput } from "@/components/chat-input";
import { ScrollArea } from "@/components/ui/scroll-area";

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
    api.get<{ open_tasks: { due_date: string }[] }>("/api/dashboard/stats")
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
  }, [messages, streaming, thinking]);

  const loadSessions = useCallback(() => {
    setSessionsLoading(true);
    api.get<ChatSession[]>("/api/chat/sessions")
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  const loadSessionMessages = useCallback((sid: string) => {
    api.get<{ role: string; content: string }[]>(`/api/chat/history?session_id=${sid}&limit=100`)
      .then((history) => {
        if (history?.length) {
          setMessages(
            history
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ role: m.role as "user" | "assistant", content: m.content || "" }))
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

  const handleSelectSession = useCallback((session: ChatSession) => {
    setSessionId(session.id);
    loadSessionMessages(session.id);
    setHistoryOpen(false);
  }, [loadSessionMessages]);

  const handleDeleteSession = useCallback((sid: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sid));
    api.delete(`/api/chat/sessions/${sid}`).catch(() => {});
    if (sessionId === sid) {
      setSessionId("");
      setMessages([]);
    }
  }, [sessionId]);

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
    loadSessions();
  }, [loadSessions]);

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
    } finally {
      setStreaming(false);
      setThinking(false);
      setToolLabel("");
      abortRef.current = null;
    }
  };

  const handleSend = (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    runAI(text);
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

  return (
    <>
      {/* ── History sidebar ── */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setHistoryOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 38 }}
              className="fixed right-0 top-0 bottom-0 w-[320px] max-w-[85vw] bg-[#0a0a0a] border-l border-white/8 z-50 flex flex-col"
            >
              {/* Sidebar header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <p className="text-sm font-semibold text-white/80">Chat History</p>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition"
                >
                  <X className="h-4 w-4 text-white/50" strokeWidth={1.5} />
                </button>
              </div>

              {/* New chat button inside sidebar */}
              <div className="px-4 pb-3">
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/8 transition text-sm text-white/70 hover:text-white"
                >
                  <SquarePen className="h-4 w-4" strokeWidth={1.5} />
                  New chat
                </button>
              </div>

              {/* Session list */}
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {sessionsLoading && sessions.length === 0 && (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                  </div>
                )}

                {!sessionsLoading && sessions.length === 0 && (
                  <p className="text-white/25 text-sm text-center py-10">
                    No conversations yet.
                  </p>
                )}

                {sessions.map((s) => (
                  <div key={s.id} className="group relative">
                    <button
                      onClick={() => handleSelectSession(s)}
                      className={`w-full text-left px-3 py-3 rounded-xl transition mb-0.5 ${
                        sessionId === s.id
                          ? "bg-white/10 border border-white/10"
                          : "hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <MessageSquare className="h-4 w-4 text-white/25 mt-0.5 shrink-0" strokeWidth={1.5} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/75 truncate leading-snug">
                            {s.preview || s.title || "New chat"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[0.6rem] text-white/25">
                              {formatSessionDate(s.updated_at)}
                            </span>
                            {s.message_count > 0 && (
                              <span className="text-[0.6rem] text-white/20">
                                {s.message_count} msg{s.message_count !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 transition"
                    >
                      <Trash2 className="h-3 w-3 text-white/30 hover:text-red-400" strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Empty state (no messages) ── */}
      {!hasMessages ? (
        <div className="flex flex-col items-center px-4 min-h-[calc(100vh-93px)]">
          {/* Top bar with icons */}
          <div className="w-full flex items-center justify-end py-2 shrink-0">
            <button
              onClick={handleOpenHistory}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition"
              title="Chat history"
            >
              <Clock className="h-[18px] w-[18px] text-white/50" strokeWidth={1.5} />
            </button>
            <button
              onClick={handleNewChat}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition"
              title="New chat"
            >
              <SquarePen className="h-[18px] w-[18px] text-white/50" strokeWidth={1.5} />
            </button>
          </div>

          {upgradeBanner && (
            <div className="mb-6 px-4 py-2.5 rounded-full border border-green-500/20 bg-green-500/10 text-green-400 text-sm animate-in fade-in">
              Welcome to Pro! Your upgrade is active.
            </div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center">
          <motion.div
            className="mb-6"
            animate={{ y: [0, -6, 0], scale: [1, 1.025, 1] }}
            transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
          >
            <Image src="/avatar.png" alt="Orryon" width={103} height={103} className="rounded-full object-cover ring-1 ring-white/10" />
          </motion.div>
          <p className="text-white/60 text-[15px] mb-4 max-w-[260px] text-center leading-tight">
            Hello{user?.display_name ? `, ${user.display_name}` : ""}.
          </p>

          {tasksDueToday !== null && tasksDueToday > 0 && (
            <Link
              href="/dashboard"
              className="mb-6 flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition text-sm text-white/50 hover:text-white/80"
            >
              <span className="text-white/30">✦</span>
              <span>{getGreeting()}. You have {tasksDueToday} task{tasksDueToday !== 1 ? "s" : ""} due today.</span>
            </Link>
          )}

          <div className="w-full max-w-xl mt-[100px]">
            <ChatInput onSend={handleSend} disabled={streaming} variant="center" />
          </div>
          </div>
        </div>
      ) : (
        /* ── Chat view (has messages) ── */
        <div className="flex flex-col h-[calc(100vh-93px)]">
          {upgradeBanner && (
            <div className="mx-4 mt-2 px-4 py-2.5 rounded-xl border border-green-500/20 bg-green-500/10 text-green-400 text-sm text-center animate-in fade-in">
              Welcome to Pro! Your upgrade is active.
            </div>
          )}

          {/* Chat header bar */}
          <div className="flex items-center justify-end px-4 py-2 border-b border-white/5 shrink-0 gap-1">
            <button
              onClick={handleOpenHistory}
              disabled={streaming}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition disabled:opacity-30"
              title="Chat history"
            >
              <Clock className="h-[18px] w-[18px] text-white/50" strokeWidth={1.5} />
            </button>
            <button
              onClick={handleNewChat}
              disabled={streaming}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition disabled:opacity-30"
              title="New chat"
            >
              <SquarePen className="h-[18px] w-[18px] text-white/50" strokeWidth={1.5} />
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="max-w-xl mx-auto px-4 py-6">
              {messages.map((msg, i) => (
                <div key={i} className={`mb-3 ${msg.role === "user" ? "flex justify-end" : ""}`}>
                  {msg.role === "user" ? (
                    <div className="bg-white/10 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[80%] text-white">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[90%] flex items-start gap-2 group">
                      <Image src="/avatar.png" alt="Orryon" width={24} height={24} className="rounded-full object-cover mt-1 shrink-0" />
                      <div className="flex-1">
                        {i === messages.length - 1 && toolLabel && (
                          <p className="text-xs text-white/30 mb-1">✦ {toolLabel}…</p>
                        )}
                        <div className={`border rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed ${
                          msg.isError
                            ? "bg-[#111] border-red-500/20 text-red-400/80"
                            : "bg-[#111] border-white/5 text-gray-200"
                        }`}>
                          {i === messages.length - 1 && thinking && !msg.content ? (
                            <div className="flex items-center gap-1.5 py-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[pulse_1s_ease-in-out_infinite]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[pulse_1s_ease-in-out_0.2s_infinite]" />
                              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[pulse_1s_ease-in-out_0.4s_infinite]" />
                            </div>
                          ) : msg.content ? (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                                li: ({ children }) => <li className="text-sm">{children}</li>,
                                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                                code: ({ children }) => <code className="bg-white/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          ) : (
                            i === messages.length - 1 && streaming && (
                              <span className="inline-block w-2 h-4 bg-white/40 animate-pulse ml-0.5" />
                            )
                          )}
                          {i === messages.length - 1 && streaming && !thinking && msg.content && (
                            <span className="text-white/40">▍</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          {!streaming && msg.content && (
                            <button
                              onClick={() => handleCopy(msg.content, i)}
                              className="flex items-center gap-1 text-[0.65rem] text-white/30 hover:text-white/60 transition-colors"
                            >
                              {copiedIndex === i
                                ? <><Check className="h-3 w-3" strokeWidth={1.5} />Copied</>
                                : <><Copy className="h-3 w-3" strokeWidth={1.5} />Copy</>
                              }
                            </button>
                          )}
                          {msg.isError && !streaming && (
                            <button
                              onClick={handleRetry}
                              className="flex items-center gap-1 text-[0.65rem] text-white/30 hover:text-white/60 transition-colors"
                            >
                              <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
                              Retry
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="shrink-0 px-4 pt-2 bg-gradient-to-t from-black via-black/90 to-transparent" style={{ paddingBottom: 'max(50px, calc(20px + env(safe-area-inset-bottom)))' }}>
            <ChatInput onSend={handleSend} disabled={streaming} variant="bottom" />
          </div>
        </div>
      )}
    </>
  );
}
