"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, RefreshCw } from "lucide-react";
import {
  CHAT_USER_BUBBLE_CLASS,
  ThinkingIndicator,
  assistantBubbleClass,
} from "@/components/chat-bubble-primitives";

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
}

function StreamingPlaceholder({ hasToolCaption }: { hasToolCaption: boolean }) {
  return (
    <div
      className="flex min-h-[3.25rem] flex-col justify-center gap-2"
      aria-live="polite"
      aria-busy="true"
    >
      {!hasToolCaption && (
        <p className="text-[13px] text-white/40">Writing…</p>
      )}
      <div className={`flex items-center gap-1.5 py-0.5 ${hasToolCaption ? "pt-1" : ""}`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="chat-thinking-dot inline-block h-1.5 w-1.5 rounded-full bg-white/35"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
    </div>
  );
}

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-2 list-inside list-disc space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-2 list-inside list-decimal space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-sm">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  ),
};

export function ChatThread({
  messages,
  streaming,
  thinking,
  toolLabel,
  copiedIndex,
  onCopy,
  onRetry,
}: ChatThreadProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      {messages.map((msg, i) => {
        const isLast = i === messages.length - 1;
        const isUser = msg.role === "user";

        if (isUser) {
          return (
            <div key={i} className="flex w-full justify-end">
              <div className={CHAT_USER_BUBBLE_CLASS}>{msg.content}</div>
            </div>
          );
        }

        const showThinking = isLast && thinking && !msg.content;
        const showStreamingEmpty =
          isLast && streaming && !thinking && !msg.content;

        return (
          <div key={i} className="group flex w-full min-w-0 gap-3">
            <Image
              src="/avatar.png"
              alt="Orryon"
              width={28}
              height={28}
              className="mt-0.5 size-7 shrink-0 rounded-full object-cover ring-1 ring-white/10"
            />
            <div className="flex min-w-0 flex-1 flex-col items-stretch">
              {isLast && toolLabel && !showThinking && (
                <p className="mb-1.5 text-xs text-white/35">
                  <span className="text-white/25">✦</span> {toolLabel}…
                </p>
              )}
              <div className={assistantBubbleClass(!!msg.isError)}>
                {showThinking ? (
                  <ThinkingIndicator />
                ) : msg.content ? (
                  <>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {msg.content}
                    </ReactMarkdown>
                    {isLast && streaming && !thinking && (
                      <span className="ml-0.5 inline-block align-baseline text-white/45">
                        ▍
                      </span>
                    )}
                  </>
                ) : showStreamingEmpty ? (
                  <StreamingPlaceholder hasToolCaption={!!toolLabel} />
                ) : (
                  <span className="inline-block min-h-[1.25rem] w-2 animate-pulse bg-white/35" />
                )}
              </div>

              <div className="mt-1.5 flex items-center gap-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                {!streaming && msg.content && (
                  <button
                    type="button"
                    onClick={() => onCopy(msg.content, i)}
                    className="flex items-center gap-1 text-[0.65rem] text-white/30 transition-colors hover:text-white/60"
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
                    className="flex items-center gap-1 text-[0.65rem] text-white/30 transition-colors hover:text-white/60"
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
