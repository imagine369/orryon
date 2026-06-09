"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { api, isDemoMode } from "@/lib/api";
import { useStreaks, calculateStreak } from "@/lib/use-streaks";

// ── Types ────────────────────────────────────────────────────────────────────

export type MoodState = "calm" | "clear" | "scattered" | "low" | "tense" | "energized";

export interface ResetCompletion {
  id: string;
  anchorId: string;
  anchor_id?: string;
  date: string;         // "YYYY-MM-DD"
  date_key?: string;
  duration: number;
  preMood?: MoodState;
  pre_mood?: string;
  postMood?: MoodState;
  post_mood?: string;
  note?: string;
  markedForStreak: boolean;
  marked_for_streak?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const COMPLETIONS_KEY   = "orryon_reset_completions";
const LAST_USED_KEY     = "orryon_reset_last_used";
const STREAK_ID         = "reset-anchor-daily";
const STREAK_NAME       = "Daily Reset Anchor";
const MIN_DURATION_SECS = 120;

// ── localStorage helpers ────────────────────────────────────────────────────

function loadCompletionsLocal(): ResetCompletion[] {
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

function persistCompletionsLocal(items: ResetCompletion[]) {
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

function normalizeCompletion(r: Record<string, unknown>): ResetCompletion {
  return {
    id: (r.id as string) || "",
    anchorId: (r.anchor_id as string) || (r.anchorId as string) || "",
    anchor_id: (r.anchor_id as string) || (r.anchorId as string) || "",
    date: (r.date_key as string) || (r.date as string) || "",
    date_key: (r.date_key as string) || (r.date as string) || "",
    duration: (r.duration as number) || 0,
    preMood: (r.pre_mood as MoodState) || (r.preMood as MoodState) || undefined,
    pre_mood: (r.pre_mood as string) || (r.preMood as string) || undefined,
    postMood: (r.post_mood as MoodState) || (r.postMood as MoodState) || undefined,
    post_mood: (r.post_mood as string) || (r.postMood as string) || undefined,
    note: (r.note as string) || undefined,
    markedForStreak: !!(r.marked_for_streak || r.markedForStreak),
    marked_for_streak: (r.marked_for_streak as number) ?? (r.markedForStreak ? 1 : 0),
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useResetAnchors() {
  const [completions, setCompletions] = useState<ResetCompletion[]>([]);
  const [lastUsedId,  setLastUsedId]  = useState<string | undefined>(undefined);
  const { streaks, createStreak, toggleDay } = useStreaks();
  const fetchedRef = useRef(false);

  // Hydrate: localStorage first, then API
  useQueuedEffect(() => {
    const local = loadCompletionsLocal();
    if (local.length > 0) setCompletions(local);

    const lu = typeof window !== "undefined"
      ? window.localStorage.getItem(LAST_USED_KEY) ?? undefined
      : undefined;
    if (lu) setLastUsedId(lu);

    if (isDemoMode()) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    api.get<Record<string, unknown>[]>("/api/reset-completions")
      .then((serverComps) => {
        const normalized = serverComps.map(normalizeCompletion);
        setCompletions(normalized);
        persistCompletionsLocal(normalized);
      })
      .catch(() => {});

    api.get<{ last_reset_anchor?: string }>("/api/user-preferences")
      .then((prefs) => {
        if (prefs.last_reset_anchor) {
          setLastUsedId(prefs.last_reset_anchor);
          window.localStorage.setItem(LAST_USED_KEY, prefs.last_reset_anchor);
        }
      })
      .catch(() => {});
  }, []);

  // Ensure the dedicated Reset Anchor streak entry exists
  useEffect(() => {
    if (streaks.length === 0) return;
    const has = streaks.some((s) => s.id === STREAK_ID);
    if (!has) {
      // Inject directly into localStorage so we bypass MAX_STREAKS cap check
      const existing = (() => {
        try { return JSON.parse(window.localStorage.getItem("orryon_streaks") ?? "[]"); } catch { return []; }
      })();
      const alreadyThere = existing.some((s: { id: string }) => s.id === STREAK_ID);
      if (!alreadyThere) {
        const entry = {
          id: STREAK_ID,
          name: STREAK_NAME,
          createdAt: new Date().toISOString(),
          created_at: new Date().toISOString(),
          completions: [],
        };
        window.localStorage.setItem("orryon_streaks", JSON.stringify([...existing, entry]));
        window.dispatchEvent(new Event("storage"));

        if (!isDemoMode()) {
          api.post("/api/streaks", {
            name: STREAK_NAME,
            id: STREAK_ID,
          }).catch(() => {});
        }
      }
    }
  }, [streaks, createStreak]);

  const save = useCallback((next: ResetCompletion[]) => {
    setCompletions(next);
    persistCompletionsLocal(next);
  }, []);

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

      window.localStorage.setItem(LAST_USED_KEY, params.anchorId);
      setLastUsedId(params.anchorId);

      if (!isDemoMode()) {
        api.post("/api/reset-completions", {
          anchor_id: params.anchorId,
          duration: params.duration,
          pre_mood: params.preMood || null,
          id: entry.id,
        }).catch(() => {});
        api.patch("/api/user-preferences", {
          last_reset_anchor: params.anchorId,
        }).catch(() => {});
      }

      return entry;
    },
    [completions, save]
  );

  const updateCompletion = useCallback(
    (id: string, patch: Partial<Pick<ResetCompletion, "postMood" | "note" | "markedForStreak">>) => {
      const next = completions.map((c) => (c.id === id ? { ...c, ...patch } : c));
      save(next);

      if (!isDemoMode()) {
        const apiPatch: Record<string, unknown> = {};
        if (patch.postMood !== undefined) apiPatch.post_mood = patch.postMood;
        if (patch.note !== undefined) apiPatch.note = patch.note;
        if (patch.markedForStreak !== undefined)
          apiPatch.marked_for_streak = patch.markedForStreak ? 1 : 0;
        if (Object.keys(apiPatch).length > 0) {
          api.patch(`/api/reset-completions/${id}`, apiPatch).catch(() => {});
        }
      }
    },
    [completions, save]
  );

  const markStreakForCompletion = useCallback(
    (completionId: string) => {
      const comp = completions.find((c) => c.id === completionId);
      if (!comp || comp.duration < MIN_DURATION_SECS) return;
      updateCompletion(completionId, { markedForStreak: true });
      toggleDay(STREAK_ID, todayKey());
    },
    [completions, updateCompletion, toggleDay]
  );

  const markedToday = (() => {
    const streak = streaks.find((s) => s.id === STREAK_ID);
    if (!streak) return false;
    return streak.completions.includes(todayKey());
  })();

  const streakCount = (() => {
    const streak = streaks.find((s) => s.id === STREAK_ID);
    if (!streak) return 0;
    return calculateStreak(streak.completions);
  })();

  const todayCompletions = completions.filter((c) => c.date === todayKey() || c.date_key === todayKey());

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
