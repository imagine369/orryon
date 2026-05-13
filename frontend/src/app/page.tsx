"use client";

import Image from "next/image";
import Link from "next/link";
const StarEight = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <polygon points="12,2 13.5,8.3 19.1,4.9 15.7,10.5 22,12 15.7,13.5 19.1,19.1 13.5,15.7 12,22 10.5,15.7 4.9,19.1 8.3,13.5 2,12 8.3,10.5 4.9,4.9 10.5,8.3" />
  </svg>
);
import { useState, useEffect, useRef } from "react";
import { ArrowUp, Plus, Search, Bell, LayoutGrid, Settings, X, Mic, ChevronLeft, ChevronRight, TrendingDown, Calendar, SlidersHorizontal, BookOpen, Target, Receipt, BarChart2, Wind, Sparkles, List, Check, TrendingUp, Activity, MessageCircle, FileText, Moon, Flame, Dumbbell, Droplets } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { hasToken } from "@/lib/api";
import { FadeIn } from "@/components/motion";
import { motion } from "framer-motion";
import { Footer } from "@/components/footer";
import { PillLink, PillButton } from "@/components/pill-cta";
import {
  CHAT_ASSISTANT_BUBBLE_CLASS,
  CHAT_USER_BUBBLE_CLASS,
  ThinkingIndicator,
} from "@/components/chat-bubble-primitives";

const HOW_STEPS = [
  { n: "01", title: "You don't set anything up.",     desc: "Just start talking. Type or speak — I handle the rest. No categories, no forms, no setup." },
  { n: "02", title: "I remember so you don't have to.", desc: "Spending logged. Goals tracked. Bills remembered. Your day stays organized without you lifting a finger." },
  { n: "03", title: "Just ask. I'm here to help.", desc: "Whether it's your budget, a reminder, or just a moment to breathe." },
];

type HowPhase =
  | "s1-typing" | "s1-sending" | "s1-sent"
  | "s2-enter"  | "s2-show"    | "s2-wait"
  | "s3-typing" | "s3-sending" | "s3-thinking" | "s3-responding" | "s3-done";

const S1_PROMPT   = "Help me save for a goal by year end";
const S3_PROMPT   = "Am I on track with my savings goal?";
const S3_RESPONSE = "You're making good progress. Keep saving consistently and you'll hit it on time.";

function HowItWorksDemo() {
  const [phase, setPhase]       = useState<HowPhase>("s1-typing");
  const [inputText, setInputText] = useState("");
  const [sending, setSending]   = useState(false);
  const [bubble1, setBubble1]   = useState("");
  const [goalIn, setGoalIn]     = useState(false);
  const [goalLabel, setGoalLabel] = useState("");
  const [bubble2, setBubble2]   = useState("");
  const [response, setResponse] = useState("");
  const [thinking, setThinking] = useState(false);
  const [frameVisible, setFrameVisible] = useState(true);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = phase.startsWith("s1") ? 0 : phase.startsWith("s2") ? 1 : 2;
  const view = phase.startsWith("s2") ? "goals" : "chat";

  const go = (next: HowPhase, delay: number) => {
    t.current = setTimeout(() => setPhase(next), delay);
  };

  useEffect(() => {
    if (t.current) clearTimeout(t.current);

    if (phase === "s1-typing") {
      setInputText(""); setBubble1(""); setSending(false);
      setGoalIn(false); setGoalLabel(""); setBubble2(""); setResponse(""); setThinking(false);
      setFrameVisible(true);
      let i = 0;
      const type = () => {
        if (i <= S1_PROMPT.length) { setInputText(S1_PROMPT.slice(0, i)); i++; t.current = setTimeout(type, 46); }
        else go("s1-sending", 400);
      };
      t.current = setTimeout(type, 600);
    }
    if (phase === "s1-sending") {
      setSending(true);
      go("s1-sent", 320);
    }
    if (phase === "s1-sent") {
      setBubble1(S1_PROMPT); setInputText(""); setSending(false);
      go("s2-enter", 700);
    }
    if (phase === "s2-enter") {
      setFrameVisible(false);
      t.current = setTimeout(() => { setFrameVisible(true); go("s2-show", 100); }, 280);
    }
    if (phase === "s2-show") {
      t.current = setTimeout(() => { setGoalIn(true); setGoalLabel("✦ Creating goal…"); }, 300);
      t.current = setTimeout(() => setGoalLabel("✦ Goal saved"), 1400);
      go("s2-wait", 3000);
    }
    if (phase === "s2-wait") {
      setFrameVisible(false);
      t.current = setTimeout(() => { setFrameVisible(true); go("s3-typing", 100); }, 280);
    }
    if (phase === "s3-typing") {
      setInputText(""); setSending(false);
      let i = 0;
      const type = () => {
        if (i <= S3_PROMPT.length) { setInputText(S3_PROMPT.slice(0, i)); i++; t.current = setTimeout(type, 46); }
        else go("s3-sending", 350);
      };
      t.current = setTimeout(type, 400);
    }
    if (phase === "s3-sending") {
      setSending(true);
      go("s3-thinking", 320);
    }
    if (phase === "s3-thinking") {
      setBubble2(S3_PROMPT); setInputText(""); setSending(false); setThinking(true);
      go("s3-responding", 950);
    }
    if (phase === "s3-responding") {
      setThinking(false);
      let i = 0;
      const type = () => {
        if (i <= S3_RESPONSE.length) { setResponse(S3_RESPONSE.slice(0, i)); i++; t.current = setTimeout(type, 36); }
        else go("s3-done", 2600);
      };
      t.current = setTimeout(type, 80);
    }
    if (phase === "s3-done") {
      setFrameVisible(false);
      t.current = setTimeout(() => setPhase("s1-typing"), 500);
    }

    return () => { if (t.current) clearTimeout(t.current); };
  }, [phase]);

  const hasInput = inputText.length > 0;

  return (
    <div className="flex gap-5 items-start text-left">

      {/* Step list — left column */}
      <div className="shrink-0 w-[130px] pt-4 hidden sm:flex flex-col gap-0">
        {HOW_STEPS.map((s, i) => {
          const active = step === i;
          const done   = step > i;
          return (
            <div key={s.n} className="flex gap-3">
              {/* Dot + line */}
              <div className="flex flex-col items-center">
                <div
                  className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-400"
                  style={{
                    borderColor: active ? "rgba(255,255,255,0.8)" : done ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                    background:  active ? "rgba(255,255,255,0.1)" : "transparent",
                  }}
                >
                  <span className="text-[0.5rem] font-bold" style={{ color: active ? "white" : done ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)" }}>
                    {done ? "✓" : s.n}
                  </span>
                </div>
                {i < HOW_STEPS.length - 1 && (
                  <div className="w-px flex-1 min-h-[48px] mt-1" style={{ background: done ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)" }} />
                )}
              </div>
              {/* Text */}
              <div className="pb-10">
                <p className="text-xs font-semibold leading-tight mb-1 transition-colors duration-300" style={{ color: active ? "white" : "rgba(255,255,255,0.3)" }}>
                  {s.title}
                </p>
                <p className="text-[0.65rem] leading-snug transition-colors duration-300" style={{ color: active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)" }}>
                  {s.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile step indicator */}
      <div className="sm:hidden w-full mb-4 flex items-center gap-2">
        {HOW_STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-300"
                style={{ borderColor: step === i ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.1)", background: step === i ? "rgba(255,255,255,0.1)" : "transparent" }}>
                <span className="text-[0.45rem] font-bold" style={{ color: step === i ? "white" : "rgba(255,255,255,0.2)" }}>{s.n}</span>
              </div>
              <span className="text-[0.6rem] font-medium transition-colors duration-300 whitespace-nowrap" style={{ color: step === i ? "white" : "rgba(255,255,255,0.25)" }}>{s.title}</span>
            </div>
            {i < HOW_STEPS.length - 1 && <div className="flex-1 h-px bg-white/5" />}
          </div>
        ))}
      </div>

      {/* App frame — right column */}
      <div className="flex-1 min-w-0" style={{ transition: "opacity 0.25s ease", opacity: frameVisible ? 1 : 0 }}>
        <div className="rounded-2xl border border-white/8 bg-black overflow-hidden">

          {/* Chat view (step 01 + 03) */}
          {view === "chat" && (
            <>
              <div className="flex min-h-[140px] flex-col justify-end gap-3 px-4 pt-5 pb-3">
                {bubble1 && (
                  <div className="flex w-full justify-end">
                    <div className={CHAT_USER_BUBBLE_CLASS}>{bubble1}</div>
                  </div>
                )}
                {thinking && (
                  <div className="flex w-full min-w-0 gap-3">
                    <Image
                      src="/avatar.png"
                      alt="Orryon"
                      width={28}
                      height={28}
                      className="mt-0.5 size-7 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className={CHAT_ASSISTANT_BUBBLE_CLASS}>
                        <ThinkingIndicator />
                      </div>
                    </div>
                  </div>
                )}
                {response && (
                  <div className="flex w-full min-w-0 gap-3">
                    <Image
                      src="/avatar.png"
                      alt="Orryon"
                      width={28}
                      height={28}
                      className="mt-0.5 size-7 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className={CHAT_ASSISTANT_BUBBLE_CLASS}>
                        {response}
                        {phase === "s3-responding" && (
                          <span className="ml-0.5 inline-block h-[0.8em] w-px animate-pulse bg-white/40 align-middle" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {bubble2 && !thinking && !response && (
                  <div className="flex w-full justify-end">
                    <div className={CHAT_USER_BUBBLE_CLASS}>{bubble2}</div>
                  </div>
                )}
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-end gap-2 rounded-full border bg-[#1c1c1e] px-4 py-2 transition-colors duration-200"
                  style={{ borderColor: hasInput ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)" }}>
                  <span className="flex-1 min-w-0 text-[15px] py-1.5 min-h-[1.5em]">
                    {hasInput
                      ? <span className="text-white/85">{inputText}{(phase === "s1-typing" || phase === "s3-typing") && <span className="inline-block w-[1.5px] h-[0.85em] bg-white/60 ml-px align-middle animate-pulse" />}</span>
                      : <span className="text-white/35">Ask me anything…</span>}
                  </span>
                  <button className="shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all"
                    style={{ background: sending ? "rgb(229,229,229)" : hasInput ? "white" : "rgba(255,255,255,0.2)", color: hasInput ? "black" : "rgba(255,255,255,0.4)", transform: sending ? "scale(0.85)" : hasInput ? "scale(1)" : "scale(0.95)" }}>
                    <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Goals view (step 02) */}
          {view === "goals" && (
            <div className="px-4 pt-4 pb-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[0.65rem] uppercase tracking-wide text-white/20">Goals</p>
                <button className="flex items-center justify-center w-7 h-7 rounded-full bg-white shrink-0">
                  <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
                </button>
              </div>
              {goalLabel && (
                <p className="text-[0.65rem] text-white/60 mb-3">{goalLabel}</p>
              )}
              <div style={{ transition: "opacity 0.4s ease, transform 0.4s ease", opacity: goalIn ? 1 : 0, transform: goalIn ? "translateY(0)" : "translateY(-8px)" }}>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">Savings Goal</span>
                    <span className="text-sm font-bold text-green-400">37%</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-2">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-green-600/50" style={{ width: "37%" }} />
                  </div>
                  <div className="flex justify-between text-[0.7rem] text-white/30">
                    <span>$1,840 saved of $5,000</span>
                    <span>In progress · by Dec</span>
                  </div>
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">Long-term Fund</span>
                  <span className="text-sm font-bold text-green-400">32%</span>
                </div>
                <div className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-2">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-green-600/50" style={{ width: "32%" }} />
                </div>
                <div className="flex justify-between text-[0.7rem] text-white/30">
                  <span>$1,280 saved of $4,000</span>
                  <span>$2,720 to go</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

const chatExamples = [
  {
    prompt: "Log a purchase for this morning",
    response: "Done — logged and categorized.",
  },
  {
    prompt: "Help me set a savings goal",
    response: "Goal created. I'll track your progress automatically.",
  },
  {
    prompt: "Add a few items to my grocery list",
    response: "Added to your grocery list.",
  },
  {
    prompt: "Remind me about an appointment next week",
    response: "Scheduled — I'll remind you in advance.",
  },
  {
    prompt: "How did my spending look this week?",
    response: "You stayed within budget. A few categories worth reviewing.",
  },
];

type ChatPhase = "typing-input" | "sending" | "sent" | "thinking" | "typing-response" | "waiting" | "clearing";

function ChatDemo() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<ChatPhase>("typing-input");
  const [inputText, setInputText] = useState("");
  const [userBubble, setUserBubble] = useState("");
  const [responseText, setResponseText] = useState("");
  const [sending, setSending] = useState(false);
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = chatExamples[index];

  useEffect(() => {
    const clear = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    clear();

    if (phase === "typing-input") {
      setInputText("");
      setUserBubble("");
      setResponseText("");
      setSending(false);
      setVisible(true);
      let i = 0;
      const type = () => {
        if (i <= current.prompt.length) {
          setInputText(current.prompt.slice(0, i));
          i++;
          timeoutRef.current = setTimeout(type, 48);
        } else {
          timeoutRef.current = setTimeout(() => setPhase("sending"), 350);
        }
      };
      timeoutRef.current = setTimeout(type, 500);
    }

    if (phase === "sending") {
      setSending(true);
      timeoutRef.current = setTimeout(() => {
        setUserBubble(current.prompt);
        setInputText("");
        setSending(false);
        setPhase("sent");
      }, 300);
    }

    if (phase === "sent") {
      timeoutRef.current = setTimeout(() => setPhase("thinking"), 200);
    }

    if (phase === "thinking") {
      timeoutRef.current = setTimeout(() => setPhase("typing-response"), 950);
    }

    if (phase === "typing-response") {
      let i = 0;
      const type = () => {
        if (i <= current.response.length) {
          setResponseText(current.response.slice(0, i));
          i++;
          timeoutRef.current = setTimeout(type, 36);
        } else {
          timeoutRef.current = setTimeout(() => setPhase("waiting"), 2400);
        }
      };
      timeoutRef.current = setTimeout(type, 80);
    }

    if (phase === "waiting") {
      setVisible(false);
      timeoutRef.current = setTimeout(() => {
        setIndex((prev) => (prev + 1) % chatExamples.length);
        setPhase("typing-input");
      }, 500);
    }

    return clear;
  }, [phase, index, current]);

  const hasInput = inputText.length > 0;

  return (
    <div
      className="mx-auto max-w-[340px] rounded-2xl border border-white/8 bg-black overflow-hidden"
      style={{ transition: "opacity 0.4s", opacity: visible ? 1 : 0 }}
    >
      {/* Messages area */}
      <div className="flex min-h-[110px] flex-col justify-end gap-3 px-4 pt-5 pb-3">
        {userBubble.length > 0 && (
          <div className="flex w-full justify-end">
            <div className={CHAT_USER_BUBBLE_CLASS}>{userBubble}</div>
          </div>
        )}

        {phase === "thinking" && (
          <div className="flex w-full min-w-0 gap-3">
            <Image
              src="/avatar.png"
              alt="Orryon"
              width={28}
              height={28}
              className="mt-0.5 size-7 shrink-0 rounded-full object-cover ring-1 ring-white/10"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className={CHAT_ASSISTANT_BUBBLE_CLASS}>
                <ThinkingIndicator />
              </div>
            </div>
          </div>
        )}

        {(phase === "typing-response" || phase === "waiting") && responseText.length > 0 && (
          <div className="flex w-full min-w-0 gap-3">
            <Image
              src="/avatar.png"
              alt="Orryon"
              width={28}
              height={28}
              className="mt-0.5 size-7 shrink-0 rounded-full object-cover ring-1 ring-white/10"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className={CHAT_ASSISTANT_BUBBLE_CLASS}>
                {responseText}
                {phase === "typing-response" && (
                  <span className="ml-0.5 inline-block h-[0.8em] w-px animate-pulse bg-white/40 align-middle" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input bar — matches real ChatInput exactly */}
      <div className="px-4 pb-4">
        <div
          className="flex items-end gap-2 rounded-full border bg-[#1c1c1e] px-4 py-2 transition-colors duration-200"
          style={{ borderColor: hasInput ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)" }}
        >
          <span className="flex-1 min-w-0 text-[15px] py-1.5 min-h-[1.5em] text-left">
            {hasInput ? (
              <span className="text-white/85">
                {inputText}
                {phase === "typing-input" && (
                  <span className="inline-block w-[1.5px] h-[0.85em] bg-white/60 ml-px align-middle animate-pulse" />
                )}
              </span>
            ) : (
              <span className="text-white/35">Ask me anything…</span>
            )}
          </span>
          <button
            className="shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all"
            style={{
              background: sending ? "rgb(229,229,229)" : hasInput ? "white" : "rgba(255,255,255,0.2)",
              color: hasInput ? "black" : "rgba(255,255,255,0.4)",
              transform: sending ? "scale(0.85)" : hasInput ? "scale(1)" : "scale(0.95)",
            }}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}


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



function AppTourDemo() {
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
              <Image src="/avatar.png" alt="Orryon" width={80} height={80} className="rounded-full object-cover mb-5 ring-1 ring-white/10" />
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
                  <Image src="/avatar.png" alt="Orryon" width={80} height={80} className="rounded-full object-cover ring-1 ring-white/10" />
                </div>
                <div className="min-h-0 flex-1" />
                {currentBubble && (
                  <div className="flex w-full justify-end" style={{ animation: "msgIn 0.22s ease-out both" }}>
                    <div className={CHAT_USER_BUBBLE_CLASS}>{currentBubble}</div>
                  </div>
                )}
                {thinking && (
                  <div className="flex w-full min-w-0 gap-3" style={{ animation: "msgIn 0.18s ease-out both" }}>
                    <Image src="/avatar.png" alt="Orryon" width={28} height={28} className="mt-0.5 size-7 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className={CHAT_ASSISTANT_BUBBLE_CLASS}><ThinkingIndicator /></div>
                    </div>
                  </div>
                )}
                {currentResponse && (
                  <div className="flex w-full min-w-0 gap-3" style={{ animation: "msgIn 0.18s ease-out both" }}>
                    <Image src="/avatar.png" alt="Orryon" width={28} height={28} className="mt-0.5 size-7 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
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

// ─── Feature Section ──────────────────────────────────────────────────────────

const FEATURE_TABS_LIST = ["Finance", "Organize", "Wellbeing"] as const;
type FeatureTabKey = typeof FEATURE_TABS_LIST[number];

type FeatureCardData = {
  tag: string;
  Icon: React.FC<{ className?: string; strokeWidth?: number }>;
  highlighted: string;
  rest: string;
  from: string;
  to: string;
  glow: string;
  photo?: string;
  preview?: React.ReactNode;
};

const FINANCE_CARDS: FeatureCardData[] = [
  { tag: "BUDGET",   Icon: SlidersHorizontal, highlighted: "Always know",        rest: "where your money goes.",      from: "#060e1f", to: "#0d1f40", glow: "rgba(96,165,250,0.12)", photo: "/budget-card.jpg" },
  { tag: "GOALS",    Icon: Target,            highlighted: "Save any amount.",    rest: "Meet your goals.",     from: "#050f08", to: "#0a2012", glow: "rgba(74,222,128,0.12)", photo: "/goals-card.jpg"  },
  { tag: "BILLS",    Icon: Receipt,           highlighted: "Stay on top",         rest: "of your expenses.",            from: "#160800", to: "#2a1200", glow: "rgba(251,146,60,0.12)", photo: "/bills-card.jpg"  },
  { tag: "INSIGHTS", Icon: BarChart2,         highlighted: "Spot patterns,",      rest: "spend smarter.",              from: "#0d0520", to: "#1c0a3a", glow: "rgba(192,132,252,0.12)", photo: "/insights-card.jpg" },
  { tag: "FORECAST", Icon: TrendingUp,        highlighted: "See where",           rest: "your money is headed.",       from: "#031a1a", to: "#063030", glow: "rgba(45,212,191,0.12)", photo: "/forecast-card.jpg"  },
  { tag: "YEARLY",   Icon: Activity,          highlighted: "Your entire year,",   rest: "in one clear view.",          from: "#08081e", to: "#14143c", glow: "rgba(129,140,248,0.12)", photo: "/yearly-card.jpg" },
];

function TasksPreview() {
  const items = [
    { label: "Review monthly report",     done: false, color: "#f87171" },
    { label: "Personal errand",           done: true,  color: "rgba(255,255,255,0.2)" },
    { label: "Review goals",              done: false, color: "#fb923c" },
    { label: "Follow up on pending item", done: false, color: "rgba(255,255,255,0.2)" },
  ];
  return (
    <div className="w-full px-1 space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5 py-1">
          <div
            className="shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all"
            style={{ borderColor: item.done ? "rgba(255,255,255,0.25)" : item.color, background: item.done ? "rgba(255,255,255,0.06)" : "transparent" }}
          >
            {item.done && <div className="w-1.5 h-1.5 rounded-full bg-white/30" />}
          </div>
          <p className={`text-[0.72rem] leading-snug flex-1 ${item.done ? "line-through text-white/25" : "text-white/70"}`}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function ListsPreview() {
  const items = [
    { name: "Dairy item",    done: false },
    { name: "Bakery item",   done: false },
    { name: "Fresh produce", done: false },
    { name: "Pantry staple", done: false },
    { name: "Pantry staple", done: true  },
  ];
  return (
    <div className="w-full px-1 space-y-1.5">
      <p className="text-[0.5rem] uppercase tracking-widest text-white/20 mb-2">Grocery list</p>
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-2.5 py-0.5">
          <div className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${item.done ? "border-green-400/50 bg-green-400/10" : "border-white/20"}`}>
            {item.done && <div className="w-1.5 h-1.5 rounded-full bg-green-400/60" />}
          </div>
          <p className={`text-[0.72rem] flex-1 leading-snug ${item.done ? "line-through text-white/25" : "text-white/70"}`}>{item.name}</p>
        </div>
      ))}
    </div>
  );
}

function CalendarPreview() {
  const events: { Icon: React.FC<{ className?: string; strokeWidth?: number }>; title: string; date: string; urgent: boolean }[] = [
    { Icon: Bell,     title: "Health appointment", date: "Soon",     urgent: true  },
    { Icon: Calendar, title: "Team catch-up",       date: "This week",urgent: false },
    { Icon: Receipt,  title: "Bill due",             date: "Upcoming", urgent: false },
    { Icon: Calendar, title: "Personal event",       date: "Upcoming", urgent: false },
  ];
  return (
    <div className="w-full px-1 space-y-1">
      <p className="text-[0.5rem] uppercase tracking-widest text-white/20 mb-2.5">Upcoming</p>
      {events.map((e) => (
        <div key={e.title} className="flex items-center gap-2.5 py-1.5 border-b border-white/[0.05]">
          <div className="shrink-0 w-5 h-5 rounded-md border border-white/8 bg-white/[0.04] flex items-center justify-center">
            <e.Icon className={`h-2.5 w-2.5 ${e.urgent ? "text-orange-400/70" : "text-white/30"}`} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[0.72rem] font-medium leading-tight truncate ${e.urgent ? "text-white/85" : "text-white/65"}`}>{e.title}</p>
          </div>
          <span className={`text-[0.58rem] shrink-0 ${e.urgent ? "text-orange-400/80" : "text-white/25"}`}>{e.date}</span>
        </div>
      ))}
    </div>
  );
}

function JournalPreview() {
  return (
    <div className="w-full px-1">
      <p className="text-[0.5rem] uppercase tracking-widest text-white/20 mb-2.5">Today&rsquo;s entry · private</p>
      <p className="text-[0.75rem] text-white/60 leading-relaxed mb-4 italic">
        Private reflection…
        <span className="inline-block w-[1.5px] h-[0.8em] bg-white/35 ml-0.5 align-middle animate-pulse" />
      </p>
      <div className="border-t border-white/[0.06] pt-3 space-y-2">
        {[
          { date: "—", preview: "Private reflection…" },
          { date: "—", preview: "Private reflection…" },
        ].map((e, i) => (
          <div key={i}>
            <p className="text-[0.55rem] text-white/25">{e.date}</p>
            <p className="text-[0.65rem] text-white/25 leading-snug mt-0.5 italic">{e.preview}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StreaksPreview() {
  const ACCENT = "#ff9a14";

  const habits = [
    { Icon: Dumbbell,  name: "Movement",   count: 14, target: 30 },
    { Icon: BookOpen,  name: "Reading",    count: 7,  target: 21 },
    { Icon: Droplets,  name: "Hydration",  count: 21, target: 30 },
  ];

  const totalDots = 21;
  const completedCounts = [14, 7, 21];

  return (
    <div className="w-full px-1 space-y-3">
      {habits.map((h, hi) => {
        const done = completedCounts[hi];
        return (
          <div key={h.name} className="flex items-center gap-3 p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            {/* Icon */}
            <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
              <h.Icon className="h-3.5 w-3.5 text-white/50" strokeWidth={1.5} />
            </div>
            {/* Name + progress */}
            <div className="flex-1 min-w-0">
              <p className="text-[0.7rem] font-semibold text-white/85 truncate">{h.name}</p>
              <p className="text-[0.55rem] text-white/30 mt-0.5">— / — days</p>
            </div>
            {/* Dot mini-grid: 7 dots showing last week */}
            <div className="flex gap-1 shrink-0">
              {Array.from({ length: 7 }, (_, i) => {
                const filled = i < (done % 7 === 0 ? 7 : done % 7) || done >= totalDots;
                const isGoalDot = i === 6 && h.count === h.target;
                return (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: isGoalDot
                        ? ACCENT
                        : filled
                        ? "rgba(255,255,255,0.75)"
                        : "rgba(255,255,255,0.08)",
                    }}
                  />
                );
              })}
            </div>
            {/* Count */}
            <span className="text-[0.75rem] font-bold tabular-nums shrink-0" style={{ color: ACCENT }}>
              {h.count}
            </span>
          </div>
        );
      })}

      {/* Bottom: total streak fire */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        <Flame className="h-3.5 w-3.5" style={{ color: ACCENT }} strokeWidth={1.5} />
        <span className="text-[0.65rem] font-medium" style={{ color: ACCENT }}>3 habits · best streak 21 days</span>
      </div>
    </div>
  );
}

function SearchPreview() {
  const results: { Icon: React.FC<{ className?: string; strokeWidth?: number }>; label: string; meta: string }[] = [
    { Icon: Receipt,  label: "Coffee & breakfast",   meta: "Today · $9.50"      },
    { Icon: Check,    label: "Book flights to NYC",   meta: "Task · Due Apr 20"  },
    { Icon: FileText, label: "Vacation packing list", meta: "Note · Apr 10"      },
    { Icon: Calendar, label: "Doctor appointment",    meta: "Calendar · Apr 14"  },
  ];
  return (
    <div className="w-full px-1">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 mb-3">
        <Search className="h-3 w-3 text-white/30 shrink-0" strokeWidth={1.5} />
        <span className="text-[0.7rem] text-white/60">coffee</span>
        <span className="inline-block w-[1.5px] h-[0.75em] bg-white/40 align-middle animate-pulse" />
      </div>
      <div className="space-y-0.5">
        {results.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 py-1.5 border-b border-white/[0.05]">
            <div className="shrink-0 w-5 h-5 rounded-md border border-white/8 bg-white/[0.04] flex items-center justify-center">
              <r.Icon className="h-2.5 w-2.5 text-white/30" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.72rem] text-white/75 truncate leading-tight">{r.label}</p>
              <p className="text-[0.55rem] text-white/25 mt-0.5">{r.meta}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ORGANIZE_CARDS: FeatureCardData[] = [
  { tag: "TASKS",    Icon: Check,    highlighted: "From idea",            rest: "to done in seconds.",      from: "#060e1f", to: "#0d2040", glow: "rgba(96,165,250,0.10)",  preview: <TasksPreview />    },
  { tag: "LISTS",    Icon: List,     highlighted: "Groceries, errands,",  rest: "anything. Just say it.",   from: "#050f08", to: "#0a2014", glow: "rgba(74,222,128,0.10)",  preview: <ListsPreview />    },
  { tag: "CALENDAR", Icon: Calendar, highlighted: "Your whole week,",     rest: "organized instantly.",     from: "#120900", to: "#221400", glow: "rgba(251,146,60,0.10)",  preview: <CalendarPreview /> },
  { tag: "JOURNAL",  Icon: BookOpen, highlighted: "Capture thoughts,",    rest: "track what matters.",      from: "#0d0520", to: "#1c0a3a", glow: "rgba(192,132,252,0.10)", preview: <JournalPreview />  },
  { tag: "STREAKS",  Icon: Flame,    highlighted: "Build habits,",        rest: "don't break the chain.",   from: "#1a0800", to: "#2d1200", glow: "rgba(255,154,20,0.10)",  preview: <StreaksPreview />  },
  { tag: "SEARCH",   Icon: Search,   highlighted: "Find anything",        rest: "across your entire life.", from: "#031a1a", to: "#063028", glow: "rgba(45,212,191,0.10)",  preview: <SearchPreview />   },
];

function BreathingPreview() {
  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div
        className="rounded-full"
        style={{
          width: 115, height: 115,
          background: "linear-gradient(135deg,hsl(200,45%,68%) 0%,hsl(205,40%,52%) 50%,hsl(210,38%,38%) 100%)",
          animation: "breatheOrb 4.2s ease-in-out infinite",
          boxShadow: "0 0 40px rgba(100,170,220,0.25)",
        }}
      />
      <div className="flex flex-col items-center gap-1">
        <p className="text-[0.72rem] font-medium text-white/60 tracking-wide">Box Breathing</p>
        <div className="flex items-center gap-2 text-[0.55rem] text-white/25 tracking-widest uppercase">
          <span>Inhale</span><span>·</span><span>Hold</span><span>·</span><span>Exhale</span><span>·</span><span>Hold</span>
        </div>
      </div>
    </div>
  );
}

function AIChatPreview() {
  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* User bubble */}
      <div className="flex justify-end">
        <div className="bg-white/10 rounded-2xl rounded-br-sm px-3.5 py-2 text-[0.72rem] text-white/80 max-w-[85%] text-left leading-snug">
          How did I do this month?
        </div>
      </div>

      {/* Orryon response */}
      <div className="flex items-start gap-2">
        <Image src="/avatar.png" alt="Orryon" width={20} height={20} className="rounded-full object-cover mt-0.5 shrink-0" />
        <div className="bg-[#1a1a1a] border border-white/[0.06] rounded-2xl rounded-bl-sm px-3.5 py-2 text-[0.72rem] text-white/65 max-w-[88%] text-left leading-relaxed">
          Great month — you&rsquo;re down 8% overall. Dining is the only category running a bit hot, everything else is under budget.
          <span className="inline-block w-[1.5px] h-[0.8em] bg-white/35 ml-0.5 align-middle animate-pulse" />
        </div>
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 mt-1">
        <span className="flex-1 text-[0.65rem] text-white/20">Ask me anything…</span>
        <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <ArrowUp className="h-2.5 w-2.5 text-white/25" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

function DailyBriefPreview() {
  const items = [
    { Icon: TrendingDown, text: "Down 8% this week — on track",       accent: "text-green-400/70"  },
    { Icon: Bell,         text: "Doctor appointment today at 10am",    accent: "text-orange-400/70" },
    { Icon: Receipt,      text: "Netflix due in 5 days · $15.99",      accent: "text-white/35"      },
    { Icon: Target,       text: "Vacation fund at 68% — keep going",   accent: "text-blue-400/70"   },
  ];
  return (
    <div className="w-full px-1">
      <p className="text-[0.72rem] font-semibold text-white/70 mb-0.5">Good morning, Alex.</p>
      <p className="text-[0.58rem] text-white/25 mb-4">Here&rsquo;s your day at a glance.</p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.text} className="flex items-start gap-2.5">
            <div className="shrink-0 w-5 h-5 rounded-md border border-white/8 bg-white/[0.04] flex items-center justify-center mt-px">
              <item.Icon className={`h-2.5 w-2.5 ${item.accent}`} strokeWidth={1.5} />
            </div>
            <p className="text-[0.7rem] text-white/60 leading-snug">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SilentBreakPreview() {
  return (
    <div className="w-full px-1 flex flex-col items-center gap-5">
      {/* Timer ring */}
      <div className="relative flex items-center justify-center">
        <svg width="88" height="88" viewBox="0 0 88 88" className="rotate-[-90deg]">
          <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
          <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * 36 * 0.72} ${2 * Math.PI * 36}`}
            strokeLinecap="round" />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-[1.35rem] font-bold text-white/80 tabular-nums leading-none">3:36</span>
          <span className="text-[0.45rem] uppercase tracking-widest text-white/25 mt-0.5">remaining</span>
        </div>
      </div>
      {/* Status */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <Moon className="h-2.5 w-2.5 text-white/30" strokeWidth={1.5} />
          <span className="text-[0.6rem] text-white/60 tracking-wide">Silent · 5 min</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`w-1 h-1 rounded-full ${i < 2 ? "bg-white/40" : "bg-white/10"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

const WELLBEING_CARDS: FeatureCardData[] = [
  { tag: "BREATHING",    Icon: Wind,          highlighted: "A moment to reset,",  rest: "anytime you need it.",        from: "#04131e", to: "#08202e", glow: "rgba(96,165,250,0.12)",  preview: <BreathingPreview /> },
  { tag: "SILENT BREAK", Icon: Moon,          highlighted: "Step away.",          rest: "Come back clearer.",          from: "#08080f", to: "#10101e", glow: "rgba(148,130,255,0.10)", preview: <SilentBreakPreview /> },
  { tag: "DAILY BRIEF",  Icon: Sparkles,      highlighted: "Start every day",     rest: "with full clarity.",          from: "#110900", to: "#201500", glow: "rgba(251,191,36,0.12)",  preview: <DailyBriefPreview /> },
  { tag: "AI CHAT",      Icon: MessageCircle, highlighted: "Just talk.",           rest: "I handle everything else.",   from: "#0a0a0a", to: "#181820", glow: "rgba(255,255,255,0.06)", preview: <AIChatPreview /> },
];

const FEATURE_DATA: Record<FeatureTabKey, FeatureCardData[]> = {
  Finance:   FINANCE_CARDS,
  Organize:  ORGANIZE_CARDS,
  Wellbeing: WELLBEING_CARDS,
};

const CARD_GAP = 8;
const CARD_H = 460;

function getCardW() {
  if (typeof window === "undefined") return 260;
  if (window.innerWidth < 400) return 220;
  if (window.innerWidth < 640) return 248;
  return 280;
}

function FeatureSection() {
  const [activeTab, setActiveTab] = useState<FeatureTabKey>("Finance");
  const [cardsVisible, setCardsVisible] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [cardW, setCardW] = useState(260);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setCardW(getCardW());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const syncProgress = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollProgress(max > 0 ? el.scrollLeft / max : 0);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync indicator to scroll width on mount / tab change
    syncProgress();
    window.addEventListener("resize", syncProgress);
    return () => window.removeEventListener("resize", syncProgress);
  }, [activeTab]);

  const switchTab = (tab: FeatureTabKey) => {
    if (tab === activeTab) return;
    setCardsVisible(false);
    setTimeout(() => {
      setActiveTab(tab);
      setScrollProgress(0);
      setCardsVisible(true);
      if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    }, 160);
  };

  const nudge = (dir: "prev" | "next") => {
    const el = scrollRef.current;
    if (!el) return;
    const step = cardW + CARD_GAP;
    el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" });
  };

  const cards = FEATURE_DATA[activeTab];
  const atStart = scrollProgress <= 0.01;
  const atEnd   = scrollProgress >= 0.99;

  return (
    <section className="pt-0 pb-16 sm:pb-20 border-b border-white/5">
      {/* Header */}
      <div className="text-center px-4 sm:px-6 mb-8 sm:mb-10 pt-[48px] sm:pt-[60px]">
        <h2 className="text-[1.75rem] sm:text-[2.25rem] lg:text-[3rem] font-extrabold text-white/85 font-[family-name:var(--font-playfair)] leading-[1.25] mb-3 sm:mb-4">
          I handle the managing.<br />You do the living.
        </h2>
        <p className="text-sm sm:text-[15px] lg:text-base text-white/50 max-w-[300px] sm:max-w-[380px] lg:max-w-[480px] mx-auto leading-relaxed">
          For people who want less noise and more clarity.
        </p>
      </div>

      {/* Tabs hidden — Finance cards only */}
      {false && (
        <div className="flex justify-center gap-2 px-4 sm:px-6 mb-6 sm:mb-8 mt-[16px] sm:mt-[20px] flex-wrap">
          {FEATURE_TABS_LIST.map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className="px-4 sm:px-5 py-1.5 sm:py-2 rounded-full text-[0.7rem] sm:text-[0.75rem] font-semibold tracking-wider transition-all duration-200"
              style={{
                background: activeTab === tab ? "white" : "transparent",
                color: activeTab === tab ? "black" : "rgba(255,255,255,0.45)",
                border: activeTab === tab ? "1px solid white" : "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Carousel */}
      <div className="relative">
        {/* Scrollable track — edge to edge, no padding */}
        <div
          ref={scrollRef}
          onScroll={syncProgress}
          className="overflow-x-auto"
          style={{
            scrollbarWidth: "none",
            scrollSnapType: "x mandatory",
            scrollPaddingLeft: "clamp(16px, 8vw, 220px)",
            transition: "opacity 0.16s ease",
            opacity: cardsVisible ? 1 : 0,
          }}
        >
          <div className="flex" style={{ gap: CARD_GAP, paddingLeft: "clamp(16px, 8vw, 220px)", paddingRight: 24 }}>
            {cards.map((card) => {
              const Icon = card.Icon;
              return (
                <div
                  key={card.tag}
                  className="relative overflow-hidden shrink-0 flex flex-col"
                  style={{
                    width: cardW,
                    height: CARD_H,
                    scrollSnapAlign: "start",
                    borderRadius: "7px",
                    background: card.photo ? "black" : "#111111",
                  }}
                >
                  {/* Photo background */}
                  {card.photo && (
                    <>
                      <div className="absolute inset-0" style={{ backgroundImage: `url(${card.photo})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                      <div className="absolute inset-0 bg-black/30" />
                    </>
                  )}


                  {/* Top row */}
                  <div className="relative flex items-center justify-between p-4">
                    <div className="flex items-center gap-1.5 rounded-full bg-black/50 border border-white/10 px-3 py-1.5">
                      <Icon className="h-3 w-3 text-white/55" strokeWidth={1.5} />
                      <span className="text-[0.55rem] font-bold tracking-widest text-white/55">{card.tag}</span>
                    </div>
                  </div>

                  {/* Center — product preview or watermark icon */}
                  <div className="flex-1 flex items-center justify-center px-5">
                    {card.preview
                      ? <div className="w-full">{card.preview}</div>
                      : !card.photo && <Icon className="h-24 w-24 text-white/[0.04]" strokeWidth={0.4} />
                    }
                  </div>

                  {/* Bottom copy */}
                  <div
                    className="relative h-[110px] flex flex-col justify-start p-5"
                    style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)" }}
                  >
                    <p className="text-[1rem] font-bold leading-snug">
                      <span className="text-white">{card.highlighted}</span>{" "}
                      <span className="text-white/65">{card.rest}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Left arrow — overlaid, hidden at start */}
        {!atStart && (
          <button
            onClick={() => nudge("prev")}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
            style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
          >
            <ChevronLeft className="h-5 w-5 text-white/80" strokeWidth={1.5} />
          </button>
        )}

        {/* Right arrow — overlaid, hidden at end */}
        {!atEnd && (
          <button
            onClick={() => nudge("next")}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
            style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
          >
            <ChevronRight className="h-5 w-5 text-white/80" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Scroll progress line */}
      <div
        className="relative h-[2px] mt-4"
        style={{ marginLeft: "clamp(16px, 8vw, 220px)", marginRight: "clamp(16px, 8vw, 220px)", background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            width: "15%",
            left: `${scrollProgress * 85}%`,
            background: "rgba(255,255,255,0.7)",
            transition: "left 0.12s ease",
          }}
        />
      </div>
    </section>
  );
}

// ─── Orbit Section ────────────────────────────────────────────────────────────

const ORBIT_ITEMS = [
  { label: "Money",     sub: "Budgets, bills & goals",   Icon: BarChart2, color: "#60a5fa", glow: "rgba(96,165,250,0.20)"  },
  { label: "Tasks",     sub: "To-dos, lists & errands",  Icon: Check,     color: "#4ade80", glow: "rgba(74,222,128,0.20)"  },
  { label: "Calendar",  sub: "Events & reminders",       Icon: Calendar,  color: "#fb923c", glow: "rgba(251,146,60,0.20)"  },
  { label: "Notes",     sub: "Quick captures & ideas",   Icon: FileText,  color: "#fbbf24", glow: "rgba(251,191,36,0.20)"  },
  { label: "Journal",   sub: "Thoughts & entries",       Icon: BookOpen,  color: "#c084fc", glow: "rgba(192,132,252,0.20)" },
  { label: "Wellbeing", sub: "Breathing & clarity",      Icon: Wind,      color: "#2dd4bf", glow: "rgba(45,212,191,0.20)"  },
];

const ORBIT_R = 220;
const AVATAR_R = 77;  // avatar edge (51.5px) + 25px gap
const CIRCLE_R_INACTIVE = 61; // inactive circle edge + 25px gap
const CIRCLE_R_ACTIVE = 69;   // active circle edge + 25px gap
const CON_W = 660, CON_H = 580;
const OCX = CON_W / 2, OCY = CON_H / 2;
const ORBIT_DATA = [-90, -30, 30, 90, 150, 210].map((deg) => {
  const a = (deg * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  return { x: OCX + ORBIT_R * ux, y: OCY + ORBIT_R * uy, ux, uy };
});

function OrbitSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((p) => (p + 1) % ORBIT_ITEMS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="border-b border-white/5">
      <div className="text-center px-4 sm:px-6 pt-[80px] sm:pt-[100px] lg:pt-[122px] pb-8 sm:pb-10">
        <h2 className="text-[1.75rem] sm:text-[2.25rem] lg:text-[3rem] font-extrabold text-white/85 font-[family-name:var(--font-playfair)] leading-[1.25]">
          Everything you need to run your day —<br />
          <em>nothing you don&rsquo;t.</em>
        </h2>
      </div>

      {/* Desktop: radial orbit */}
      <div className="hidden sm:flex justify-center pb-16 overflow-x-hidden">
        <div className="relative scale-[0.72] sm:scale-[0.82] lg:scale-100 origin-top" style={{ width: CON_W, height: CON_H, overflow: "visible" }}>

          {/* Connecting lines — from avatar edge to circle edge */}
          <svg className="absolute inset-0" width={CON_W} height={CON_H} style={{ pointerEvents: "none" }}>
            {ORBIT_DATA.map((d, i) => {
              const isActive = active === i;
              const endGap = isActive ? CIRCLE_R_ACTIVE : CIRCLE_R_INACTIVE;
              return (
                <line
                  key={i}
                  x1={OCX + AVATAR_R * d.ux}
                  y1={OCY + AVATAR_R * d.uy}
                  x2={d.x - endGap * d.ux}
                  y2={d.y - endGap * d.uy}
                  stroke={isActive ? ORBIT_ITEMS[i].color : "rgba(255,255,255,0.06)"}
                  strokeWidth={isActive ? 1.5 : 1}
                  strokeDasharray={isActive ? undefined : "3 6"}
                  style={{ transition: "stroke 0.5s ease" }}
                />
              );
            })}
          </svg>

          {/* Center avatar */}
          <div className="absolute z-10" style={{ left: OCX, top: OCY, transform: "translate(-50%, -50%)" }}>
            <motion.div
              animate={{ y: [0, -6, 0], scale: [1, 1.025, 1] }}
              transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity }}
            >
              <Image src="/avatar.png" alt="Orryon" width={103} height={103} className="rounded-full object-cover ring-1 ring-white/10" />
            </motion.div>
          </div>

          {/* Orbit nodes */}
          {ORBIT_ITEMS.map((item, i) => {
            const d = ORBIT_DATA[i];
            const isActive = active === i;
            const Icon = item.Icon;
            const sz = isActive ? 80 : 64;
            const iconSz = isActive ? 28 : 22;
            return (
              <div
                key={item.label}
                className="absolute flex flex-col items-center z-10"
                style={{ left: d.x, top: d.y, transform: "translate(-50%, -50%)" }}
              >
                <div style={{
                  width: sz, height: sz, borderRadius: "50%",
                  border: `1.5px solid ${isActive ? item.color : "rgba(255,255,255,0.12)"}`,
                  background: "rgba(255,255,255,0.03)",
                  boxShadow: isActive ? `0 0 36px ${item.glow}` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.5s cubic-bezier(0.34,1.2,0.64,1)",
                }}>
                  <Icon style={{ width: iconSz, height: iconSz, color: isActive ? item.color : "rgba(255,255,255,0.25)", transition: "all 0.5s ease" }} strokeWidth={1.5} />
                </div>
                <div className="mt-2.5 text-center" style={{ opacity: isActive ? 1 : 0.3, transition: "opacity 0.5s ease" }}>
                  <p className="text-sm font-semibold text-white/85 leading-tight whitespace-nowrap">{item.label}</p>
                  <p className="text-[0.65rem] text-white/60 whitespace-nowrap">{item.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: animated grid */}
      <div className="sm:hidden px-4 pb-16">
        <div className="flex justify-center mb-8">
          <motion.div
            animate={{ y: [0, -6, 0], scale: [1, 1.025, 1] }}
            transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity }}
          >
            <Image src="/avatar.png" alt="Orryon" width={64} height={64} className="rounded-full object-cover ring-1 ring-white/10" />
          </motion.div>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-[360px] mx-auto">
          {ORBIT_ITEMS.map((item, i) => {
            const isActive = active === i;
            const Icon = item.Icon;
            return (
              <div
                key={item.label}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-500"
                style={{
                  borderColor: isActive ? item.color : "rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
                  border: `1.5px solid ${isActive ? item.color : "rgba(255,255,255,0.1)"}`,
                  background: "transparent",
                  transition: "all 0.5s ease",
                }}>
                  <Icon style={{ width: 16, height: 16, color: isActive ? item.color : "rgba(255,255,255,0.3)", transition: "color 0.5s ease" }} strokeWidth={1.5} />
                </div>
                <p className="text-[0.75rem] font-semibold text-white/85">{item.label}</p>
                <p className="text-[0.62rem] text-white/60 text-center leading-snug">{item.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Get the app button ───────────────────────────────────────────────────────


// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(hasToken());
  }, []);

  const navActions = loggedIn ? (
    <PillLink href="/home" variant="primary" size="sm">Go to app</PillLink>
  ) : (
    // Prior version was `text-xs text-white/50` plain text — the tap area
    // was only ~14px tall on iPhone, well under Apple's 44px min target.
    // Padded pill so it registers reliably on touch and matches Apple HIG.
    <Link
      href="/login?step=email"
      className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 hover:text-white hover:border-white/25 active:scale-[0.98] transition"
    >
      Sign in
    </Link>
  );

  const heroCta = loggedIn ? (
    <PillLink href="/home" size="sm">Go to app</PillLink>
  ) : (
    <PillLink href="/pricing" size="sm">Sign up</PillLink>
  );

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 lg:px-16 py-3.5 sm:py-4 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <span className="text-white font-extrabold tracking-widest uppercase text-[0.95rem] sm:text-[1.03rem] font-[family-name:var(--font-playfair)]">
          ORRYON
        </span>
        <div className="flex items-center gap-3">
          {navActions}
        </div>
      </nav>

      {/* Hero */}
      <FadeIn>
        <div className="flex flex-col items-center text-center pt-[90px] sm:pt-[150px] lg:pt-[210px] pb-0 px-4 sm:px-6 border-b border-white/5">
          <motion.div
            className="mt-0 mb-2.5 lg:mb-4"
            animate={{ y: [0, -6, 0], scale: [1, 1.025, 1] }}
            transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
          >
            <Image src="/avatar.png" alt="Orryon — otherworldly personal concierge" width={103} height={103} className="w-[100px] h-[100px] sm:w-[103px] sm:h-[103px] lg:w-[130px] lg:h-[130px] rounded-full object-cover ring-1 ring-white/10" />
          </motion.div>
          <p className="text-[0.9rem] sm:text-[1rem] lg:text-[1.15rem] text-white/65 mb-[6px]" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
            Hi, I&rsquo;m Orryon.
          </p>
          <p className="text-[0.6rem] sm:text-[0.65rem] lg:text-[0.75rem] uppercase tracking-[2px] text-white/65 mb-[28px] sm:mb-[36px] lg:mb-[48px] -mt-[3px]">
            Your all-in-one personal concierge
          </p>
          <h1 className="text-[1.85rem] sm:text-[2.75rem] lg:text-[3.25rem] font-extrabold text-white/85 mt-[10px] mb-[59px] sm:mb-[67px] lg:mb-[75px] font-[family-name:var(--font-playfair)] leading-[1.25] w-full max-w-[95vw] sm:max-w-[560px] lg:max-w-[860px]">
            Your guide to organized life
            <span className="hidden sm:inline"><br /></span>and calmer days.
          </h1>

          {/* See it in action — app tour */}
          <div className="w-full flex flex-col items-center">
            {/* CTA */}
            <div className="w-full max-w-lg px-4 sm:px-6 flex flex-col items-center gap-3 mb-[48px] sm:mb-[60px] mt-0">
              {heroCta}
            </div>

            <div className="mt-[40px] sm:mt-[50px] w-full flex justify-center text-left">
              <AppTourDemo />
            </div>

            {/* Trust signal — after the demo, before they decide */}
            <p className="text-[0.72rem] sm:text-xs lg:text-sm text-white/60 mt-[15px]">
              Orryon doesn&rsquo;t connect to your bank.<br />That&rsquo;s the point. Your data stays yours.
            </p>
          </div>
        </div>
      </FadeIn>

      <OrbitSection />

      <FeatureSection />

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes breatheOrb {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 16px rgba(90,163,216,.42), 0 0 6px rgba(90,163,216,.22);
          }
          50% {
            transform: scale(1.32);
            box-shadow: 0 0 44px rgba(90,163,216,.78), 0 0 20px rgba(90,163,216,.46);
          }
        }
        @keyframes wavebar {
          0%, 100% { height: 3px;  opacity: 0.35; }
          50%       { height: 14px; opacity: 0.85; }
        }
        @keyframes micglow {
          0%, 100% { box-shadow: 0 0 0 2px rgba(255,255,255,0.12); }
          50%       { box-shadow: 0 0 0 4px rgba(255,255,255,0.22), 0 0 12px rgba(255,255,255,0.10); }
        }
      `}</style>

      {/* Bottom CTA */}
      <section className="border-t border-white/5">
      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 sm:px-6 pt-12 pb-12 sm:pt-16 sm:pb-16 lg:pt-24 lg:pb-24 text-center flex flex-col items-center">
        {!loggedIn && (
          <>
            {/* Breathing orb */}
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.75, 0.92, 0.75] }}
              transition={{ duration: 5.5, ease: "easeInOut", repeat: Infinity }}
              className="mb-8 lg:mb-10"
              style={{
                width: 192,
                height: 192,
                borderRadius: "50%",
                background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
                boxShadow: "0 0 80px rgba(62,207,190,0.28), 0 0 160px rgba(100,170,220,0.14)",
              }}
            />

            <h2 className="text-[1.6rem] sm:text-2xl lg:text-4xl font-bold text-white/85 mb-3 sm:mb-4 lg:mb-5 font-[family-name:var(--font-playfair)]">
              Wellbeing should be free.<br />For everyone.
            </h2>
            <div className="space-y-4 mb-8 sm:mb-10 lg:mb-12 max-w-[460px] text-[0.82rem] sm:text-sm lg:text-base text-white/50 leading-relaxed">
              <p>That&rsquo;s why our wellness tools are free for everyone.</p>
              <p className="font-semibold text-white/70">Use them as much as you like.</p>
              <p>The advanced features are optional. Only pay if you use them.</p>
            </div>

            <PillLink href="/pricing" size="sm">Sign up</PillLink>

            {/* Divider */}
            <div className="w-px h-12 bg-white/10 mt-8 sm:mt-10 lg:mt-12 mb-8 sm:mb-10 lg:mb-12" />

            {/* Orryon avatar + CTA */}
            <motion.div
              className="mb-6 lg:mb-8"
              animate={{ y: [0, -6, 0], scale: [1, 1.025, 1] }}
              transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
            >
              <Image src="/avatar.png" alt="Orryon" width={103} height={103} className="rounded-full object-cover ring-1 ring-white/10 lg:w-[130px] lg:h-[130px]" />
            </motion.div>
            <h2 className="text-[1.6rem] sm:text-2xl lg:text-4xl font-bold text-white/85 mb-3 sm:mb-4 lg:mb-5 font-[family-name:var(--font-playfair)]">Less noise. More you.</h2>
            <p className="text-[0.82rem] sm:text-sm lg:text-base text-white/50 mb-8 sm:mb-10 lg:mb-12">Nothing to configure. Just talk to me.</p>
            <PillLink href="/pricing" size="sm">Get started</PillLink>
          </>
        )}

        {loggedIn && (
          <>
            {/* Breathing orb + belief statement */}
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.75, 0.92, 0.75] }}
              transition={{ duration: 5.5, ease: "easeInOut", repeat: Infinity }}
              className="mb-8 lg:mb-10"
              style={{
                width: 192,
                height: 192,
                borderRadius: "50%",
                background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
                boxShadow: "0 0 80px rgba(62,207,190,0.28), 0 0 160px rgba(100,170,220,0.14)",
              }}
            />
            <h2 className="text-[1.6rem] sm:text-2xl lg:text-4xl font-bold text-white/85 mb-3 sm:mb-4 lg:mb-5 font-[family-name:var(--font-playfair)]">Wellbeing should be free.<br />For everyone.</h2>
            <div className="space-y-4 mb-8 sm:mb-10 lg:mb-12 max-w-[460px] text-[0.82rem] sm:text-sm lg:text-base text-white/50 leading-relaxed">
              <p>That’s why our wellness tools are free for everyone.</p>
              <p className="font-semibold text-white/70">Use them as much as you like.</p>
              <p>The advanced features are optional. Only pay if you use them.</p>
            </div>

            <PillLink href="/breathe" size="sm">Try breathing — it&rsquo;s free</PillLink>

            {/* Divider */}
            <div className="w-px h-12 bg-white/10 mt-8 sm:mt-10 lg:mt-12 mb-8 sm:mb-10 lg:mb-12" />

            {/* Orryon avatar + CTA */}
            <motion.div
              className="mb-6 lg:mb-8"
              animate={{ y: [0, -6, 0], scale: [1, 1.025, 1] }}
              transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
            >
              <Image src="/avatar.png" alt="Orryon" width={103} height={103} className="rounded-full object-cover ring-1 ring-white/10 lg:w-[130px] lg:h-[130px]" />
            </motion.div>
            <h2 className="text-[1.6rem] sm:text-2xl lg:text-4xl font-bold text-white/85 mb-3 sm:mb-4 lg:mb-5 font-[family-name:var(--font-playfair)]">Less noise. More you.</h2>
            <p className="text-[0.82rem] sm:text-sm lg:text-base text-white/50 mb-8 sm:mb-10 lg:mb-12">Nothing to configure. Just talk to me.</p>
            <PillLink href="/home" size="sm">Access All Features</PillLink>
            
          </>
        )}
      </div>
      </section>

      <Footer />
    </div>
  );
}
