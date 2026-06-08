"use client";

import { motion } from "framer-motion";
import { X, SquarePen, Trash2, MessageSquare } from "lucide-react";
import { formatSessionDate } from "@/lib/chat-helpers";
import type { ChatSession } from "@/lib/chat-types";

interface ChatSessionSidebarProps {
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  sessionsLoading: boolean;
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function ChatSessionSidebar({
  open,
  onClose,
  sessions,
  sessionsLoading,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
}: ChatSessionSidebarProps) {
  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40 bg-black/55"
        onClick={onClose}
      />

      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="fixed right-0 top-0 bottom-0 z-50 flex w-[300px] max-w-[82vw] flex-col border-l border-white/[0.07] bg-[#0a0a0a]"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <p className="text-sm font-semibold text-white/70">Chat History</p>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/[0.08]"
          >
            <X className="h-4 w-4 text-white/45" strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-4 pb-3">
          <button
            onClick={onNewChat}
            className="flex w-full items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2.5 text-sm text-white/60 transition hover:bg-white/[0.08] hover:text-white/85"
          >
            <SquarePen className="h-4 w-4" strokeWidth={1.5} />
            New chat
          </button>
        </div>

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
                onClick={() => onSelectSession(s)}
                className={`mb-0.5 w-full rounded-xl border px-3 py-3 text-left transition ${
                  activeSessionId === s.id
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
                  onDeleteSession(s.id);
                }}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition hover:bg-white/[0.08] group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100"
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
  );
}
