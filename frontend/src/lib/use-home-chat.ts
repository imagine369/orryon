"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageSource } from "@/components/chat-input";
import { api, PlanLimitError, type PlanLimitDetail } from "@/lib/api";
import { streamChatMessage } from "@/lib/chat-transport";
import { useDestructiveConfirm } from "@/lib/use-destructive-confirm";
import { textToSpeech } from "@/lib/voice";
import { dispatchDataChanged } from "@/lib/use-data-refresh";
import { shouldShowToolCaption } from "@/lib/chat-tool-ui";
import { extractFulfillmentHandoffs } from "@/lib/extract-fulfillment-handoffs";
import type { ChatMessage, ChatSession } from "@/lib/chat-types";
import {
  chatHistoryPath,
  chatSessionDeletePath,
  chatSessionsListPath,
} from "@/lib/chat-session-api";

interface UseHomeChatOptions {
  sessionId: string;
  setSessionId: (id: string) => void;
  plan: string | undefined;
  chatUsage: {
    upgrade_plan?: string | null;
    spend_usd?: number;
    spend_cap_usd?: number;
  } | null;
  reloadChatUsage: () => void;
  openPlanLimitModal: (detail: PlanLimitDetail) => void;
}

export function useHomeChat({
  sessionId,
  setSessionId,
  plan,
  chatUsage,
  reloadChatUsage,
  openPlanLimitModal,
}: UseHomeChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [toolLabel, setToolLabel] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, thinking, toolLabel]);

  const runAIRef = useRef<(text: string) => void>(() => {});

  const destructive = useDestructiveConfirm(
    (text) => runAIRef.current(text),
    (text) => setMessages((prev) => [...prev, { role: "user", content: text }]),
  );

  const runAI = useCallback(
    async (text: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStreaming(true);
      setThinking(true);
      setToolLabel("");
      let aiText = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        for await (const event of streamChatMessage(text, sessionId, controller.signal)) {
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
            destructive.setPendingDelete({
              action: event.action || "delete",
              message: event.message || "",
              args: event.args,
            });
          } else if (event.type === "done") {
            const final = event.message || aiText;
            const handoffs = extractFulfillmentHandoffs(event.actions);
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: final,
                ...(handoffs.length > 0 ? { fulfillmentHandoffs: handoffs } : {}),
              };
              return updated;
            });
            setToolLabel("");

            if (event.voice_overlay && final) {
              try {
                await textToSpeech(final);
              } catch {
                /* non-fatal */
              }
            }

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
                plan,
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
    },
    [sessionId, setSessionId, plan, chatUsage, openPlanLimitModal, reloadChatUsage, destructive.setPendingDelete],
  );

  useEffect(() => {
    runAIRef.current = runAI;
  }, [runAI]);

  const handleSend = useCallback(
    (text: string, source: MessageSource = "text") => {
      destructive.clearPending();
      setMessages((prev) => [...prev, { role: "user", content: text, source }]);
      runAI(text);
    },
    [runAI],
  );

  const handleRetry = useCallback(() => {
    if (streaming) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    setMessages((prev) => prev.slice(0, -1));
    runAI(lastUserMsg.content);
  }, [streaming, messages, runAI]);

  const handleCopy = useCallback((content: string, index: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const replaceMessages = useCallback((msgs: ChatMessage[]) => setMessages(msgs), []);

  return {
    messages,
    streaming,
    thinking,
    toolLabel,
    copiedIndex,
    pendingDelete: destructive.pendingDelete,
    bottomRef,
    handleSend,
    handleConfirmDelete: destructive.handleConfirmDelete,
    handleCancelDelete: destructive.handleCancelDelete,
    handleRetry,
    handleCopy,
    clearMessages,
    replaceMessages,
  };
}

export function useChatSessions(
  sessionId: string,
  setSessionId: (id: string) => void,
  onClearMessages: () => void,
  replaceMessages: (msgs: ChatMessage[]) => void,
) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const loadSessions = useCallback(() => {
    setSessionsLoading(true);
    api
      .get<ChatSession[]>(chatSessionsListPath())
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  const loadSessionMessages = useCallback(
    (sid: string, setMessages: (msgs: ChatMessage[]) => void) => {
      api
        .get<{ role: string; content: string }[]>(chatHistoryPath(sid))
        .then((history) => {
          if (history?.length) {
            setMessages(
              history
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => ({
                  role: m.role as "user" | "assistant",
                  content: m.content || "",
                })),
            );
          } else {
            setMessages([]);
          }
        })
        .catch(() => setMessages([]));
    },
    [],
  );

  const handleNewChat = useCallback(() => {
    onClearMessages();
    setSessionId("");
    setHistoryOpen(false);
  }, [onClearMessages, setSessionId]);

  const handleSelectSession = useCallback(
    (session: ChatSession) => {
      setSessionId(session.id);
      loadSessionMessages(session.id, replaceMessages);
      setHistoryOpen(false);
    },
    [loadSessionMessages, setSessionId, replaceMessages],
  );

  const handleDeleteSession = useCallback(
    (sid: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      api.delete(chatSessionDeletePath(sid)).catch(() => {});
      if (sessionId === sid) {
        setSessionId("");
        onClearMessages();
      }
    },
    [sessionId, setSessionId, onClearMessages],
  );

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
    loadSessions();
  }, [loadSessions]);

  return {
    historyOpen,
    setHistoryOpen,
    sessions,
    sessionsLoading,
    handleNewChat,
    handleSelectSession,
    handleDeleteSession,
    handleOpenHistory,
  };
}
