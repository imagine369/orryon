"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Plus, ChevronLeft, ChevronRight, Flame, Pencil, Wind, Heart, Moon, Smile,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import { usePanels } from "@/lib/panel-context";
import {
  useStreaks, calculateStreak, dateToKey, MAX_STREAKS, TARGET_PRESETS, type Streak,
} from "@/lib/use-streaks";
import { useResetAnchors } from "@/lib/use-reset-anchors";
import {
  useSleepLogs, build7d, build30d, build3m, type SleepDataPoint,
} from "@/lib/use-sleep-logs";
import {
  useMoodLogs, buildMood7d, buildMood30d, buildMood3m, type MoodDataPoint,
} from "@/lib/use-mood-logs";
import { SwipeToDelete } from "@/components/swipe-to-delete";

const ACCENT = "#ff9a14";

// ── Copy generators ──────────────────────────────────────────────────────────

function describeStreak(count: number): string {
  if (count === 0) return "Tap a day to begin. One tap, every day.";
  if (count === 1) return "Day one. Show up tomorrow.";
  if (count < 7)   return "Keep going — the early days matter most.";
  if (count === 7) return "A full week. Don't stop now.";
  if (count < 30)  return "Consistency compounds. Keep going.";
  if (count === 30) return "Thirty days. This is who you are now.";
  if (count < 100) return "You're building something real.";
  if (count === 100) return "One hundred days. Legend.";
  return "Unbreakable. Keep going.";
}

function describeWithTarget(count: number, target?: number): string {
  if (!target) return describeStreak(count);
  if (count === 0) return `A ${target}-day goal. Start today.`;
  if (count >= target) {
    const past = count - target;
    if (past === 0) return "Goal reached. Keep going — the chain is yours.";
    return `${past} day${past === 1 ? "" : "s"} past your ${target}-day goal.`;
  }
  const toGo = target - count;
  return `${count} of ${target} days · ${toGo} to go.`;
}

// ── Target preset chip row ───────────────────────────────────────────────────

function TargetPicker({
  value, onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <p className="text-[0.6rem] uppercase tracking-[2.5px] text-white/30 font-medium mb-2">
        Target <span className="text-white/20 normal-case tracking-normal">(optional)</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {TARGET_PRESETS.map((days) => {
          const selected = value === days;
          return (
            <button
              key={days}
              type="button"
              onClick={() => onChange(selected ? null : days)}
              className={
                "text-[0.65rem] font-medium px-2.5 py-1 rounded-full border transition " +
                (selected
                  ? "bg-white/10 border-white/25 text-white/85"
                  : "bg-transparent border-white/10 text-white/35 hover:border-white/25 hover:text-white/60")
              }
            >
              {days} days
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Calendar helpers ─────────────────────────────────────────────────────────

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
}

function weekdayShort(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function buildMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayFirst = (firstDay.getDay() + 6) % 7;
  const cells: { day: number | null; dateKey: string | null }[] = [];
  for (let i = 0; i < mondayFirst; i++) cells.push({ day: null, dateKey: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateKey });
  }
  return cells;
}

// ── Breathe Section ──────────────────────────────────────────────────────────

function BreatheSection() {
  const { completions, todayCompletions } = useResetAnchors();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = dateToKey(today);

  const [displayMonth, setDisplayMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const isCurrentMonth =
    displayMonth.getFullYear() === today.getFullYear() &&
    displayMonth.getMonth() === today.getMonth();

  // Map date → session count across all completions
  const sessionsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of completions) {
      const date = c.date || c.date_key || "";
      if (!date) continue;
      map[date] = (map[date] || 0) + 1;
    }
    return map;
  }, [completions]);

  // Count distinct days with sessions in the displayed month
  const daysThisMonth = useMemo(() => {
    const y = displayMonth.getFullYear();
    const m = String(displayMonth.getMonth() + 1).padStart(2, "0");
    const prefix = `${y}-${m}`;
    return Object.keys(sessionsByDate).filter((d) => d.startsWith(prefix)).length;
  }, [sessionsByDate, displayMonth]);

  const todaySessionCount = todayCompletions.length;

  const cells = useMemo(
    () => buildMonthGrid(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth]
  );

  const prevMonth = () =>
    setDisplayMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () =>
    setDisplayMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="px-5 pt-6 pb-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-5">
        <Wind className="h-4 w-4 text-white/50" strokeWidth={1.5} />
        <h2 className="text-xs font-semibold uppercase tracking-[2px] text-white/40">Breathe</h2>
      </div>

      {/* Month nav + label */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white/80 uppercase tracking-wide">
          {monthLabel(displayMonth)}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="flex items-center justify-center w-7 h-7 rounded-full text-white/50 hover:text-white hover:bg-white/5 transition"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="flex items-center justify-center w-7 h-7 rounded-full text-white/50 hover:text-white hover:bg-white/5 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-2 mb-3">
        {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
          <div
            key={i}
            className="text-[0.65rem] text-white/30 font-medium text-center uppercase tracking-wider"
          >
            {l}
          </div>
        ))}
      </div>

      {/* Dot grid */}
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell, i) => {
          if (!cell.day || !cell.dateKey) {
            return <div key={`pad-${i}`} aria-hidden />;
          }
          const isFuture = cell.dateKey > todayStr;
          const sessionCount = sessionsByDate[cell.dateKey] ?? 0;
          const hasSession = sessionCount >= 1;
          const isToday = cell.dateKey === todayStr;
          const isOrange = isToday && hasSession;

          const base =
            "aspect-square rounded-full flex items-center justify-center text-[0.7rem] font-medium tabular-nums";
          let cls = "";
          let style: React.CSSProperties = {};

          if (isOrange) {
            style = { backgroundColor: ACCENT };
            cls = "text-black/70";
          } else if (hasSession) {
            cls = "bg-white text-neutral-300";
          } else {
            cls = `border border-white/10 text-white/20 ${isFuture ? "cursor-not-allowed opacity-40" : ""}`;
          }

          return (
            <div
              key={cell.dateKey}
              aria-label={`${cell.day} — ${hasSession ? `${sessionCount} session${sessionCount !== 1 ? "s" : ""}` : "no session"}`}
              className={`${base} ${cls}`}
              style={style}
            >
              {cell.day}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <p className="text-xs text-white/35 mt-4">
        {isCurrentMonth ? (
          <>
            {todaySessionCount > 0
              ? `${todaySessionCount} session${todaySessionCount !== 1 ? "s" : ""} today`
              : "No sessions today yet"}
            {" · "}
            {daysThisMonth > 0
              ? `${daysThisMonth} day${daysThisMonth !== 1 ? "s" : ""} this month`
              : "Start this month"}
          </>
        ) : (
          daysThisMonth > 0
            ? `${daysThisMonth} day${daysThisMonth !== 1 ? "s" : ""} with sessions`
            : "No sessions this month"
        )}
      </p>

      {/* Empty state guidance */}
      {Object.keys(sessionsByDate).length === 0 && (
        <p className="text-xs text-white/20 mt-2">
          Complete a Reset Anchor session and it will appear here.
        </p>
      )}
    </div>
  );
}

// ── Shared range type (used by Sleep and Mood sections) ──────────────────────

type HealthRange = "7d" | "30d" | "3m";
const RANGE_LABELS: Record<HealthRange, string> = { "7d": "W", "30d": "M", "3m": "3M" };

// ── Sleep Section helpers ────────────────────────────────────────────────────

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function sleepBarColor(pt: SleepDataPoint): string {
  if (!pt.hasData) return "rgba(255,255,255,0.06)";
  if (pt.hours >= 7) return "rgba(134,239,172,0.75)";
  if (pt.hours >= 5) return "rgba(251,191,36,0.75)";
  return "rgba(248,113,113,0.75)";
}

function SleepTooltip({
  active,
  payload,
  range,
}: {
  active?: boolean;
  payload?: { payload: SleepDataPoint }[];
  range: HealthRange;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  if (!pt.hasData) return null;
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs">
      <p className="text-white/60 mb-0.5">
        {range === "3m" ? `Week of ${pt.label}` : pt.label}
      </p>
      <p className="text-white font-semibold">
        {fmtHours(pt.hours)}{range === "3m" ? " avg" : ""}
      </p>
    </div>
  );
}

// ── Sleep Section ─────────────────────────────────────────────────────────────

function SleepSection() {
  const { byDate, loading, summary } = useSleepLogs();
  const [range, setRange] = useState<HealthRange>("7d");

  const chartData = useMemo(() => {
    if (range === "7d") return build7d(byDate);
    if (range === "30d") return build30d(byDate);
    return build3m(byDate);
  }, [byDate, range]);

  const hasAnyData = Object.keys(byDate).length > 0;

  const rangeCaption =
    chartData.length > 0
      ? `${chartData[0].label} – ${chartData[chartData.length - 1].label}`
      : "";

  return (
    <div className="px-5 pt-6 pb-4">
      {/* Section header + range toggle */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4 text-white/50" strokeWidth={1.5} />
          <h2 className="text-xs font-semibold uppercase tracking-[2px] text-white/40">Sleep</h2>
        </div>
        {!loading && hasAnyData && (
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
            {(Object.keys(RANGE_LABELS) as HealthRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={
                  "px-2.5 py-1 rounded-md text-xs font-medium transition " +
                  (range === r
                    ? "bg-white/10 text-white/90"
                    : "text-white/35 hover:text-white/60")
                }
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-[90px] rounded-lg bg-white/[0.03] animate-pulse" />
      ) : !hasAnyData ? (
        <div className="h-[90px] rounded-lg bg-white/[0.03] flex items-center justify-center px-4">
          <p className="text-xs text-white/20 text-center">
            Tell orryon how you slept — e.g. &ldquo;I slept 7 hours last night&rdquo;
          </p>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div style={{ width: "100%", height: 90 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                barCategoryGap="12%"
              >
                <XAxis dataKey="label" hide />
                <YAxis domain={[0, 10]} hide />
                <ReferenceLine
                  y={7}
                  stroke="rgba(134,239,172,0.25)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <Tooltip
                  content={<SleepTooltip range={range} />}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="hours" radius={[2, 2, 0, 0]} maxBarSize={28} minPointSize={2}>
                  {chartData.map((pt, idx) => (
                    <Cell key={`sleep-cell-${idx}`} fill={sleepBarColor(pt)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Date range caption */}
          <p className="text-[0.6rem] text-white/20 mt-1 tracking-wide">{rangeCaption}</p>

          {/* Summary stats — always last 7 days regardless of chart range */}
          <div className="flex gap-5 mt-4">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                Last Night
              </p>
              <p className="text-sm font-bold text-white/80">{fmtHours(summary.lastNight)}</p>
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                7-Day Avg
              </p>
              <p className="text-sm font-bold text-white/80">{fmtHours(summary.weekAvg)}</p>
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                Best This Week
              </p>
              <p className="text-sm font-bold text-white/80">{fmtHours(summary.weekBest)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Mood Section helpers ─────────────────────────────────────────────────────

/** Format a mood score (1–5) for display. Whole numbers show without decimal. */
function fmtMoodScore(score: number | null): string {
  if (score === null) return "—";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function moodBarColor(pt: MoodDataPoint): string {
  if (!pt.hasData) return "rgba(255,255,255,0.06)";
  if (pt.value >= 4.5) return "rgba(134,239,172,0.80)";  // 5 — great
  if (pt.value >= 3.5) return "rgba(74,222,128,0.70)";   // 4 — good
  if (pt.value >= 2.5) return "rgba(251,191,36,0.70)";   // 3 — okay
  if (pt.value >= 1.5) return "rgba(251,146,60,0.70)";   // 2 — low
  return "rgba(248,113,113,0.75)";                        // 1 — rough
}

function MoodTooltip({
  active,
  payload,
  range,
}: {
  active?: boolean;
  payload?: { payload: MoodDataPoint }[];
  range: HealthRange;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  if (!pt.hasData) return null;
  const words = ["", "Rough", "Low", "Okay", "Good", "Great"];
  const label = Number.isInteger(pt.value) && pt.value >= 1 && pt.value <= 5
    ? words[Math.round(pt.value)]
    : null;
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs">
      <p className="text-white/60 mb-0.5">
        {range === "3m" ? `Week of ${pt.label}` : pt.label}
      </p>
      <p className="text-white font-semibold">
        {fmtMoodScore(pt.value)}{range === "3m" ? " avg" : label ? ` — ${label}` : ""}
      </p>
    </div>
  );
}

// ── Mood Section ──────────────────────────────────────────────────────────────

function MoodSection() {
  const { byDate, loading, summary } = useMoodLogs();
  const [range, setRange] = useState<HealthRange>("7d");

  const chartData = useMemo(() => {
    if (range === "7d") return buildMood7d(byDate);
    if (range === "30d") return buildMood30d(byDate);
    return buildMood3m(byDate);
  }, [byDate, range]);

  const hasAnyData = Object.keys(byDate).length > 0;

  const rangeCaption =
    chartData.length > 0
      ? `${chartData[0].label} – ${chartData[chartData.length - 1].label}`
      : "";

  return (
    <div className="px-5 pt-6 pb-4">
      {/* Section header + range toggle */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Smile className="h-4 w-4 text-white/50" strokeWidth={1.5} />
          <h2 className="text-xs font-semibold uppercase tracking-[2px] text-white/40">Mood</h2>
        </div>
        {!loading && hasAnyData && (
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
            {(Object.keys(RANGE_LABELS) as HealthRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={
                  "px-2.5 py-1 rounded-md text-xs font-medium transition " +
                  (range === r
                    ? "bg-white/10 text-white/90"
                    : "text-white/35 hover:text-white/60")
                }
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-[90px] rounded-lg bg-white/[0.03] animate-pulse" />
      ) : !hasAnyData ? (
        <div className="h-[90px] rounded-lg bg-white/[0.03] flex items-center justify-center px-4">
          <p className="text-xs text-white/20 text-center">
            Tell orryon how you&apos;re feeling — e.g. &ldquo;mood is 4 out of 5 today&rdquo;
          </p>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div style={{ width: "100%", height: 90 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                barCategoryGap="12%"
              >
                <XAxis dataKey="label" hide />
                <YAxis domain={[0, 5]} hide />
                <ReferenceLine
                  y={3}
                  stroke="rgba(255,255,255,0.10)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <Tooltip
                  content={<MoodTooltip range={range} />}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={28} minPointSize={2}>
                  {chartData.map((pt, idx) => (
                    <Cell key={`mood-cell-${idx}`} fill={moodBarColor(pt)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Date range caption */}
          <p className="text-[0.6rem] text-white/20 mt-1 tracking-wide">{rangeCaption}</p>

          {/* Summary stats — always last 7 days regardless of chart range */}
          <div className="flex gap-5 mt-4">
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                Today
              </p>
              <p className="text-sm font-bold text-white/80">{fmtMoodScore(summary.today)}</p>
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                7-Day Avg
              </p>
              <p className="text-sm font-bold text-white/80">{fmtMoodScore(summary.weekAvg)}</p>
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[2px] text-white/30 font-medium mb-0.5">
                Best This Week
              </p>
              <p className="text-sm font-bold text-white/80">{fmtMoodScore(summary.weekBest)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Health Main View (Breathe + Sleep + Mood + Active Streaks) ────────────────

interface HealthMainViewProps {
  streaks: Streak[];
  onOpenStreak: (id: string) => void;
  onCreate: (name: string, emoji?: string, targetDays?: number) => Streak | null;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function HealthMainView({ streaks, onOpenStreak, onCreate, onDelete, onClose }: HealthMainViewProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newTarget, setNewTarget] = useState<number | null>(null);

  const atCap = streaks.length >= MAX_STREAKS;

  const submit = () => {
    const s = onCreate(newName, newEmoji, newTarget ?? undefined);
    if (s) {
      setNewName("");
      setNewEmoji("");
      setNewTarget(null);
      setCreating(false);
    }
  };

  const cancel = () => {
    setCreating(false);
    setNewName("");
    setNewEmoji("");
    setNewTarget(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 sticky top-0 bg-[#080808] z-10 border-b border-white/5 rounded-tl-2xl">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-white" strokeWidth={1.5} />
          <h1 className="text-2xl font-extrabold">Health</h1>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
        </button>
      </div>

      {/* Breathe calendar section */}
      <BreatheSection />

      {/* Divider */}
      <div className="mx-5 border-t border-white/5" />

      {/* Sleep section */}
      <SleepSection />

      {/* Divider */}
      <div className="mx-5 border-t border-white/5" />

      {/* Mood section */}
      <MoodSection />

      {/* Divider */}
      <div className="mx-5 border-t border-white/5" />

      {/* Active Streaks section */}
      <div className="px-5 pt-5 pb-5 flex-1">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="h-4 w-4 text-white/50" strokeWidth={1.5} />
          <h2 className="text-xs font-semibold uppercase tracking-[2px] text-white/40">Active Streaks</h2>
        </div>

        {/* Empty state */}
        {streaks.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
              <Flame className="h-6 w-6 text-white/30" strokeWidth={1.5} />
            </div>
            <p className="text-[16px] text-white/60 mb-1">No streaks yet</p>
            <p className="text-sm text-white/40 max-w-[240px]">
              Create a daily habit to track. One tap a day — don&apos;t break the chain.
            </p>
          </div>
        )}

        {/* Streak cards */}
        <div className="space-y-3">
          {streaks.map((s) => {
            const count = calculateStreak(s.completions);
            return (
              <SwipeToDelete key={s.id} onDelete={() => onDelete(s.id)}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenStreak(s.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") onOpenStreak(s.id); }}
                  className="w-full flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:bg-white/[0.06] transition cursor-pointer select-none"
                >
                  <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 text-lg leading-none">
                    {s.emoji || <Flame className="h-4 w-4 text-white/40" strokeWidth={1.5} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-semibold text-white/90 truncate">{s.name}</p>
                    <p className="text-sm text-white/50 mt-0.5">
                      {count === 0
                        ? s.targetDays
                          ? `${s.targetDays}-day goal · start today`
                          : "Start today"
                        : s.targetDays
                          ? `${Math.min(count, s.targetDays)} / ${s.targetDays} days`
                          : `${count} day${count === 1 ? "" : "s"} · ${s.completions.length} total`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {count > 0 && (
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{ color: ACCENT }}
                      >
                        {count}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-white/20" strokeWidth={1.5} />
                  </div>
                </div>
              </SwipeToDelete>
            );
          })}
        </div>

        {/* Inline create form */}
        {creating && (
          <div className="mt-3 p-4 bg-white/[0.03] border border-white/[0.1] rounded-xl space-y-4">
            <div className="flex gap-2">
              <input
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                maxLength={8}
                placeholder="😀"
                className="w-14 text-center bg-white/5 border border-white/10 rounded-lg py-2 text-base outline-none focus:border-white/20"
                aria-label="Emoji (optional)"
              />
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") cancel();
                }}
                placeholder="Streak name — e.g. Workout"
                maxLength={40}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
              />
            </div>
            <TargetPicker value={newTarget} onChange={setNewTarget} />
            <div className="flex gap-2">
              <button
                onClick={cancel}
                className="flex-1 py-2 text-xs text-white/40 border border-white/10 rounded-lg hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!newName.trim()}
                className="flex-1 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* + New streak button */}
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            disabled={atCap}
            className="w-full mt-3 flex items-center justify-center gap-2 py-4 text-sm text-white/60 hover:text-white border border-white/[0.08] border-dashed rounded-xl hover:bg-white/[0.03] transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            {atCap
              ? `Maximum ${MAX_STREAKS} streaks`
              : `New streak (${streaks.length}/${MAX_STREAKS})`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Streak Detail View ───────────────────────────────────────────────────────

interface StreakDetailViewProps {
  streak: Streak;
  onBack: () => void;
  onToggleDay: (dateKey: string) => void;
  onUpdate: (patch: Partial<Pick<Streak, "name" | "emoji" | "targetDays">>) => void;
}

function StreakDetailView({ streak, onBack, onToggleDay, onUpdate }: StreakDetailViewProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = dateToKey(today);

  const [displayMonth, setDisplayMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(streak.name);
  const [editEmoji, setEditEmoji] = useState(streak.emoji ?? "");
  const [editTarget, setEditTarget] = useState<number | null>(streak.targetDays ?? null);

  useEffect(() => {
    queueMicrotask(() => {
      setEditName(streak.name);
      setEditEmoji(streak.emoji ?? "");
      setEditTarget(streak.targetDays ?? null);
      setEditing(false);
    });
  }, [streak.id, streak.name, streak.emoji, streak.targetDays]);

  const completed = useMemo(() => new Set(streak.completions), [streak.completions]);
  const streakCount = useMemo(() => calculateStreak(streak.completions), [streak.completions]);

  const streakEndKey = useMemo(() => {
    if (streakCount === 0) return null;
    if (completed.has(todayStr)) return todayStr;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = dateToKey(yesterday);
    if (completed.has(yKey)) return yKey;
    return null;
  }, [streakCount, completed, today, todayStr]);

  const orangeKey = useMemo(() => {
    if (!streak.targetDays) return streakEndKey;
    if (streakCount === 0 || !streakEndKey) return null;
    const endDate = new Date(`${streakEndKey}T00:00:00`);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (streakCount - 1));
    const goalDate = new Date(startDate);
    goalDate.setDate(goalDate.getDate() + (streak.targetDays - 1));
    return dateToKey(goalDate);
  }, [streak.targetDays, streakCount, streakEndKey]);

  const cells = useMemo(
    () => buildMonthGrid(displayMonth.getFullYear(), displayMonth.getMonth()),
    [displayMonth]
  );

  const prevMonth = () =>
    setDisplayMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () =>
    setDisplayMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const saveEdit = () => {
    const name = editName.trim();
    if (!name) return;
    onUpdate({
      name,
      emoji: editEmoji.trim() || undefined,
      targetDays: editTarget ?? 0,
    });
    setEditing(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 sticky top-0 bg-[#080808] z-10 border-b border-white/5 rounded-tl-2xl gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-white/60 hover:text-white transition shrink-0"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          Health
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {streak.emoji && <span className="text-base shrink-0">{streak.emoji}</span>}
          <span className="text-sm font-semibold text-white/80 truncate">{streak.name}</span>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors shrink-0"
          aria-label="Edit streak"
        >
          <Pencil className="h-3.5 w-3.5 text-white/50" strokeWidth={1.5} />
        </button>
      </div>

      {/* Edit drawer */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-white/5 bg-white/[0.02]"
          >
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <input
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  maxLength={8}
                  placeholder="😀"
                  className="w-14 text-center bg-white/5 border border-white/10 rounded-lg py-2 text-base outline-none focus:border-white/20"
                />
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
                  maxLength={40}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                />
              </div>
              <TargetPicker value={editTarget} onChange={setEditTarget} />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditName(streak.name);
                    setEditEmoji(streak.emoji ?? "");
                    setEditTarget(streak.targetDays ?? null);
                  }}
                  className="flex-1 py-2 text-xs text-white/40 border border-white/10 rounded-lg hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={!editName.trim()}
                  className="flex-1 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Streak number + description */}
      <div className="px-6 pt-10 pb-6">
        <div className="flex items-baseline gap-3">
          <span
            className="text-[4.5rem] leading-none font-bold tabular-nums"
            style={{ color: ACCENT }}
          >
            {streakCount}
          </span>
          <span className="text-2xl font-semibold text-white/85">
            Day Streak
          </span>
        </div>
        <p className="text-sm text-white/45 mt-4 leading-relaxed max-w-[32ch]">
          {describeWithTarget(streakCount, streak.targetDays)}
        </p>
      </div>

      <div className="mx-6 border-t border-white/5" />

      {/* Calendar block */}
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[5rem] leading-none font-bold text-white tabular-nums">
              {today.getDate()}
            </div>
            <div className="mt-3 text-sm font-semibold text-white/90 uppercase tracking-wide">
              {monthLabel(displayMonth)}
            </div>
          </div>
          <div className="text-sm text-white/80 font-medium pt-3">
            {weekdayShort(today)}
          </div>
        </div>

        {/* Month arrows */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="flex items-center justify-center w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/5 transition"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={nextMonth}
            aria-label="Next month"
            className="flex items-center justify-center w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/5 transition"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-2 mb-3">
          {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
            <div
              key={i}
              className="text-[0.65rem] text-white/30 font-medium text-center uppercase tracking-wider"
            >
              {l}
            </div>
          ))}
        </div>

        {/* Dot grid */}
        <div className="grid grid-cols-7 gap-2">
          {cells.map((cell, i) => {
            if (!cell.day || !cell.dateKey) {
              return <div key={`pad-${i}`} aria-hidden />;
            }
            const isFuture = cell.dateKey > todayStr;
            const isComplete = completed.has(cell.dateKey);
            const isOrange = cell.dateKey === orangeKey;

            const base =
              "aspect-square rounded-full transition active:scale-90 outline-none focus-visible:ring-2 focus-visible:ring-white/40 flex items-center justify-center text-[0.7rem] font-medium tabular-nums";
            let cls = "";
            let style: React.CSSProperties = {};

            if (isOrange) {
              style = { backgroundColor: ACCENT };
              cls = "hover:brightness-110 text-black/70";
            } else if (isComplete) {
              cls = "bg-white text-neutral-300 hover:bg-white/90";
            } else {
              cls = `border border-white/10 text-white/20 ${isFuture ? "cursor-not-allowed" : "hover:border-white/25 hover:text-white/40"}`;
            }

            return (
              <button
                key={cell.dateKey}
                onClick={() => { if (!isFuture) onToggleDay(cell.dateKey!); }}
                disabled={isFuture}
                aria-label={`${cell.day} — ${isComplete ? "completed" : "not completed"}${isOrange ? ", goal reached" : ""}`}
                aria-pressed={isComplete}
                className={`${base} ${cls}`}
                style={style}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Root panel ───────────────────────────────────────────────────────────────

export function HealthPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "health";

  const { streaks, createStreak, deleteStreak, updateStreak, toggleDay } = useStreaks();

  const [view, setView] = useState<"main" | "streak-detail">("main");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => {
      setView("main");
      setSelectedId(null);
    }, 300);
    return () => clearTimeout(t);
  }, [isOpen]);

  const selected = useMemo(
    () => streaks.find((s) => s.id === selectedId) ?? null,
    [streaks, selectedId]
  );

  useEffect(() => {
    queueMicrotask(() => {
      if (view === "streak-detail" && selectedId && !selected) {
        setView("main");
        setSelectedId(null);
      }
    });
  }, [view, selectedId, selected]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="health-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={close}
          />

          <motion.div
            key="health-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.2 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 500) close();
            }}
            className="fixed top-0 right-0 h-full z-50 flex flex-col"
            style={{ width: "95vw", maxWidth: 600 }}
          >
            <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl overflow-hidden flex flex-col">
              <AnimatePresence mode="wait" initial={false}>
                {view === "main" && (
                  <motion.div
                    key="main"
                    initial={{ x: -24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -24, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex-1 flex flex-col min-h-0"
                  >
                    <HealthMainView
                      streaks={streaks}
                      onOpenStreak={(id) => { setSelectedId(id); setView("streak-detail"); }}
                      onCreate={(name, emoji, targetDays) => createStreak(name, emoji, targetDays)}
                      onDelete={deleteStreak}
                      onClose={close}
                    />
                  </motion.div>
                )}
                {view === "streak-detail" && selected && (
                  <motion.div
                    key={`streak-detail-${selected.id}`}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex-1 flex flex-col min-h-0"
                  >
                    <StreakDetailView
                      streak={selected}
                      onBack={() => setView("main")}
                      onToggleDay={(k) => toggleDay(selected.id, k)}
                      onUpdate={(patch) => updateStreak(selected.id, patch)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
