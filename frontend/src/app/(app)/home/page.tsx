"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { streamChat, type ChatEvent, api } from "@/lib/api";
import { ChatInput } from "@/components/chat-input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  role: "user" | "assistant";
  content: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    api.get<{ open_tasks: { due_date: string }[] }>("/api/dashboard/stats").then((data) => {
      const count = data.open_tasks.filter((t) => t.due_date === today).length;
      setTasksDueToday(count);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const handleSend = async (text: string) => {
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
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
            updated[updated.length - 1] = { role: "assistant", content: event.message || "Something went wrong." };
            return updated;
          });
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Connection failed. Please try again." };
        return updated;
      });
    } finally {
      setStreaming(false);
      setToolLabel("");
    }
  };

  const hasMessages = messages.length > 0;

  if (!hasMessages) {
    return (
      <div className="flex flex-col items-center px-4 pt-[12vh] pb-16 min-h-[calc(100vh-53px)]">
        <Image src="/avatar.png" alt="orryon" width={82} height={82} className="rounded-full object-cover mb-4" />
        <h1 className="text-4xl font-extrabold tracking-widest uppercase text-white mb-1 font-[family-name:var(--font-playfair)]">orryon</h1>
        <p className="text-white/30 text-sm mb-8 font-[family-name:var(--font-playfair)]">
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
            <div
              key={s}
              className="bg-white/5 border border-white/[0.07] rounded-full px-4 py-2 text-sm text-white/50"
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-53px)]">
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="max-w-xl mx-auto px-4 py-6">
          {messages.map((msg, i) => (
            <div key={i} className={`mb-3 ${msg.role === "user" ? "flex justify-end" : ""}`}>
              {msg.role === "user" ? (
                <div className="bg-white/10 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[80%] text-white">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[90%] flex items-start gap-2">
                  <Image src="/avatar.png" alt="orryon" width={24} height={24} className="rounded-full object-cover mt-1 shrink-0" />
                  <div className="flex-1">
                  {i === messages.length - 1 && toolLabel && (
                    <p className="text-xs text-white/30 mb-1">✦ {toolLabel}…</p>
                  )}
                  <div className="bg-[#111] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                    {i === messages.length - 1 && streaming && !msg.content && (
                      <span className="inline-block w-2 h-4 bg-white/40 animate-pulse ml-0.5" />
                    )}
                    {i === messages.length - 1 && streaming && msg.content && (
                      <span className="text-white/40">▍</span>
                    )}
                  </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="shrink-0 px-4 pb-[50px] pt-2 bg-gradient-to-t from-black via-black/90 to-transparent">
        <ChatInput onSend={handleSend} disabled={streaming} variant="bottom" />
      </div>
    </div>
  );
}
