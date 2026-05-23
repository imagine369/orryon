"use client";

import { useState, useEffect, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, RefreshCw } from "lucide-react";
import {
  CHAT_USER_BUBBLE_CLASS,
  ThinkingIndicator,
  assistantBubbleClass,
} from "@/components/chat-bubble-primitives";
import { OrryonAliveAvatar } from "@/components/orryon-alive-avatar";
import { OrryonAvatar } from "@/components/orryon-avatar";
import type { OrryonAliveState } from "@/lib/orryon-alive-state";

/** Chat reply portrait — was 28px; object-cover fills the circle (PNG has side margins). */
const CHAT_AVATAR_SIZE = 40;

export interface ChatThreadMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

interface ChatThreadProps {
  messages: ChatThreadMessage[];
  streaming: boolean;
  thinking: boolean;
  toolLabel: string;
  copiedIndex: number | null;
  onCopy: (content: string, index: number) => void;
  onRetry: () => void;
  /** Glow / breathe on the latest assistant avatar while Orryon is active. */
  aliveState?: OrryonAliveState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic streaming indicator
// ─────────────────────────────────────────────────────────────────────────────

// Budgeting-specific phrases that rotate while the AI composes its response.
// They give the impression the assistant is actively working on something
// meaningful rather than just stalling.
const BUDGET_PHRASES = [
  "Analyzing your expenses",
  "Building budget breakdown",
  "Calculating recommendations",
  "Reviewing financial data",
  "Preparing insights",
  "Running the numbers",
  "Checking your budget",
  "Processing transactions",
  "Evaluating savings options",
  "Mapping your cash flow",
];

/** Shimmer while a specific tool is running (e.g. web search) — no finance copy. */
function ToolWorkingIndicator() {
  return (
    <div
      className="flex flex-col gap-2.5 py-0.5"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2" aria-hidden>
        <span className="inline-flex shrink-0 items-center gap-[5px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="chat-thinking-dot inline-block h-[5px] w-[5px] rounded-full bg-white/30"
              style={{ animationDelay: `${i * 0.14}s` }}
            />
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-[7px]" aria-hidden>
        <div className="h-[3px] w-[160px] overflow-hidden rounded-full bg-white/[0.06]">
          <div className="chat-thinking-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
        <div className="h-[3px] w-[100px] overflow-hidden rounded-full bg-white/[0.04]">
          <div
            className="chat-thinking-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
            style={{ animationDelay: "0.45s" }}
          />
        </div>
      </div>
    </div>
  );
}

function StreamingBudgetIndicator() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out → swap phrase → fade in
      setVisible(false);
      const swap = setTimeout(() => {
        setIdx((i) => (i + 1) % BUDGET_PHRASES.length);
        setVisible(true);
      }, 280);
      return () => clearTimeout(swap);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="flex flex-col justify-center gap-2.5 py-0.5"
      aria-live="polite"
      aria-busy="true"
      aria-label={BUDGET_PHRASES[idx]}
    >
      {/* Rotating label + dots */}
      <div className="flex items-center gap-2">
        <span
          className="text-[13px] font-medium tracking-wide text-white/45 transition-opacity duration-[280ms]"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {BUDGET_PHRASES[idx]}
        </span>
        <span className="inline-flex shrink-0 items-center gap-[5px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="chat-thinking-dot inline-block h-[5px] w-[5px] rounded-full bg-white/30"
              style={{ animationDelay: `${i * 0.14}s` }}
            />
          ))}
        </span>
      </div>

      {/* Shimmer skeleton lines — suggests content is being constructed */}
      <div className="flex flex-col gap-[7px]" aria-hidden>
        <div className="h-[3px] w-[160px] overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="chat-thinking-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
        </div>
        <div className="h-[3px] w-[100px] overflow-hidden rounded-full bg-white/[0.04]">
          <div
            className="chat-thinking-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
            style={{ animationDelay: "0.45s" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown components
// ─────────────────────────────────────────────────────────────────────────────

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 list-outside list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 list-outside list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-white/95">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic text-white/75">{children}</em>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-md bg-white/[0.08] px-[0.4em] py-[0.2em] font-mono text-[0.87em] text-white/78">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="my-3 overflow-x-auto rounded-xl border border-white/[0.07] bg-[#0e0e0e] px-4 py-3.5 font-mono text-[0.85em] text-white/70">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-2 border-l-[2px] border-white/18 pl-4 italic text-white/50">
      {children}
    </blockquote>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-2 mt-4 text-lg font-semibold text-white/95 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-2 mt-3 text-base font-semibold text-white/92 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-1.5 mt-3 text-[15px] font-semibold text-white/88 first:mt-0">{children}</h3>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// ChatThread
// ─────────────────────────────────────────────────────────────────────────────

export function ChatThread({
  messages,
  streaming,
  thinking,
  toolLabel,
  copiedIndex,
  onCopy,
  onRetry,
  aliveState = "idle",
}: ChatThreadProps) {
  const lastAssistantIndex = messages.reduce(
    (acc, msg, i) => (msg.role === "assistant" ? i : acc),
    -1,
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {messages.map((msg, i) => {
        const isLast = i === messages.length - 1;
        const isUser = msg.role === "user";

        // ── User message ────────────────────────────────────────────────────
        if (isUser) {
          return (
            <div key={i} className="flex w-full justify-end">
              <div className={CHAT_USER_BUBBLE_CLASS}>{msg.content}</div>
            </div>
          );
        }

        // ── Assistant message ───────────────────────────────────────────────
        const showThinking = isLast && thinking && !msg.content;
        const showToolWorking =
          isLast && streaming && !thinking && !msg.content && !!toolLabel;
        // Finance-themed rotator only when idle-waiting, not during an active tool label
        const showStreamingEmpty =
          isLast && streaming && !thinking && !msg.content && !toolLabel;

        return (
          <div key={i} className="group flex w-full min-w-0 items-start gap-3.5">
            {i === lastAssistantIndex ? (
              <OrryonAliveAvatar
                size={CHAT_AVATAR_SIZE}
                state={aliveState}
                idlePulse
                className="mt-0.5"
              />
            ) : (
              <OrryonAvatar size={CHAT_AVATAR_SIZE} className="mt-0.5 ring-1 ring-white/[0.08]" />
            )}

            {/* Content column */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Tool-use caption */}
              {isLast && toolLabel && !showThinking && (
                <p className="mb-2 flex items-center gap-1.5 text-[12px] text-white/28">
                  <span aria-hidden>✦</span>
                  {toolLabel}…
                </p>
              )}

              {/* Bubble — always rendered with min-h to prevent layout jumps */}
              <div className={assistantBubbleClass(!!msg.isError)}>
                {showThinking ? (
                  <ThinkingIndicator />
                ) : showToolWorking ? (
                  <ToolWorkingIndicator />
                ) : showStreamingEmpty ? (
                  <StreamingBudgetIndicator />
                ) : msg.content ? (
                  <>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {msg.content}
                    </ReactMarkdown>
                    {/* Live streaming cursor appended to the last token */}
                    {isLast && streaming && !thinking && (
                      <span
                        className="ml-0.5 inline-block align-baseline text-white/38"
                        aria-hidden
                      >
                        ▍
                      </span>
                    )}
                  </>
                ) : (
                  // Fallback pulse bar (edge case — should rarely appear)
                  <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-white/22" />
                )}
              </div>

              {/* Action row — copy / retry (visible on hover) */}
              <div className="mt-2 flex items-center gap-3.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100">
                {!streaming && msg.content && (
                  <button
                    type="button"
                    onClick={() => onCopy(msg.content, i)}
                    className="flex items-center gap-1 text-[11px] text-white/22 transition-colors hover:text-white/55"
                  >
                    {copiedIndex === i ? (
                      <>
                        <Check className="h-3 w-3" strokeWidth={1.5} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" strokeWidth={1.5} />
                        Copy
                      </>
                    )}
                  </button>
                )}
                {msg.isError && !streaming && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="flex items-center gap-1 text-[11px] text-white/22 transition-colors hover:text-white/55"
                  >
                    <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
