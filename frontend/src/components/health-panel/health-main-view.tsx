"use client";

import { useState } from "react";
import { X, Plus, ChevronRight, Flame, Heart } from "lucide-react";
import {
  calculateStreak, MAX_STREAKS, type Streak,
} from "@/lib/use-streaks";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { ACCENT, TargetPicker } from "./shared";
import { BreatheSection } from "./breathe-section";
import { SleepSection } from "./sleep-section";
import { MoodSection } from "./mood-section";

interface HealthMainViewProps {
  streaks: Streak[];
  onOpenStreak: (id: string) => void;
  onCreate: (name: string, emoji?: string, targetDays?: number) => Streak | null;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function HealthMainView({ streaks, onOpenStreak, onCreate, onDelete, onClose }: HealthMainViewProps) {
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

  type HealthTab = "breathe" | "sleep" | "mood" | "streaks";
  const HEALTH_TABS: { key: HealthTab; label: string }[] = [
    { key: "breathe", label: "Breathe" },
    { key: "sleep",   label: "Sleep"   },
    { key: "mood",    label: "Mood"    },
    { key: "streaks", label: "Streaks" },
  ];
  const [activeTab, setActiveTab] = useState<HealthTab>("breathe");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-white/5 rounded-tl-2xl">
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

      {/* Tab bar — matches Quick Access pill style exactly */}
      <div className="px-5 py-3 shrink-0 border-b border-white/5">
        <div className="flex rounded-full border border-white/5 bg-[#111] p-0.5">
          {HEALTH_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex-1 rounded-full py-2.5 text-xs font-medium transition-all duration-200 min-h-[44px] flex items-center justify-center"
              style={{
                background: activeTab === key ? "rgba(255,255,255,0.1)" : "transparent",
                color: activeTab === key ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — all mounted, inactive tabs hidden (preserves range toggle state) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={activeTab === "breathe" ? undefined : "hidden"}>
          <BreatheSection />
        </div>
        <div className={activeTab === "sleep" ? undefined : "hidden"}>
          <SleepSection />
        </div>
        <div className={activeTab === "mood" ? undefined : "hidden"}>
          <MoodSection />
        </div>
        <div className={activeTab === "streaks" ? undefined : "hidden"}>
          <div className="px-5 pt-4 pb-5">
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
                          <span className="text-sm font-bold tabular-nums" style={{ color: ACCENT }}>
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
            {!creating && !atCap && (
              <button
                onClick={() => setCreating(true)}
                className="w-full mt-3 flex items-center justify-center gap-2 py-4 text-sm text-white/60 hover:text-white border border-white/[0.08] border-dashed rounded-xl hover:bg-white/[0.03] transition"
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                {`New streak (${streaks.length}/${MAX_STREAKS})`}
              </button>
            )}
            {!creating && atCap && (
              <p className="mt-3 text-xs text-white/20 text-center py-2">
                Maximum {MAX_STREAKS} streaks reached
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
