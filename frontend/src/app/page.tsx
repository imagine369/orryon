"use client";

import Image from "next/image";
import Link from "next/link";
const StarEight = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <polygon points="12,2 13.5,8.3 19.1,4.9 15.7,10.5 22,12 15.7,13.5 19.1,19.1 13.5,15.7 12,22 10.5,15.7 4.9,19.1 8.3,13.5 2,12 8.3,10.5 4.9,4.9 10.5,8.3" />
  </svg>
);
import { useState, useEffect, useRef } from "react";
import { ArrowUp, Plus, Search, Bell, LayoutGrid, Settings, X, Mic, ChevronLeft, ChevronRight, TrendingDown } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { hasToken } from "@/lib/api";
import { FadeIn } from "@/components/motion";
import { motion } from "framer-motion";
import { Footer } from "@/components/footer";
import { PillLink } from "@/components/pill-cta";

const HOW_STEPS = [
  { n: "01", title: "Tell me what you need",        desc: "Speak naturally. I understand context, amounts, dates, and intent." },
  { n: "02", title: "I understand and act",          desc: "I log it, track it, and keep everything organized — no forms." },
  { n: "03", title: "Ask me anything. I'll give you real answers.", desc: "Your data is always in sync. Just ask." },
];

type HowPhase =
  | "s1-typing" | "s1-sending" | "s1-sent"
  | "s2-enter"  | "s2-show"    | "s2-wait"
  | "s3-typing" | "s3-sending" | "s3-thinking" | "s3-responding" | "s3-done";

const S1_PROMPT   = "Save $4,000 for a vacation by December";
const S3_PROMPT   = "Am I on track for my vacation goal?";
const S3_RESPONSE = "You're at $0 of $4,000. Save $444/mo to hit it by December.";

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
              <div className="px-4 pt-5 pb-3 space-y-3 min-h-[140px] flex flex-col justify-end">
                {bubble1 && (
                  <div className="flex justify-end">
                    <div className="bg-white/10 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[85%] text-white/85">{bubble1}</div>
                  </div>
                )}
                {thinking && (
                  <div className="flex items-start gap-2">
                    <Image src="/avatar.png" alt="Orryon" width={24} height={24} className="rounded-full object-cover mt-0.5 shrink-0" />
                    <div className="bg-[#111] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1 items-center">
                      {[0,1,2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-white/40" style={{ animation: `bounce 1s ease-in-out ${i*0.18}s infinite` }} />)}
                    </div>
                  </div>
                )}
                {response && (
                  <div className="flex items-start gap-2">
                    <Image src="/avatar.png" alt="Orryon" width={24} height={24} className="rounded-full object-cover mt-0.5 shrink-0" />
                    <div className="bg-[#111] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed text-gray-200 max-w-[85%]">
                      {response}
                      {phase === "s3-responding" && <span className="inline-block w-[1px] h-[0.8em] bg-white/40 ml-0.5 align-middle animate-pulse" />}
                    </div>
                  </div>
                )}
                {bubble2 && !thinking && !response && (
                  <div className="flex justify-end">
                    <div className="bg-white/10 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[85%] text-white/85">{bubble2}</div>
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
                <p className="text-[0.65rem] text-white/40 mb-3">{goalLabel}</p>
              )}
              <div style={{ transition: "opacity 0.4s ease, transform 0.4s ease", opacity: goalIn ? 1 : 0, transform: goalIn ? "translateY(0)" : "translateY(-8px)" }}>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">Vacation Fund</span>
                    <span className="text-sm font-bold text-green-400">0%</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-2">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-green-600/50" style={{ width: "0%" }} />
                  </div>
                  <div className="flex justify-between text-[0.7rem] text-white/30">
                    <span>$0 saved of $4,000</span>
                    <span>$4,000 to go · by Dec</span>
                  </div>
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">Emergency Fund</span>
                  <span className="text-sm font-bold text-green-400">32%</span>
                </div>
                <div className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-2">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-green-600/50" style={{ width: "32%" }} />
                </div>
                <div className="flex justify-between text-[0.7rem] text-white/30">
                  <span>$1,600 saved of $5,000</span>
                  <span>$3,400 to go</span>
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
    prompt: "Add coffee and breakfast $9.50",
    response: "Done — coffee & breakfast logged for $9.50.",
  },
  {
    prompt: "Help me save $4000 for a vacation by December",
    response: "Goal created. Save $444/mo to hit $4,000 by December.",
  },
  {
    prompt: "Add milk, eggs, bread, and chicken to my grocery list",
    response: "Added 4 items to your grocery list.",
  },
  {
    prompt: "Doctor appointment on July 15 at 10am",
    response: "Scheduled — doctor on July 15 at 10am.",
  },
  {
    prompt: "Give me a spending recap for this week",
    response: "This week: $284 across 12 transactions. Dining leads at $94.",
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
      <div className="px-4 pt-5 pb-3 space-y-3 min-h-[110px] flex flex-col justify-end">
        {userBubble.length > 0 && (
          <div className="flex justify-end">
            <div className="bg-white/10 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[80%] text-white/85">
              {userBubble}
            </div>
          </div>
        )}

        {phase === "thinking" && (
          <div className="flex items-start gap-2">
            <Image src="/avatar.png" alt="Orryon" width={24} height={24} className="rounded-full object-cover mt-0.5 shrink-0" />
            <div className="bg-[#111] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1 items-center">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-white/40"
                  style={{ animation: `bounce 1s ease-in-out ${i * 0.18}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}

        {(phase === "typing-response" || phase === "waiting") && responseText.length > 0 && (
          <div className="flex items-start gap-2">
            <Image src="/avatar.png" alt="Orryon" width={24} height={24} className="rounded-full object-cover mt-0.5 shrink-0" />
            <div className="bg-[#111] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed text-gray-200 max-w-[90%]">
              {responseText}
              {phase === "typing-response" && (
                <span className="inline-block w-[1px] h-[0.8em] bg-white/40 ml-0.5 align-middle animate-pulse" />
              )}
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

function AddBtn() {
  return (
    <button className="flex items-center justify-center w-7 h-7 rounded-full bg-white shrink-0">
      <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
    </button>
  );
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function BudgetScreen() {
  const cats = [
    { name: "Food & Dining",   spent: 320, planned: 400 },
    { name: "Transport",       spent: 95,  planned: 150 },
    { name: "Entertainment",   spent: 145, planned: 100 },
    { name: "Health",          spent: 60,  planned: 120 },
  ];
  const totalPlanned = cats.reduce((s, c) => s + c.planned, 0);
  const totalSpent   = cats.reduce((s, c) => s + c.spent, 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/30">Budget · April</p>
          <p className="text-lg font-bold">{fmt(totalPlanned)} <span className="text-sm font-normal text-white/30">/ {fmt(totalSpent)} spent</span></p>
        </div>
        <AddBtn />
      </div>
      {cats.map((c) => {
        const pct = Math.round((c.spent / c.planned) * 100);
        const bar = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-green-500";
        return (
          <div key={c.name} className="py-3 border-b border-white/5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="text-sm text-white/50">{fmt(c.spent)} / {fmt(c.planned)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
              <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[0.65rem] text-white/25">{pct}% used</span>
              <span className="text-[0.65rem] text-white/25">{fmt(Math.max(0, c.planned - c.spent))} left</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GoalsScreen() {
  const goals = [
    { name: "Vacation Fund",  current: 2720, target: 4000, extra: "89d left" },
    { name: "Emergency Fund", current: 1600, target: 5000, extra: "" },
    { name: "New Laptop",     current: 750,  target: 1200, extra: "45d left" },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/20">Goals</p>
        <AddBtn />
      </div>
      <div>
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.current / g.target) * 100));
          const bar = pct >= 75 ? "bg-green-400" : pct >= 40 ? "bg-green-500/70" : "bg-green-600/50";
          const remaining = Math.max(0, g.target - g.current);
          return (
            <div key={g.name} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">{g.name}</span>
                <span className="text-sm font-bold text-green-400">{pct}%</span>
              </div>
              <div className="relative h-2 rounded-full bg-white/5 overflow-hidden mb-2">
                <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[0.7rem] text-white/30">
                <span>{fmt(g.current)} saved of {fmt(g.target)}</span>
                <span>{fmt(remaining)} to go{g.extra ? ` · ${g.extra}` : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TodayScreen() {
  const tasks = [
    { title: "Pay credit card bill", priority: "high",   category: "finance" },
    { title: "Call dentist",         priority: "medium", category: "health" },
  ];
  const events = [
    { event_type: "event",    title: "Lunch with team",  description: "Noon at the usual spot" },
    { event_type: "reminder", title: "Grocery run",      description: "Milk, eggs, bread" },
  ];
  const priorityDot = (p: string) => p === "high" ? "bg-red-400" : p === "medium" ? "bg-yellow-400" : "bg-green-400";
  const typeLabel   = (t: string) => t === "bill_due" ? "Bill" : t === "reminder" ? "Reminder" : t === "errand" ? "Errand" : t === "task" ? "Task" : "Event";
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/20">Saturday, April 11</p>
        <AddBtn />
      </div>
      <div className="mb-6">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Due Today</p>
        {tasks.map((t) => (
          <div key={t.title} className="flex items-center gap-3 py-2.5 border-b border-white/5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${priorityDot(t.priority)}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/85">{t.title}</p>
              <p className="text-[0.65rem] text-white/25">{t.priority} priority · {t.category}</p>
            </div>
            <span className="text-[0.65rem] text-white/25 shrink-0">✓ Done</span>
          </div>
        ))}
      </div>
      <div>
        <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Today&apos;s Events</p>
        {events.map((e) => (
          <div key={e.title} className="flex items-start gap-3 py-2.5 border-b border-white/5">
            <span className="text-[0.6rem] uppercase tracking-wide text-white/30 mt-1 w-12 shrink-0">{typeLabel(e.event_type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/85">{e.title}</p>
              {e.description && <p className="text-[0.7rem] text-white/25 mt-0.5">{e.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesScreen() {
  const pinned = [
    { title: "Q2 Financial Goals",  date: "Apr 8", preview: "Review investment portfolio and rebalance..." },
  ];
  const notes = [
    { title: "Meal prep ideas",       date: "Apr 6", preview: "Chicken, rice, vegetables for the week..." },
    { title: "Book recommendations",  date: "Apr 3", preview: "The Psychology of Money, Die with Zero..." },
  ];
  const NoteRow = ({ title, date, preview }: { title: string; date: string; preview: string }) => (
    <button className="w-full text-left py-3 border-b border-white/5">
      <div className="flex items-baseline justify-between mb-0.5">
        <p className="text-sm font-semibold text-white/85 truncate flex-1 pr-3">{title}</p>
        <span className="text-[0.6rem] text-white/25 shrink-0">{date}</span>
      </div>
      <p className="text-[0.78rem] text-white/35 truncate">{preview}</p>
    </button>
  );
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/20">Notes</p>
        <AddBtn />
      </div>
      <div className="mb-2">
        <p className="text-[0.6rem] uppercase tracking-widest text-white/20 mb-1 px-0.5">Pinned</p>
        {pinned.map((n) => <NoteRow key={n.title} {...n} />)}
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest text-white/20 mb-1 mt-4 px-0.5">Notes</p>
        {notes.map((n) => <NoteRow key={n.title} {...n} />)}
      </div>
    </div>
  );
}

function BillsScreen() {
  const bills = [
    { name: "Netflix", amount: 15.99, frequency: "monthly", daysUntil: 12 },
    { name: "Spotify", amount: 9.99,  frequency: "monthly", daysUntil: 2 },
    { name: "iCloud",  amount: 2.99,  frequency: "monthly", daysUntil: -1 },
    { name: "Gym",     amount: 29.99, frequency: "monthly", daysUntil: 18 },
  ];
  const totalMonthly = bills.reduce((s, b) => s + b.amount, 0);
  const dueLabel = (d: number) => d < 0 ? "Overdue" : d === 0 ? "Due today" : d === 1 ? "Tomorrow" : `In ${d} days`;
  const dueClass = (d: number) => d < 0 ? "text-red-400" : d <= 3 ? "text-yellow-400" : "text-white/30";
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/25">Recurring Bills</p>
          <p className="text-lg font-bold text-white/85 mt-0.5">
            {fmt(totalMonthly)} <span className="text-sm font-normal text-white/30">/ month</span>
          </p>
        </div>
        <AddBtn />
      </div>
      {bills.map((b) => (
        <div key={b.name} className="flex items-center gap-3 py-3 border-b border-white/5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/85 truncate">{b.name}</p>
              <p className="text-sm font-semibold text-white/85 ml-3">{fmt(b.amount)}</p>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-[0.65rem] text-white/30">Monthly</p>
              <p className={`text-[0.65rem] ${dueClass(b.daysUntil)}`}>{dueLabel(b.daysUntil)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const APP_SCREENS = [
  { key: "budget", label: "Budget",  Component: BudgetScreen },
  { key: "goals",  label: "Goals",   Component: GoalsScreen },
  { key: "today",  label: "Today",   Component: TodayScreen },
  { key: "notes",  label: "Notes",   Component: NotesScreen },
  { key: "bills",  label: "Bills",   Component: BillsScreen },
];

function AppDemo() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % APP_SCREENS.length);
        setVisible(true);
      }, 300);
    }, 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idx]);

  const { Component, key } = APP_SCREENS[idx];

  return (
    <div className="mx-auto max-w-[340px]">
      {/* Tab bar — matches real dashboard TabsList */}
      <div className="flex items-center rounded-full border border-white/5 bg-[#111] p-0.5 mb-4 overflow-x-auto">
        {APP_SCREENS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => { setVisible(false); setTimeout(() => { setIdx(i); setVisible(true); }, 200); }}
            className="flex-1 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-200"
            style={{
              background: idx === i ? "rgba(255,255,255,0.1)" : "transparent",
              color: idx === i ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Screen frame */}
      <div
        className="rounded-2xl border border-white/8 bg-[#141414] px-4 pt-4 pb-5 min-h-[320px]"
        style={{ transition: "opacity 0.28s ease", opacity: visible ? 1 : 0 }}
      >
        <Component key={key} />
      </div>
    </div>
  );
}

// ─── App Tour Demo ────────────────────────────────────────────────────────────

type TourPhase =
  | "home" | "typing" | "sending" | "chat-bubble"
  | "thinking" | "responding" | "next-chat" | "clearing" | "pre-dash"
  | "tap-grid" | "panel-open"
  | "tab-budget" | "tab-schedule" | "tab-goals"
  | "panel-close" | "bell-tap" | "breathe-open" | "breathe-close" | "reset";

const TOUR_CHATS = [
  { prompt: "Add coffee and breakfast $12.50",                response: "Done — coffee & breakfast logged for $12.50." },
  { prompt: "Help me save $4,000 for a vacation by December", response: "Goal created. Save $444/mo to hit $4,000 by December." },
  { prompt: "How did I do with spending this month?",         response: "Great month — you're down 8% overall. Dining is your only category running a bit hot, everything else is under budget." },
  { prompt: "Pull up my grocery list",                        response: "Here's your list:\n• Greek yogurt\n• Oat milk\n• Sourdough\n• Chicken thighs\n• Cherry tomatoes\n• Spinach\n• Avocados\n• Olive oil" },
  { prompt: "Am I on track for my vacation goal?",            response: "You're at $2,720 of $4,000 — 68% there. Keep it up and you'll hit it with 3 weeks to spare." },
];

const TOUR_TABS = ["Insights","Budget","Schedule","Goals"] as const;
type TourTab = typeof TOUR_TABS[number];

const INSIGHT_COLORS = ["#60a5fa","#2dd4bf","#c084fc","#fbbf24","#818cf8","#86efac"];

function TourInsightsTab() {
  const cats = [
    { name: "Rent & Housing", total: 2200, pct: 77, color: "#60a5fa", trend: "+8%" },
    { name: "Food & Dining",  total: 386,  pct: 13, color: "#2dd4bf", trend: "+12%" },
    { name: "Groceries",      total: 173,  pct:  6, color: "#c084fc", trend: "-4%" },
    { name: "Transport",      total: 103,  pct:  4, color: "#fbbf24", trend: "+3%" },
  ];
  const pieData = cats.map((c) => ({ name: c.name, value: c.total }));
  const totalSpent = cats.reduce((s, c) => s + c.total, 0);

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button className="p-1 text-white/30"><ChevronLeft className="h-4 w-4" strokeWidth={1.5} /></button>
        <p className="text-sm font-semibold text-white/85">April 2026</p>
        <button className="p-1 text-white/30 opacity-20"><ChevronRight className="h-4 w-4" strokeWidth={1.5} /></button>
      </div>

      {/* Total */}
      <div className="text-center mb-1">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/25">Total Spent</p>
        <p className="text-3xl font-bold text-white/85 mt-0.5">${totalSpent.toLocaleString()}</p>
        <div className="flex items-center justify-center gap-1 mt-1">
          <TrendingDown className="h-3 w-3 text-green-400" strokeWidth={1.5} />
          <p className="text-xs text-green-400">↓ 8% vs last month</p>
        </div>
      </div>

      {/* Donut chart */}
      <div style={{ height: 170 }} className="w-full my-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
              {pieData.map((_, i) => (
                <Cell key={i} fill={INSIGHT_COLORS[i % INSIGHT_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Category rows */}
      <div>
        {cats.map((c, i) => (
          <div key={c.name} className="flex items-center gap-3 py-2.5 border-b border-white/5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: INSIGHT_COLORS[i] }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-white/85 truncate">{c.name}</p>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className={`text-xs ${c.trend.startsWith("+") ? "text-red-400" : "text-green-400"}`}>{c.trend}</span>
                  <span className="text-sm font-semibold text-white/85">${c.total.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: INSIGHT_COLORS[i] }} />
                </div>
                <span className="text-[0.6rem] text-white/25 w-7 text-right">{c.pct}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TourScheduleTab() {
  const days = ["S","M","T","W","T","F","S"];
  // April 2026 starts on Wednesday (index 3), has 30 days
  const startDay = 3;
  const totalDays = 30;
  const today = 11;
  // Days with events: { day: dots[] }
  const eventDots: Record<number, string[]> = {
    11: ["#60a5fa"],
    14: ["#2dd4bf"],
    16: ["#c084fc","#fbbf24"],
    20: ["#f87171"],
    25: ["#60a5fa"],
    28: ["#2dd4bf"],
  };
  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const events = [
    { icon: "🔔", title: "Doctor appointment",  date: "Apr 14" },
    { icon: "📅", title: "Lunch with team",      date: "Apr 16" },
    { icon: "💳", title: "Pay rent",              date: "Apr 20" },
    { icon: "📅", title: "Birthday party",        date: "Apr 25" },
  ];

  return (
    <div>
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-3">
        <button className="p-1 text-white/30"><ChevronLeft className="h-4 w-4" strokeWidth={1.5} /></button>
        <p className="text-sm font-semibold text-white/85">April 2026</p>
        <button className="p-1 text-white/30"><ChevronRight className="h-4 w-4" strokeWidth={1.5} /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {days.map((d, i) => (
          <div key={i} className="text-center text-[0.6rem] text-white/25 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-1 mb-5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isToday = day === today;
          const dots = eventDots[day];
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 py-0.5">
              <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium transition-colors
                ${isToday ? "bg-white text-black font-bold" : "text-white/70 hover:text-white"}`}>
                {day}
              </div>
              <div className="flex gap-0.5 h-1.5 items-center">
                {dots?.slice(0,2).map((color, j) => (
                  <span key={j} className="w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming events */}
      <p className="text-[0.65rem] uppercase tracking-wide text-white/30 mb-2">Upcoming</p>
      {events.map((e) => (
        <div key={e.title} className="flex items-start gap-3 py-2.5 border-b border-white/5">
          <span className="text-base mt-0.5 shrink-0">{e.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/85">{e.title}</p>
            <p className="text-[0.7rem] text-white/30">{e.date}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TourBudgetTab() {
  const cats = [
    { name: "Entertainment",  spent: 0,    planned: 100  },
    { name: "Food & Dining",  spent: 386,  planned: 600  },
    { name: "Groceries",      spent: 173,  planned: 400  },
    { name: "Health & Fitness",spent: 42,  planned: 150  },
    { name: "Rent & Housing", spent: 2200, planned: 2300 },
    { name: "Shopping",       spent: 0,    planned: 200  },
  ];
  const totalPlanned = cats.reduce((s, c) => s + c.planned, 0);
  const totalSpent   = cats.reduce((s, c) => s + c.spent, 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-wide text-white/30">Budget · 2026-04</p>
          <p className="text-lg font-bold">${totalPlanned.toLocaleString()} <span className="text-sm font-normal text-white/30">/ ${totalSpent.toLocaleString()} spent</span></p>
        </div>
        <button className="flex items-center justify-center w-7 h-7 rounded-full bg-white shrink-0">
          <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
        </button>
      </div>
      {cats.map((c) => {
        const pct = c.planned > 0 ? Math.round((c.spent / c.planned) * 100) : 0;
        const bar = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-green-500";
        return (
          <div key={c.name} className="py-3 border-b border-white/5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="text-sm text-white/50">${c.spent.toLocaleString()} / ${c.planned.toLocaleString()}</span>
            </div>
            <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
              <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[0.65rem] text-white/25">{pct}% used</span>
              <span className="text-[0.65rem] text-white/25">${Math.max(0, c.planned - c.spent).toLocaleString()} left</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TourGoalsTab() {
  const goals=[
    {name:"Vacation Fund",  current:2720,target:4000,pct:68},
    {name:"Emergency Fund", current:1600,target:5000,pct:32},
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[0.65rem] uppercase tracking-wide text-white/20">Goals</p>
        <button className="flex items-center justify-center w-6 h-6 rounded-full bg-white shrink-0"><Plus className="h-3 w-3 text-black" strokeWidth={2} /></button>
      </div>
      {goals.map((g)=>{
        const bar=g.pct>=75?"bg-green-400":g.pct>=40?"bg-green-500/70":"bg-green-600/50";
        return (
          <div key={g.name} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-xs">{g.name}</span>
              <span className="text-xs font-bold text-green-400">{g.pct}%</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-white/5 overflow-hidden mb-1.5">
              <div className={`absolute inset-y-0 left-0 rounded-full ${bar}`} style={{width:`${g.pct}%`}} />
            </div>
            <div className="flex justify-between text-[0.6rem] text-white/30">
              <span>${g.current.toLocaleString()} saved of ${g.target.toLocaleString()}</span>
              <span>${(g.target-g.current).toLocaleString()} to go</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AppTourDemo() {
  const [phase, setPhase]             = useState<TourPhase>("home");
  const [chatIdx, setChatIdx]         = useState(0);
  const [inputText, setInputText]     = useState("");
  const [sending, setSending]         = useState(false);
  const [currentBubble, setCurrentBubble] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [thinking, setThinking]       = useState(false);
  const [gridLit, setGridLit]         = useState(false);
  const [bellLit, setBellLit]         = useState(false);
  const [breatheOpen, setBreatheOpen] = useState(false);
  const [panelOpen, setPanelOpen]     = useState(false);
  const [activeTab, setActiveTab]     = useState<TourTab>("Insights");
  const [visible, setVisible]         = useState(true);
  const tmr         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const go = (next: TourPhase, delay: number) => { tmr.current = setTimeout(() => setPhase(next), delay); };

  useEffect(() => {
    if (tmr.current) clearTimeout(tmr.current);

    const chat = TOUR_CHATS[chatIdx];

    if (phase === "home") {
      setInputText(""); setCurrentBubble(""); setCurrentResponse(""); setThinking(false);
      setSending(false); setGridLit(false); setBellLit(false); setBreatheOpen(false);
      setPanelOpen(false); setActiveTab("Insights");
      setChatIdx(0); setVisible(true);
      go("typing", 900);
    }
    if (phase === "typing") {
      let i = 0;
      const type = () => {
        if (i <= chat.prompt.length) { setInputText(chat.prompt.slice(0,i)); i++; tmr.current = setTimeout(type, 32); }
        else go("sending", 200);
      };
      tmr.current = setTimeout(type, 150);
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
        if (i <= chat.response.length) { setCurrentResponse(chat.response.slice(0,i)); i++; tmr.current = setTimeout(type, 22); }
        else go("next-chat", 700);
      };
      tmr.current = setTimeout(type, 50);
    }
    if (phase === "next-chat") {
      setCurrentBubble(""); setCurrentResponse("");
      if (chatIdx < TOUR_CHATS.length - 1) {
        setPhase("clearing");
        setChatIdx(c => c + 1);
      } else {
        go("pre-dash", 200);
      }
    }
    if (phase === "clearing") { go("typing", 500); }
    if (phase === "pre-dash")    { go("tap-grid", 100); }
    if (phase === "tap-grid")    { setGridLit(true); go("panel-open", 200); }
    if (phase === "panel-open")  { setPanelOpen(true); setGridLit(false); go("tab-budget", 1200); }
    if (phase === "tab-budget")  { setActiveTab("Budget");   go("tab-schedule", 800); }
    if (phase === "tab-schedule"){ setActiveTab("Schedule"); go("tab-goals", 800); }
    if (phase === "tab-goals")   { setActiveTab("Goals");    go("panel-close", 800); }
    if (phase === "panel-close")  { setPanelOpen(false); go("bell-tap", 320); }
    if (phase === "bell-tap")     { setBellLit(true); go("breathe-open", 300); }
    if (phase === "breathe-open") { setBreatheOpen(true); setBellLit(false); go("breathe-close", 2500); }
    if (phase === "breathe-close"){ setBreatheOpen(false); go("reset", 250); }
    if (phase === "reset") {
      setVisible(false);
      tmr.current = setTimeout(() => setPhase("home"), 450);
    }
    return () => { if (tmr.current) clearTimeout(tmr.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, chatIdx]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentBubble, currentResponse, thinking]);

  const hasInput      = inputText.length > 0;
  // Stay in chat mode for subsequent messages once the conversation has started
  const isChatMode    = chatIdx > 0 || !["home","typing","sending"].includes(phase);
  const isTypingPhase = phase === "typing";

  return (
    <div className="w-full max-w-[320px] mx-auto" style={{ transition: "opacity 0.4s", opacity: visible ? 1 : 0 }}>
      {/* Phone shell */}
      <div className="relative rounded-[36px] overflow-hidden bg-black shadow-2xl" style={{ height: 600, border: "6px solid #1a1a1a", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 30px 60px rgba(0,0,0,0.7)" }}>

        {/* ── Main app content ── */}
        <div className="absolute inset-0 flex flex-col"
          style={{ transform: panelOpen ? "scale(0.93)" : "scale(1)", borderRadius: panelOpen ? 36 : 0, opacity: panelOpen ? 0.55 : 1, transition: "all 0.25s cubic-bezier(0.25,0.46,0.45,0.94)", transformOrigin: "center center" }}>

          {/* Nav bar — matches real app exactly */}
          <nav className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-xl border-b border-white/5 shrink-0">
            <span className="text-white font-extrabold tracking-widest uppercase text-[0.5rem] font-[family-name:var(--font-playfair)]">ORRYON</span>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-lg text-white/60"><Search className="h-2.5 w-2.5" strokeWidth={1.5} /></button>
              <button className={`relative p-2 rounded-lg transition-colors ${bellLit ? "text-white bg-white/5" : "text-white/60"}`}>
                <Bell className="h-2.5 w-2.5" strokeWidth={1.5} />
                <span className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-white" />
              </button>
              <button className={`p-2 rounded-lg transition-colors ${gridLit ? "text-white bg-white/5" : "text-white/60"}`}>
                <LayoutGrid className="h-2.5 w-2.5" strokeWidth={1.5} />
              </button>
              <button className="p-2 rounded-lg text-white/60"><Settings className="h-2.5 w-2.5" strokeWidth={1.5} /></button>
            </div>
          </nav>

          {/* Home screen */}
          {!isChatMode && (
            <div className="flex-1 flex flex-col items-center justify-center px-4" style={{ paddingBottom: "max(50px, calc(20px + env(safe-area-inset-bottom)))" }}>
              <Image src="/avatar.png" alt="Orryon" width={80} height={80} className="rounded-full object-cover mb-5 ring-1 ring-white/10" />
              <p className="text-white/60 text-[14px] mb-6 max-w-[220px] text-center leading-tight">
                Hello, Alex.<br />What shall we organize today?
              </p>
              <div className="mb-6 flex items-center gap-2 px-3.5 py-2 rounded-full border border-white/10 bg-white/[0.03]">
                <span className="text-white/30 text-sm">✦</span>
                <span className="text-xs text-white/50">Good evening. You have 1 task due today.</span>
              </div>
              <div className="w-full max-w-xl">
                <div className="flex items-center gap-2 rounded-full border bg-[#1c1c1e] px-4 py-2 transition-colors duration-200"
                  style={{ borderColor: hasInput ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)" }}>
                  <span className="flex-1 text-[15px] py-1.5 min-h-[1.5em]">
                    {hasInput
                      ? <span className="text-white/85">{inputText}{isTypingPhase && <span className="inline-block w-[1.5px] h-[0.85em] bg-white/60 ml-px align-middle animate-pulse" />}</span>
                      : <span className="text-white/35">Ask me anything…</span>}
                  </span>
                  <Mic className="h-5 w-5 text-white/40 shrink-0" strokeWidth={1.5} />
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
              <div ref={chatScrollRef} className="flex-1 px-4 py-4 space-y-2.5 flex flex-col overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                <div className="flex-1" />
                {currentBubble && (
                  <div className="flex justify-end" style={{ animation: "msgIn 0.22s ease-out both" }}>
                    <div className="bg-white/10 rounded-2xl rounded-br-sm px-3.5 py-2 text-sm max-w-[80%] text-white/85">{currentBubble}</div>
                  </div>
                )}
                {thinking && (
                  <div className="flex items-start gap-2" style={{ animation: "msgIn 0.18s ease-out both" }}>
                    <Image src="/avatar.png" alt="Orryon" width={20} height={20} className="rounded-full object-cover mt-1 shrink-0" />
                    <div className="bg-[#111] border border-white/5 rounded-2xl rounded-bl-sm px-3.5 py-2 flex gap-1 items-center">
                      {[0,1,2].map((i)=><span key={i} className="w-1 h-1 rounded-full bg-white/40" style={{animation:`bounce 1s ease-in-out ${i*0.18}s infinite`}} />)}
                    </div>
                  </div>
                )}
                {currentResponse && (
                  <div className="flex items-start gap-2" style={{ animation: "msgIn 0.18s ease-out both" }}>
                    <Image src="/avatar.png" alt="Orryon" width={20} height={20} className="rounded-full object-cover mt-1 shrink-0" />
                    <div className="bg-[#111] border border-white/5 rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm leading-relaxed text-gray-200 max-w-[85%] whitespace-pre-line text-left">
                      {currentResponse}
                      {phase === "responding" && <span className="inline-block w-[1px] h-[0.8em] bg-white/40 ml-0.5 align-middle animate-pulse" />}
                    </div>
                  </div>
                )}
              </div>
              <div className="shrink-0 px-4 pt-2 bg-gradient-to-t from-black via-black/90 to-transparent" style={{ paddingBottom: "max(50px, calc(20px + env(safe-area-inset-bottom)))" }}>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1c1e] px-4 py-2">
                  <span className="flex-1 text-[15px] py-1.5 min-h-[1.5em]">
                    {inputText
                      ? <span className="text-white/85">{inputText}</span>
                      : <span className="text-white/35">Ask me anything…</span>}
                  </span>
                  <Mic className="h-5 w-5 text-white/40 shrink-0" strokeWidth={1.5} />
                  <button className={`shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all ${sending ? "bg-white scale-100" : "bg-white/20 scale-95"}`}>
                    <ArrowUp className={`h-4 w-4 ${sending ? "text-black" : "text-white/40"}`} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Breathe panel (slides in from right, like the dashboard) ── */}
        <div className="absolute top-0 right-0 h-full z-[60] flex flex-col"
          style={{ width: "95%", transform: breatheOpen ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)" }}>
          <div className="h-full flex flex-col overflow-hidden rounded-l-2xl shadow-2xl"
            style={{ background: "linear-gradient(180deg, #0d2535 0%, #0e2a3a 50%, #0c2233 100%)" }}>

            {/* Panel header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.75)" }}>Today</p>
              <button className="transition" style={{ color: "rgba(255,255,255,0.35)" }}>
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Orb + copy */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
              <div
                className="rounded-full mb-8"
                style={{
                  width: 96,
                  height: 96,
                  background: "linear-gradient(135deg, hsl(200,45%,68%) 0%, hsl(205,40%,52%) 50%, hsl(210,38%,38%) 100%)",
                  animation: breatheOpen ? "breatheOrb 4.2s ease-in-out infinite" : "none",
                }}
              />
              <p style={{ color: "rgba(255,255,255,.60)", fontSize: "0.92rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                Take a breath
              </p>
              <p style={{ color: "rgba(255,255,255,.28)", fontSize: "0.62rem", letterSpacing: "0.07em", marginBottom: "0.85rem" }}>
                Box Breathing · 4 – 4 – 4 – 4
              </p>
              <p style={{ color: "rgba(255,255,255,.18)", fontSize: "0.62rem", textAlign: "center", lineHeight: 1.65, maxWidth: 190 }}>
                Pause everything and breathe — the orb expands as you inhale, contracts as you exhale.
              </p>
            </div>

          </div>
        </div>

        {/* ── Dashboard panel (slides in from right) ── */}
        <div className="absolute top-0 right-0 h-full flex flex-col"
          style={{ width: "95%", transform: panelOpen ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)" }}>
          <div className="h-full bg-[#141414] rounded-l-2xl shadow-2xl flex flex-col overflow-hidden">

            {/* Dashboard header */}
            <div className="px-5 pt-6 pb-4 border-b border-white/5 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-extrabold">Dashboard</h1>
                <button className="text-white/40 hover:text-white transition"><X className="h-4 w-4" strokeWidth={1.5} /></button>
              </div>
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="text-[0.6rem] uppercase tracking-wide text-white/30 mb-1">Net Balance</p>
                  <p className="text-xl font-bold text-white/85">$5,500</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="text-[0.6rem] uppercase tracking-wide text-white/30 mb-1">This Month</p>
                  <p className="text-xl font-bold text-white/85">$2,862</p>
                  <p className="text-[0.65rem] text-white/30 mt-0.5">spent</p>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="px-5 pt-4 shrink-0">
              <div className="flex rounded-full border border-white/5 bg-[#111] p-0.5">
                {TOUR_TABS.map((tab) => (
                  <button key={tab}
                    className="flex-1 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-200"
                    style={{ background: activeTab === tab ? "rgba(255,255,255,0.1)" : "transparent", color: activeTab === tab ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)" }}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6">
              {activeTab === "Insights"  && <TourInsightsTab />}
              {activeTab === "Budget"   && <TourBudgetTab />}
              {activeTab === "Schedule" && <TourScheduleTab />}
              {activeTab === "Goals"    && <TourGoalsTab />}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(hasToken());
  }, []);

  const navActions = loggedIn ? (
    <PillLink href="/home" variant="primary" size="sm">Go to app</PillLink>
  ) : (
    <Link href="/login" className="text-xs text-white/50 hover:text-white transition-colors tracking-wide">
      Sign in
    </Link>
  );

  const heroCta = loggedIn ? (
    <PillLink href="/home" size="sm">Go to app</PillLink>
  ) : (
    <>
      <PillLink href="/login" variant="primary" size="sm">Get started</PillLink>
      <Link href="/login" className="text-xs text-white/40 hover:text-white/70 transition-colors">
        Already have an account? Sign in
      </Link>
    </>
  );

  const closingCta = loggedIn ? (
    <PillLink href="/home" size="sm">Go to app</PillLink>
  ) : (
    <PillLink href="/login" variant="primary" size="sm">Get started</PillLink>
  );

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <span className="text-white font-extrabold tracking-widest uppercase text-[1.03rem] font-[family-name:var(--font-playfair)]">
          ORRYON
        </span>
        <div className="flex items-center gap-3">
          {navActions}
        </div>
      </nav>

      {/* Hero */}
      <FadeIn>
        <div className="flex flex-col items-center text-center pt-[100px] sm:pt-[160px] pb-16 px-6 border-b border-white/5">
          <motion.div
            className="mt-[100px] mb-2.5"
            animate={{ y: [0, -6, 0], scale: [1, 1.025, 1] }}
            transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
          >
            <Image src="/avatar.png" alt="Orryon — otherworldly personal concierge" width={103} height={103} className="rounded-full object-cover ring-1 ring-white/10" />
          </motion.div>
          <p className="text-[1rem] text-white/45 mb-[6px]" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
            Hi, I&rsquo;m Orryon.
          </p>
          <p className="text-[0.65rem] uppercase tracking-[2px] text-white/45 mb-[55px] -mt-[3px]">
            Your AI personal concierge
          </p>
          <h1 className="text-[2.5rem] sm:text-[3rem] font-extrabold text-white/85 mb-8 font-[family-name:var(--font-playfair)] leading-[1.3] max-w-[420px]">
            Talk to me.<br />I&rsquo;ll organize everything.
          </h1>
          <p className="text-[15px] text-white/65 max-w-[340px] leading-relaxed mb-10 font-medium">
            Budget, goals, schedule, notes, and bills —<br className="hidden sm:block" /> all through natural conversation. No forms.
          </p>

          {/* See it in action — app tour */}
          <div className="w-full flex flex-col items-center">
            {/* CTA */}
            <div className="flex flex-col items-center gap-3 mb-10">
              {heroCta}
            </div>

            <AppTourDemo />

            {/* Trust signal — after the demo, before they decide */}
            <p className="text-xs text-white/40 mt-10">
              Orryon doesn&rsquo;t connect to your bank.<br />That&rsquo;s the point. Your data stays yours.
            </p>
          </div>
        </div>
      </FadeIn>

      {/* How it works */}
      <div className="max-w-lg mx-auto px-6 text-center">
        <p className="text-[0.65rem] uppercase tracking-[4px] text-white/40 mb-10">How I work</p>
        <div className="space-y-0">
          {HOW_STEPS.map((s) => (
            <div key={s.n} className="py-6 border-b border-white/5 last:border-0">
              <span className="block text-[0.65rem] text-white/40 tracking-widest mb-2">{s.n}</span>
              <p className="text-sm font-semibold text-white/85 mb-1">{s.title}</p>
              <p className="text-xs text-white/60 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 py-10">
        <div className="flex-1 border-t border-white/5" />
        <StarEight className="w-2.5 h-2.5 text-white/20 shrink-0" />
        <div className="flex-1 border-t border-white/5" />
      </div>

      {/* What I can do — app demo */}
      <div className="max-w-lg mx-auto px-6 text-center">
        <p className="text-[0.65rem] uppercase tracking-[4px] text-white/40 mb-8">What I handle</p>
        <AppDemo />
      </div>

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
      `}</style>

      {/* Closing CTA */}
      <div className="max-w-lg mx-auto px-6 pt-12 pb-16 text-center">
        <h2 className="text-2xl font-bold text-white/85 mb-4 font-[family-name:var(--font-playfair)]">Ready to free yourself of chaos?</h2>
        <p className="text-sm text-white/50 mb-10">Nothing to configure. Just talk.</p>
        <div className="flex flex-col items-center gap-3">
          {closingCta}
        </div>
      </div>

      <Footer />
    </div>
  );
}
