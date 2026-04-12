"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { streamChat, api } from "@/lib/api";
import { ChatInput } from "@/components/chat-input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

const suggestions = [
  "Add an expense",
  "What's on my schedule?",
  "How are my goals looking?",
  "Show me this week's spending",
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [toolLabel, setToolLabel] = useState("");
  const [tasksDueToday, setTasksDueToday] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    api.get<{ open_tasks: { due_date: string }[] }>("/api/dashboard/stats").then((data) => {
      const count = data.open_tasks.filter((t) => t.due_date === today).length;
      setTasksDueToday(count);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const runAI = async (text: string) => {
    setStreaming(true);
    setToolLabel("");
    let aiText = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      for await (const event of streamChat(text)) {
        if (event.type === "token") {
          aiText += event.content || "";
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: aiText };
            return updated;
          });
        } else if (event.type === "tool") {
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
    } catch {
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
      setToolLabel("");
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

  if (!hasMessages) {
    return (
      <div className="flex flex-col items-center px-4 pt-[12vh] pb-16 min-h-[calc(100vh-93px)]">
        <Image src="/avatar.png" alt="Orryon" width={103} height={103} className="rounded-full object-cover mb-5" />
        <p className="text-white/55 text-sm mb-8 font-[family-name:var(--font-playfair)]">
          Hi{user?.display_name ? `, ${user.display_name}` : ""}. What can I help you with?
        </p>

        {tasksDueToday !== null && tasksDueToday > 0 && (
          <Link
            href="/dashboard"
            className="mb-8 flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition text-sm text-white/50 hover:text-white/80"
          >
            <span className="text-white/30">✦</span>
            <span>{getGreeting()}. You have {tasksDueToday} task{tasksDueToday !== 1 ? "s" : ""} due today.</span>
          </Link>
        )}

        <div className="w-full max-w-xl">
          <ChatInput onSend={handleSend} disabled={streaming} variant="center" />
        </div>

        <div className="flex flex-col items-center gap-2 mt-[50px] max-w-xl w-full">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              className="bg-white/5 border border-white/[0.07] rounded-full px-4 py-2 text-sm text-white/50 hover:text-white/80 hover:bg-white/10 hover:border-white/15 transition-colors w-full text-center"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-93px)]">

      {/* New conversation */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-white/5 shrink-0">
        <button
          onClick={() => setMessages([])}
          disabled={streaming}
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
          New conversation
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
                      {msg.content ? (
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
                      {i === messages.length - 1 && streaming && msg.content && (
                        <span className="text-white/40">▍</span>
                      )}
                    </div>

                    {/* Copy + Retry actions */}
                    <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
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

      <div className="shrink-0 px-4 pb-[50px] pt-2 bg-gradient-to-t from-black via-black/90 to-transparent">
        <ChatInput onSend={handleSend} disabled={streaming} variant="bottom" />
      </div>
    </div>
  );
}
