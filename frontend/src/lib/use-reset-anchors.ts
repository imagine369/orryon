"use client";

import { useCallback, useEffect, useState } from "react";
import { useStreaks, calculateStreak } from "@/lib/use-streaks";

// ── Types ────────────────────────────────────────────────────────────────────

export type MoodState = "calm" | "clear" | "scattered" | "low" | "tense" | "energized";

export interface ResetCompletion {
  id: string;
  anchorId: string;
  date: string;         // "YYYY-MM-DD"
  duration: number;     // actual seconds completed
  preMood?: MoodState;
  postMood?: MoodState;
  note?: string;
  markedForStreak: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const COMPLETIONS_KEY   = "orryon_reset_completions";
const LAST_USED_KEY     = "orryon_reset_last_used";
const STREAK_ID         = "reset-anchor-daily";
const STREAK_NAME       = "Daily Reset Anchor";
const MIN_DURATION_SECS = 120; // 2 min minimum to count toward streak

// ── Persistence helpers ──────────────────────────────────────────────────────

function loadCompletions(): ResetCompletion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COMPLETIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistCompletions(items: ResetCompletion[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(items));
  } catch {}
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useResetAnchors() {
  const [completions, setCompletions] = useState<ResetCompletion[]>([]);
  const [lastUsedId,  setLastUsedId]  = useState<string | undefined>(undefined);
  const { streaks, createStreak, toggleDay } = useStreaks();

  // Hydrate on mount
  useEffect(() => {
    setCompletions(loadCompletions());
    const lu = window.localStorage.getItem(LAST_USED_KEY);
    if (lu) setLastUsedId(lu);
  }, []);

  // Ensure the dedicated Reset Anchor streak entry exists
  useEffect(() => {
    if (streaks.length === 0) return; // not yet loaded
    const has = streaks.some((s) => s.id === STREAK_ID);
    if (!has) {
      // Inject directly into localStorage so we bypass MAX_STREAKS cap check
      // and give it a fixed id rather than a generated one.
      const existing = (() => {
        try { return JSON.parse(window.localStorage.getItem("orryon_streaks") ?? "[]"); } catch { return []; }
      })();
      const alreadyThere = existing.some((s: { id: string }) => s.id === STREAK_ID);
      if (!alreadyThere) {
        const entry = {
          id: STREAK_ID,
          name: STREAK_NAME,
          createdAt: new Date().toISOString(),
          completions: [],
        };
        window.localStorage.setItem("orryon_streaks", JSON.stringify([...existing, entry]));
        // Trigger a storage event so useStreaks re-hydrates
        window.dispatchEvent(new Event("storage"));
      }
    }
  }, [streaks, createStreak]);

  const save = useCallback((next: ResetCompletion[]) => {
    setCompletions(next);
    persistCompletions(next);
  }, []);

  /** Record a new completion. Returns the created entry. */
  const addCompletion = useCallback(
    (params: {
      anchorId: string;
      duration: number;
      preMood?: MoodState;
    }): ResetCompletion => {
      const entry: ResetCompletion = {
        id: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        anchorId: params.anchorId,
        date: todayKey(),
        duration: params.duration,
        preMood: params.preMood,
        markedForStreak: false,
      };
      save([...completions, entry]);
      // Remember last-used anchor
      window.localStorage.setItem(LAST_USED_KEY, params.anchorId);
      setLastUsedId(params.anchorId);
      return entry;
    },
    [completions, save]
  );

  /** Update a completion with post-mood, note, and optionally mark for streak. */
  const updateCompletion = useCallback(
    (id: string, patch: Partial<Pick<ResetCompletion, "postMood" | "note" | "markedForStreak">>) => {
      const next = completions.map((c) => (c.id === id ? { ...c, ...patch } : c));
      save(next);
    },
    [completions, save]
  );

  /**
   * Mark today's streak for a given completion id.
   * Only does anything if the session lasted ≥ MIN_DURATION_SECS.
   */
  const markStreakForCompletion = useCallback(
    (completionId: string) => {
      const comp = completions.find((c) => c.id === completionId);
      if (!comp || comp.duration < MIN_DURATION_SECS) return;
      // Mark on completion record
      updateCompletion(completionId, { markedForStreak: true });
      // Toggle today's date on the reset streak entry
      toggleDay(STREAK_ID, todayKey());
    },
    [completions, updateCompletion, toggleDay]
  );

  /** True if today has already been marked for the reset anchor streak. */
  const markedToday = (() => {
    const streak = streaks.find((s) => s.id === STREAK_ID);
    if (!streak) return false;
    return streak.completions.includes(todayKey());
  })();

  /** Current streak count for the reset anchor habit. */
  const streakCount = (() => {
    const streak = streaks.find((s) => s.id === STREAK_ID);
    if (!streak) return 0;
    return calculateStreak(streak.completions);
  })();

  /** Today's completions (may be more than one if user runs multiple sessions). */
  const todayCompletions = completions.filter((c) => c.date === todayKey());

  return {
    completions,
    todayCompletions,
    lastUsedId,
    markedToday,
    streakCount,
    addCompletion,
    updateCompletion,
    markStreakForCompletion,
    minDurationSecs: MIN_DURATION_SECS,
  };
}
