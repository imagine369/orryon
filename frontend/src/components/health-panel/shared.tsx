"use client";

import { TARGET_PRESETS } from "@/lib/use-streaks";

export const ACCENT = "#ff9a14";

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

export function describeWithTarget(count: number, target?: number): string {
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

export function TargetPicker({
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

export function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
}

export function weekdayShort(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function buildMonthGrid(year: number, month: number) {
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

export type HealthRange = "7d" | "30d" | "3m";
export const RANGE_LABELS: Record<HealthRange, string> = { "7d": "W", "30d": "M", "3m": "3M" };
