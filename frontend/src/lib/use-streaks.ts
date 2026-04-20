"use client";

import { useCallback, useEffect, useState } from "react";

export type Streak = {
  id: string;
  name: string;
  emoji?: string;
  targetDays?: number; // optional target length (no limit if undefined)
  createdAt: string;
  completions: string[]; // "YYYY-MM-DD"
};

export const MAX_STREAKS = 7;
export const TARGET_PRESETS = [21, 30, 66, 100] as const;
const STORAGE_KEY = "orryon_streaks";

// ── Date helpers ────────────────────────────────────────────────────────────

export function dateToKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateToKey(new Date());
}

// ── Streak math ─────────────────────────────────────────────────────────────

/**
 * Consecutive completed days ending today — or yesterday, as a one-day grace
 * so the streak doesn't read "0" until you've actually missed a day.
 */
export function calculateStreak(completions: string[]): number {
  if (completions.length === 0) return 0;
  const set = new Set(completions);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = dateToKey(today);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = dateToKey(yesterday);

  let cursor: Date;
  if (set.has(todayStr)) {
    cursor = new Date(today);
  } else if (set.has(yesterdayStr)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let count = 0;
  while (set.has(dateToKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

// ── Persistence ─────────────────────────────────────────────────────────────

function load(): Streak[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Streak[];
  } catch {
    return [];
  }
}

function persist(streaks: Streak[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(streaks));
  } catch {
    // quota / private-mode — swallow
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useStreaks() {
  const [streaks, setStreaks] = useState<Streak[]>([]);

  // Hydrate on client mount to avoid SSR/client mismatch.
  useEffect(() => {
    setStreaks(load());
  }, []);

  const save = useCallback((next: Streak[]) => {
    setStreaks(next);
    persist(next);
  }, []);

  const createStreak = useCallback(
    (name: string, emoji?: string, targetDays?: number): Streak | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      if (streaks.length >= MAX_STREAKS) return null;
      const s: Streak = {
        id: `sk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: trimmed,
        emoji: emoji?.trim() || undefined,
        targetDays: targetDays && targetDays > 0 ? targetDays : undefined,
        createdAt: new Date().toISOString(),
        completions: [],
      };
      save([...streaks, s]);
      return s;
    },
    [streaks, save]
  );

  const deleteStreak = useCallback(
    (id: string) => {
      save(streaks.filter((s) => s.id !== id));
    },
    [streaks, save]
  );

  const updateStreak = useCallback(
    (id: string, patch: Partial<Pick<Streak, "name" | "emoji" | "targetDays">>) => {
      save(
        streaks.map((s) =>
          s.id === id
            ? {
                ...s,
                name: patch.name !== undefined ? patch.name.trim() || s.name : s.name,
                emoji:
                  patch.emoji !== undefined
                    ? patch.emoji.trim() || undefined
                    : s.emoji,
                targetDays:
                  patch.targetDays !== undefined
                    ? patch.targetDays && patch.targetDays > 0
                      ? patch.targetDays
                      : undefined
                    : s.targetDays,
              }
            : s
        )
      );
    },
    [streaks, save]
  );

  const toggleDay = useCallback(
    (id: string, dateKey: string) => {
      save(
        streaks.map((s) => {
          if (s.id !== id) return s;
          const has = s.completions.includes(dateKey);
          return {
            ...s,
            completions: has
              ? s.completions.filter((c) => c !== dateKey)
              : [...s.completions, dateKey],
          };
        })
      );
    },
    [streaks, save]
  );

  return {
    streaks,
    maxStreaks: MAX_STREAKS,
    createStreak,
    deleteStreak,
    updateStreak,
    toggleDay,
  };
}
