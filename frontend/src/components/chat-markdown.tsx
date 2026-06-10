"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CHAT_LINK_CLASS, sanitizeChatHref, transformChatUrl } from "@/lib/chat-message-links";
import { remarkChatAutolink } from "@/lib/remark-chat-autolink";

const markdownComponents: Components = {
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
  a: ({ href, children }) => {
    const safeHref = href ? sanitizeChatHref(href) : null;
    if (!safeHref) return <span>{children}</span>;

    const external = /^https?:\/\//i.test(safeHref);

    return (
      <a
        href={safeHref}
        className={CHAT_LINK_CLASS}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
};

interface ChatMarkdownProps {
  content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkChatAutolink]}
      urlTransform={transformChatUrl}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
