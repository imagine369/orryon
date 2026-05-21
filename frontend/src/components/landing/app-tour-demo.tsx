"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bell, LayoutGrid, Mic, Search, Settings } from "lucide-react";
import {
  CHAT_ASSISTANT_BUBBLE_CLASS,
  CHAT_USER_BUBBLE_CLASS,
  ThinkingIndicator,
} from "@/components/chat-bubble-primitives";

function getDemoGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── App Tour Demo ────────────────────────────────────────────────────────────

type TourPhase =
  | "home" | "typing" | "sending" | "chat-bubble"
  | "thinking" | "responding" | "next-chat" | "clearing" | "reset";

const TOUR_CHATS = [
  { prompt: "Log a purchase from this morning",      response: "Done — logged and categorized automatically." },
  { prompt: "Help me set a savings goal",            response: "Goal created. I'll track your progress and keep you on course." },
  { prompt: "How did my spending look this month?",  response: "You stayed within budget overall. A couple of categories worth keeping an eye on." },
  { prompt: "Remind me about something next week",   response: "Got it — I'll remind you in advance." },
  { prompt: "Am I on track with my savings goal?",   response: "You're making steady progress. Keep it up and you'll hit it on time." },
];



export function AppTourDemo() {
  const [phase, setPhase]               = useState<TourPhase>("home");
  const [chatIdx, setChatIdx]           = useState(0);
  const [inputText, setInputText]       = useState("");
  const [sending, setSending]           = useState(false);
  const [currentBubble, setCurrentBubble] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [thinking, setThinking]         = useState(false);
  const [micActive, setMicActive]       = useState(false);
  const [visible, setVisible]           = useState(true);
  const tmr         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const go = (next: TourPhase, delay: number) => { tmr.current = setTimeout(() => setPhase(next), delay); };

  useEffect(() => {
    if (tmr.current) clearTimeout(tmr.current);

    const chat = TOUR_CHATS[chatIdx];

    if (phase === "home") {
      setInputText(""); setCurrentBubble(""); setCurrentResponse(""); setThinking(false);
      setSending(false); setMicActive(false);
      setChatIdx(0); setVisible(true);
      go("typing", 900);
    }
    if (phase === "typing") {
      // Every 3rd chat uses voice input — mic pulses, then text appears all at once
      if (chatIdx % 3 === 2) {
        setMicActive(true);
        tmr.current = setTimeout(() => {
          setInputText(chat.prompt);
          setMicActive(false);
          go("sending", 400);
        }, 1400);
      } else {
        let i = 0;
        const type = () => {
          if (i <= chat.prompt.length) { setInputText(chat.prompt.slice(0, i)); i++; tmr.current = setTimeout(type, 32); }
          else go("sending", 200);
        };
        tmr.current = setTimeout(type, 150);
      }
    }
    if (phase === "sending") { setSending(true); go("chat-bubble", 180); }
    if (phase === "chat-bubble") {
      setCurrentBubble(chat.prompt); setInputText(""); setSending(false);
      go("thinking", 180);
    }
    if (phase === "thinking") { setThinking(true); go("responding", 650); }
    if (phase === "responding") {
      setThinking(false);
      let i = 0;
      const type = () => {
        if (i <= chat.response.length) { setCurrentResponse(chat.response.slice(0, i)); i++; tmr.current = setTimeout(type, 22); }
        else go("next-chat", 900);
      };
      tmr.current = setTimeout(type, 50);
    }
    if (phase === "next-chat") {
      setCurrentBubble(""); setCurrentResponse("");
      if (chatIdx < TOUR_CHATS.length - 1) {
        setPhase("clearing");
        setChatIdx(c => c + 1);
      } else {
        go("reset", 400);
      }
    }
    if (phase === "clearing") { go("typing", 500); }
    if (phase === "reset") {
      setVisible(false);
      tmr.current = setTimeout(() => setPhase("home"), 500);
    }
    return () => { if (tmr.current) clearTimeout(tmr.current); };
  }, [phase, chatIdx]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentBubble, currentResponse, thinking]);

  const hasInput      = inputText.length > 0;
  const isChatMode    = chatIdx > 0 || !["home", "typing", "sending"].includes(phase);
  const isTypingPhase = phase === "typing";

  return (
    <div className="w-full max-w-[320px] sm:max-w-[360px] mx-auto" style={{ transition: "opacity 0.5s", opacity: visible ? 1 : 0 }}>
      {/* Phone shell */}
      <div className="relative rounded-[36px] overflow-hidden bg-black shadow-2xl h-[600px] sm:h-[650px]" style={{ border: "6px solid #1a1a1a", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 30px 60px rgba(0,0,0,0.7)" }}>

        <div className="absolute inset-0 flex flex-col">

          {/* Nav bar */}
          <nav className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-xl border-b border-white/5 shrink-0">
            <span className="text-white font-extrabold tracking-widest uppercase text-[0.5rem] font-[family-name:var(--font-playfair)]">ORRYON</span>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-lg text-white/60"><Search className="h-2.5 w-2.5" strokeWidth={1.5} /></button>
              <button className="relative p-2 rounded-lg text-white/60">
                <Bell className="h-2.5 w-2.5" strokeWidth={1.5} />
                <span className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-white" />
              </button>
              <button className="p-2 rounded-lg text-white/60"><LayoutGrid className="h-2.5 w-2.5" strokeWidth={1.5} /></button>
              <button className="p-2 rounded-lg text-white/60"><Settings className="h-2.5 w-2.5" strokeWidth={1.5} /></button>
            </div>
          </nav>

          {/* Home screen */}
          {!isChatMode && (
            <div className="flex-1 flex flex-col items-center justify-center px-4" style={{ paddingBottom: "max(50px, calc(20px + env(safe-area-inset-bottom)))" }}>
              <Image src="/avatar.png" alt="Orryon" width={80} height={80} className="rounded-full object-contain mb-5 ring-1 ring-white/10" />
              <p className="text-white/60 text-[14px] mb-6 max-w-[220px] text-center leading-tight">Hello.</p>
              <div className="mb-6 flex items-center gap-2 px-3.5 py-2 rounded-full border border-white/10 bg-white/[0.03]">
                <span className="text-white/30 text-sm">✦</span>
                <span className="text-xs text-white/50">{getDemoGreeting()}. Ready when you are.</span>
              </div>
              <div className="w-full max-w-xl">
                <div className="flex items-center gap-2 rounded-full border bg-[#1c1c1e] px-4 py-2 transition-all duration-300"
                  style={{ borderColor: (micActive || isTypingPhase) ? "rgba(255,255,255,0.28)" : hasInput ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)", boxShadow: (micActive || isTypingPhase) ? "0 0 0 3px rgba(255,255,255,0.04)" : "none" }}>
                  <span className="flex-1 text-[15px] py-1.5 min-h-[1.5em] flex items-center">
                    {micActive
                      ? <span className="flex items-center gap-2">
                          <span className="text-white/60 text-[13px] leading-none">Listening</span>
                          <span className="flex items-end gap-[3px]" style={{ height: 16 }}>
                            {[0, 0.15, 0.08, 0.22, 0.04].map((delay, i) => (
                              <span key={i} style={{ display: "inline-block", width: 2.5, borderRadius: 2, background: "rgba(255,255,255,0.55)", animation: `wavebar 0.65s ease-in-out ${delay}s infinite` }} />
                            ))}
                          </span>
                        </span>
                      : hasInput
                        ? <span className="text-white/85">{inputText}{isTypingPhase && <span className="inline-block w-[1.5px] h-[0.85em] bg-white/60 ml-px align-middle animate-pulse" />}</span>
                        : <span className="text-white/35">Ask me anything…</span>}
                  </span>
                  <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300"
                    style={(micActive || isTypingPhase) ? { background: "rgba(255,255,255,0.08)", animation: "micglow 1.2s ease-in-out infinite" } : {}}>
                    <Mic className={`h-5 w-5 transition-colors ${(micActive || isTypingPhase) ? "text-white" : "text-white/60"}`} strokeWidth={1.5} />
                  </span>
                  <button className="shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all"
                    style={{ background: sending ? "rgb(229,229,229)" : hasInput ? "white" : "rgba(255,255,255,0.2)", transform: sending ? "scale(0.85)" : hasInput ? "scale(1)" : "scale(0.95)" }}>
                    <ArrowUp className="h-4 w-4" style={{ color: hasInput ? "black" : "rgba(255,255,255,0.4)" }} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat screen */}
          {isChatMode && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div ref={chatScrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "none" }}>
                <div className="flex justify-center pb-1 pt-2">
                  <Image src="/avatar.png" alt="Orryon" width={80} height={80} className="rounded-full object-contain ring-1 ring-white/10" />
                </div>
                <div className="min-h-0 flex-1" />
                {currentBubble && (
                  <div className="flex w-full justify-end" style={{ animation: "msgIn 0.22s ease-out both" }}>
                    <div className={CHAT_USER_BUBBLE_CLASS}>{currentBubble}</div>
                  </div>
                )}
                {thinking && (
                  <div className="flex w-full min-w-0 gap-3" style={{ animation: "msgIn 0.18s ease-out both" }}>
                    <Image src="/avatar.png" alt="Orryon" width={28} height={28} className="mt-0.5 size-7 shrink-0 rounded-full object-contain ring-1 ring-white/10" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className={CHAT_ASSISTANT_BUBBLE_CLASS}><ThinkingIndicator /></div>
                    </div>
                  </div>
                )}
                {currentResponse && (
                  <div className="flex w-full min-w-0 gap-3" style={{ animation: "msgIn 0.18s ease-out both" }}>
                    <Image src="/avatar.png" alt="Orryon" width={28} height={28} className="mt-0.5 size-7 shrink-0 rounded-full object-contain ring-1 ring-white/10" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className={`${CHAT_ASSISTANT_BUBBLE_CLASS} whitespace-pre-line`}>
                        {currentResponse}
                        {phase === "responding" && <span className="ml-0.5 inline-block h-[0.8em] w-px animate-pulse bg-white/40 align-middle" />}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="shrink-0 px-4 pt-2 bg-gradient-to-t from-black via-black/90 to-transparent" style={{ paddingBottom: "max(50px, calc(20px + env(safe-area-inset-bottom)))" }}>
                <div className="flex items-center gap-2 rounded-full border bg-[#1c1c1e] px-4 py-2 transition-all duration-300"
                  style={{ borderColor: (micActive || isTypingPhase) ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.1)", boxShadow: (micActive || isTypingPhase) ? "0 0 0 3px rgba(255,255,255,0.04)" : "none" }}>
                  <span className="flex-1 text-[15px] py-1.5 min-h-[1.5em] flex items-center">
                    {micActive
                      ? <span className="flex items-center gap-2">
                          <span className="text-white/60 text-[13px] leading-none">Listening</span>
                          <span className="flex items-end gap-[3px]" style={{ height: 16 }}>
                            {[0, 0.15, 0.08, 0.22, 0.04].map((delay, i) => (
                              <span key={i} style={{ display: "inline-block", width: 2.5, borderRadius: 2, background: "rgba(255,255,255,0.55)", animation: `wavebar 0.65s ease-in-out ${delay}s infinite` }} />
                            ))}
                          </span>
                        </span>
                      : inputText
                        ? <span className="text-white/85">{inputText}</span>
                        : <span className="text-white/35">Ask me anything…</span>}
                  </span>
                  <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300"
                    style={(micActive || isTypingPhase) ? { background: "rgba(255,255,255,0.08)", animation: "micglow 1.2s ease-in-out infinite" } : {}}>
                    <Mic className={`h-5 w-5 transition-colors ${(micActive || isTypingPhase) ? "text-white" : "text-white/60"}`} strokeWidth={1.5} />
                  </span>
                  <button className={`shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all ${sending ? "bg-white scale-100" : "bg-white/20 scale-95"}`}>
                    <ArrowUp className={`h-4 w-4 ${sending ? "text-black" : "text-white/60"}`} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
