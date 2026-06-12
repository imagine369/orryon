"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateToKey } from "@/lib/use-streaks";
import { useResetAnchors } from "@/lib/use-reset-anchors";
import { ACCENT, buildMonthGrid, monthLabel } from "./shared";

export function BreatheSection() {
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
    <div className="px-5 pt-4 pb-4">
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
