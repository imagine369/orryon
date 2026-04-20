"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Plus, ChevronLeft, ChevronRight, Flame, Pencil,
} from "lucide-react";
import { usePanels } from "@/lib/panel-context";
import {
  useStreaks, calculateStreak, dateToKey, MAX_STREAKS, TARGET_PRESETS, type Streak,
} from "@/lib/use-streaks";
import { SwipeToDelete } from "@/components/swipe-to-delete";

// Reuse the existing priority-P2 orange so the accent matches other app accents.
const ACCENT = "#ff9a14";

// ── Copy generator ──────────────────────────────────────────────────────────

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
    if (past === 0) return `Goal reached. Keep going — the chain is yours.`;
    return `${past} day${past === 1 ? "" : "s"} past your ${target}-day goal.`;
  }
  const toGo = target - count;
  return `${count} of ${target} days · ${toGo} to go.`;
}

// ── Target preset chip row ──────────────────────────────────────────────────

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

// ── Calendar helpers ────────────────────────────────────────────────────────

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
}

function weekdayShort(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function buildMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first: Mon=0, Sun=6
  const mondayFirst = (firstDay.getDay() + 6) % 7;
  const cells: { day: number | null; dateKey: string | null }[] = [];
  for (let i = 0; i < mondayFirst; i++) cells.push({ day: null, dateKey: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateKey });
  }
  return cells;
}

// ── Root panel ──────────────────────────────────────────────────────────────

export function StreakPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "streaks";

  const { streaks, createStreak, deleteStreak, updateStreak, toggleDay } = useStreaks();

  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reset to list view a bit after the panel closes, so re-open feels fresh.
  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => {
      setView("list");
      setSelectedId(null);
    }, 300);
    return () => clearTimeout(t);
  }, [isOpen]);

  const selected = useMemo(
    () => streaks.find((s) => s.id === selectedId) ?? null,
    [streaks, selectedId]
  );

  // If the selected streak gets deleted externally, bounce back to the list.
  useEffect(() => {
    if (view === "detail" && selectedId && !selected) {
      setView("list");
      setSelectedId(null);
    }
  }, [view, selectedId, selected]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="streak-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={close}
          />

          <motion.div
            key="streak-panel"
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
                {view === "list" && (
                  <motion.div
                    key="list"
                    initial={{ x: -24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -24, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex-1 flex flex-col min-h-0"
                  >
                    <StreakListView
                      streaks={streaks}
                      onOpen={(id) => { setSelectedId(id); setView("detail"); }}
                      onCreate={(name, emoji, targetDays) => createStreak(name, emoji, targetDays)}
                      onDelete={deleteStreak}
                      onClose={close}
                    />
                  </motion.div>
                )}
                {view === "detail" && selected && (
                  <motion.div
                    key={`detail-${selected.id}`}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex-1 flex flex-col min-h-0"
                  >
                    <StreakDetailView
                      streak={selected}
                      onBack={() => setView("list")}
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

// ── List view ───────────────────────────────────────────────────────────────

interface StreakListViewProps {
  streaks: Streak[];
  onOpen: (id: string) => void;
  onCreate: (name: string, emoji?: string, targetDays?: number) => Streak | null;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function StreakListView({
  streaks, onOpen, onCreate, onDelete, onClose,
}: StreakListViewProps) {
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
          <Flame className="h-5 w-5 text-white" strokeWidth={1.5} />
          <h1 className="text-2xl font-extrabold">Streaks</h1>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
        </button>
      </div>

      <div className="px-5 py-5 flex-1 space-y-3">
        {/* Empty state */}
        {streaks.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
              <Flame className="h-6 w-6 text-white/30" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-white/60 mb-1">No streaks yet</p>
            <p className="text-xs text-white/30 max-w-[240px]">
              Create a daily habit to track. One tap a day — don&apos;t break the chain.
            </p>
          </div>
        )}

        {/* Streak cards */}
        {streaks.map((s) => {
          const count = calculateStreak(s.completions);
          return (
            <SwipeToDelete key={s.id} onDelete={() => onDelete(s.id)}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpen(s.id)}
                onKeyDown={(e) => { if (e.key === "Enter") onOpen(s.id); }}
                className="w-full flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:bg-white/[0.06] transition cursor-pointer select-none"
              >
                <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 text-lg leading-none">
                  {s.emoji || <Flame className="h-4 w-4 text-white/40" strokeWidth={1.5} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/90 truncate">{s.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
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

        {/* Inline create form */}
        {creating && (
          <div className="p-4 bg-white/[0.03] border border-white/[0.1] rounded-xl space-y-4">
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

        {/* + New button */}
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            disabled={atCap}
            className="w-full flex items-center justify-center gap-2 py-4 text-sm text-white/60 hover:text-white border border-white/[0.08] border-dashed rounded-xl hover:bg-white/[0.03] transition disabled:opacity-30 disabled:cursor-not-allowed"
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

// ── Detail view ─────────────────────────────────────────────────────────────

interface StreakDetailViewProps {
  streak: Streak;
  onBack: () => void;
  onToggleDay: (dateKey: string) => void;
  onUpdate: (patch: Partial<Pick<Streak, "name" | "emoji">>) => void;
}

function StreakDetailView({
  streak, onBack, onToggleDay, onUpdate,
}: StreakDetailViewProps) {
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

  // Keep edit fields in sync when the viewed streak changes.
  useEffect(() => {
    setEditName(streak.name);
    setEditEmoji(streak.emoji ?? "");
    setEditTarget(streak.targetDays ?? null);
    setEditing(false);
  }, [streak.id, streak.name, streak.emoji, streak.targetDays]);

  const completed = useMemo(() => new Set(streak.completions), [streak.completions]);
  const streakCount = useMemo(
    () => calculateStreak(streak.completions),
    [streak.completions]
  );

  // The "tip" of the current active streak — either today (if complete)
  // or yesterday (grace period). Used as the orange marker ONLY when the
  // streak has no target; otherwise orange is reserved for goal completion.
  const streakEndKey = useMemo(() => {
    if (streakCount === 0) return null;
    if (completed.has(todayStr)) return todayStr;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = dateToKey(yesterday);
    if (completed.has(yKey)) return yKey;
    return null;
  }, [streakCount, completed, today, todayStr]);

  // Orange highlight rule:
  //   • With a target: orange ALWAYS sits on the goal day — the day the user
  //     will reach (or did reach) their target, computed from the start of
  //     the current active streak. Aspirational when future, achievement
  //     when past. Hidden only when there's no active streak to anchor it.
  //   • Without a target: orange sits on the current streak tip.
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
      targetDays: editTarget ?? 0, // 0 clears target in updateStreak
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
          Streaks
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
              // One uniform outline for every uncompleted day — past, today, future.
              cls = `border border-white/10 text-white/20 ${isFuture ? "cursor-not-allowed" : "hover:border-white/25 hover:text-white/40"}`;
            }

            return (
              <button
                key={cell.dateKey}
                onClick={() => {
                  if (!isFuture) onToggleDay(cell.dateKey!);
                }}
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
