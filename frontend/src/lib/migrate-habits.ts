/**
 * One-time migration: push localStorage habit data to the backend.
 *
 * Runs on first authenticated load after the data-sync feature ships.
 * Idempotent — the backend uses client-generated IDs as primary keys,
 * so re-running never creates duplicates.
 */

import { api, isDemoMode } from "@/lib/api";

const MIGRATION_FLAG = "orryon_habits_migrated";
const STREAKS_KEY = "orryon_streaks";
const COMPLETIONS_KEY = "orryon_reset_completions";
const LAST_USED_KEY = "orryon_reset_last_used";

interface LocalStreak {
  id: string;
  name: string;
  emoji?: string;
  targetDays?: number;
  target_days?: number;
  createdAt?: string;
  created_at?: string;
  completions: string[];
}

interface LocalCompletion {
  id: string;
  anchorId?: string;
  anchor_id?: string;
  date?: string;
  date_key?: string;
  duration: number;
  preMood?: string;
  pre_mood?: string;
  postMood?: string;
  post_mood?: string;
  note?: string;
  markedForStreak?: boolean;
  marked_for_streak?: number | boolean;
}

export async function migrateHabitsToServer(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isDemoMode()) return;
  if (localStorage.getItem(MIGRATION_FLAG) === "1") return;

  const rawStreaks = localStorage.getItem(STREAKS_KEY);
  const rawCompletions = localStorage.getItem(COMPLETIONS_KEY);
  const lastUsed = localStorage.getItem(LAST_USED_KEY);

  const localStreaks: LocalStreak[] = (() => {
    try { return rawStreaks ? JSON.parse(rawStreaks) : []; } catch { return []; }
  })();
  const localCompletions: LocalCompletion[] = (() => {
    try { return rawCompletions ? JSON.parse(rawCompletions) : []; } catch { return []; }
  })();

  if (localStreaks.length === 0 && localCompletions.length === 0 && !lastUsed) {
    localStorage.setItem(MIGRATION_FLAG, "1");
    return;
  }

  try {
    await api.post("/api/habits/import", {
      streaks: localStreaks.map((s) => ({
        id: s.id,
        name: s.name,
        emoji: s.emoji || "",
        target_days: s.targetDays ?? s.target_days ?? null,
        created_at: s.createdAt || s.created_at || new Date().toISOString(),
        completions: s.completions || [],
      })),
      reset_completions: localCompletions.map((c) => ({
        id: c.id,
        anchor_id: c.anchorId || c.anchor_id || "",
        date_key: c.date || c.date_key || "",
        duration: c.duration,
        pre_mood: c.preMood || c.pre_mood || null,
        post_mood: c.postMood || c.post_mood || null,
        note: c.note || null,
        marked_for_streak: !!(c.markedForStreak || c.marked_for_streak),
      })),
      last_reset_anchor: lastUsed || null,
    });

    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    // Migration failed (maybe offline). Will retry next load.
  }
}
