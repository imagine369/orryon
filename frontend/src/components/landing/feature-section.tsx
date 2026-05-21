"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUp,
  BarChart2,
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Dumbbell,
  FileText,
  Flame,
  List,
  MessageCircle,
  Moon,
  Receipt,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wind,
} from "lucide-react";

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
        <Image src="/avatar.png" alt="Orryon" width={20} height={20} className="rounded-full object-contain mt-0.5 shrink-0" />
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

export function FeatureSection() {
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
    <section className="pt-0 pb-16 sm:pb-20">
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
