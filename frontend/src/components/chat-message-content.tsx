"use client";

import { useMemo } from "react";
import { ChatContactCard } from "@/components/chat-contact-card";
import { ChatMarkdown } from "@/components/chat-markdown";
import { parseChatContactBlocks } from "@/lib/chat-contact-blocks";

interface ChatMessageContentProps {
  content: string;
}

export function ChatMessageContent({ content }: ChatMessageContentProps) {
  const segments = useMemo(() => parseChatContactBlocks(content), [content]);

  if (segments.length === 1 && segments[0].type === "markdown") {
    return <ChatMarkdown content={segments[0].content} />;
  }

  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "contact-card" ? (
          <ChatContactCard key={`card-${index}`} block={segment} />
        ) : (
          <ChatMarkdown key={`md-${index}`} content={segment.content} />
        ),
      )}
    </>
  );
}
