"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, isDemoMode } from "@/lib/api";

export type Streak = {
  id: string;
  name: string;
  emoji?: string;
  target_days?: number;
  targetDays?: number;
  createdAt: string;
  created_at?: string;
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

// ── localStorage helpers (demo mode + write-through cache) ──────────────────

function loadLocal(): Streak[] {
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

function persistLocal(streaks: Streak[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(streaks));
  } catch {
    // quota / private-mode
  }
}

function normalizeStreak(s: Record<string, unknown>): Streak {
  return {
    id: (s.id as string) || "",
    name: (s.name as string) || "",
    emoji: (s.emoji as string) || undefined,
    target_days: (s.target_days as number) ?? (s.targetDays as number) ?? undefined,
    targetDays: (s.target_days as number) ?? (s.targetDays as number) ?? undefined,
    createdAt: (s.created_at as string) || (s.createdAt as string) || new Date().toISOString(),
    created_at: (s.created_at as string) || (s.createdAt as string) || new Date().toISOString(),
    completions: (s.completions as string[]) || [],
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useStreaks() {
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const fetchedRef = useRef(false);

  // Hydrate: read localStorage first for instant render, then fetch from API
  useEffect(() => {
    const local = loadLocal();
    if (local.length > 0) setStreaks(local);

    if (isDemoMode()) return;

    if (fetchedRef.current) return;
    fetchedRef.current = true;

    api.get<Record<string, unknown>[]>("/api/streaks")
      .then((serverStreaks) => {
        const normalized = serverStreaks.map(normalizeStreak);
        setStreaks(normalized);
        persistLocal(normalized);
      })
      .catch(() => {
        // API unavailable — keep localStorage data
      });
  }, []);

  const save = useCallback((next: Streak[]) => {
    setStreaks(next);
    persistLocal(next);
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
        target_days: targetDays && targetDays > 0 ? targetDays : undefined,
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        completions: [],
      };
      save([...streaks, s]);

      if (!isDemoMode()) {
        api.post("/api/streaks", {
          name: trimmed,
          emoji: emoji?.trim() || "",
          target_days: targetDays && targetDays > 0 ? targetDays : null,
          id: s.id,
        }).catch(() => {});
      }
      return s;
    },
    [streaks, save]
  );

  const deleteStreak = useCallback(
    (id: string) => {
      save(streaks.filter((s) => s.id !== id));
      if (!isDemoMode()) {
        api.delete(`/api/streaks/${id}`).catch(() => {});
      }
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
                target_days:
                  patch.targetDays !== undefined
                    ? patch.targetDays && patch.targetDays > 0
                      ? patch.targetDays
                      : undefined
                    : s.target_days,
              }
            : s
        )
      );
      if (!isDemoMode()) {
        const apiPatch: Record<string, unknown> = {};
        if (patch.name !== undefined) apiPatch.name = patch.name.trim();
        if (patch.emoji !== undefined) apiPatch.emoji = patch.emoji.trim();
        if (patch.targetDays !== undefined)
          apiPatch.target_days = patch.targetDays && patch.targetDays > 0 ? patch.targetDays : null;
        api.patch(`/api/streaks/${id}`, apiPatch).catch(() => {});
      }
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
      if (!isDemoMode()) {
        api.post(`/api/streaks/${id}/days`, { date_key: dateKey }).catch(() => {});
      }
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
