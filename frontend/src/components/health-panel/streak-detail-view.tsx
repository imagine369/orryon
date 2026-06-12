"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  calculateStreak, dateToKey, type Streak,
} from "@/lib/use-streaks";
import {
  ACCENT, TargetPicker, buildMonthGrid, describeWithTarget, monthLabel, weekdayShort,
} from "./shared";

interface StreakDetailViewProps {
  streak: Streak;
  onBack: () => void;
  onToggleDay: (dateKey: string) => void;
  onUpdate: (patch: Partial<Pick<Streak, "name" | "emoji" | "targetDays">>) => void;
}

export function StreakDetailView({ streak, onBack, onToggleDay, onUpdate }: StreakDetailViewProps) {
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

  const isCurrentMonth =
    displayMonth.getFullYear() === today.getFullYear() &&
    displayMonth.getMonth() === today.getMonth();

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
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="flex items-center justify-center w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/5 transition disabled:opacity-30 disabled:cursor-not-allowed"
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
