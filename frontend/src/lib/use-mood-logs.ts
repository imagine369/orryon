"use client";

/**
 * use-mood-logs.ts
 *
 * Fetches mood vitals from /api/health/vitals (type="mood") and returns:
 *   - byDate  — map of "YYYY-MM-DD" → score (1–5, all available history)
 *   - summary — last-7-day stats (always recent, regardless of chart range)
 *   - loading
 *
 * Mood is logged by the agent via log_health_vital(type="mood", value=1–5).
 * The MoodSection component holds the selected range (W / M / 3M) and
 * builds the chart dataset client-side from byDate — no re-fetches on nav.
 *
 * Shared date utilities are imported from use-sleep-logs to avoid duplication.
 */

import { useRef, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { api, isDemoMode } from "@/lib/api";
import { buildDateRange, toLocalDate, toDateLabel } from "@/lib/use-sleep-logs";

export interface MoodDataPoint {
  date: string;      // "YYYY-MM-DD" (first day of the bucket for 3M weekly bars)
  label: string;     // "Jun 10" — for tooltip
  value: number;     // mood score 1–5, or MOOD_GHOST_VALUE when no data
  hasData: boolean;
}

export interface MoodSummary {
  today: number | null;
  weekAvg: number | null;
  weekBest: number | null;
}

/** Rendered value for days / weeks with no log — tiny ghost bar at baseline. */
export const MOOD_GHOST_VALUE = 0.15;

// ── Range builders ────────────────────────────────────────────────────────────

/** Last 7 days — one bar per day. */
export function buildMood7d(byDate: Record<string, number>): MoodDataPoint[] {
  return buildDateRange(7).map((date) => ({
    date,
    label: toDateLabel(date),
    value: byDate[date] ?? MOOD_GHOST_VALUE,
    hasData: date in byDate,
  }));
}

/** Last 30 days — one bar per day. */
export function buildMood30d(byDate: Record<string, number>): MoodDataPoint[] {
  return buildDateRange(30).map((date) => ({
    date,
    label: toDateLabel(date),
    value: byDate[date] ?? MOOD_GHOST_VALUE,
    hasData: date in byDate,
  }));
}

/**
 * Last 13 weeks — one bar per week (weekly average of logged scores).
 * Each bucket covers 7 consecutive days; label shows the first date of that bucket.
 */
export function buildMood3m(byDate: Record<string, number>): MoodDataPoint[] {
  const dates = buildDateRange(91); // 13 × 7
  const weeks: MoodDataPoint[] = [];
  for (let i = 0; i < 13; i++) {
    const bucket = dates.slice(i * 7, i * 7 + 7);
    const logged = bucket.filter((d) => d in byDate).map((d) => byDate[d]);
    const hasData = logged.length > 0;
    const value = hasData
      ? logged.reduce((a, b) => a + b, 0) / logged.length
      : MOOD_GHOST_VALUE;
    weeks.push({
      date: bucket[0],
      label: toDateLabel(bucket[0]),
      value,
      hasData,
    });
  }
  return weeks;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMoodLogs() {
  const [byDate, setByDate] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MoodSummary>({
    today: null,
    weekAvg: null,
    weekBest: null,
  });
  const fetchedRef = useRef(false);

  useQueuedEffect(() => {
    if (isDemoMode()) {
      setLoading(false);
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    // limit=200 covers ~6 months of daily logs comfortably
    api
      .get<{ vitals: { value: number; recorded_at: string }[] }>(
        "/api/health/vitals?type=mood&limit=200",
      )
      .then((res) => {
        const vitals = res.vitals ?? [];

        // Build date → score map; API returns DESC so first hit per date wins.
        const map: Record<string, number> = {};
        for (const v of vitals) {
          const date = toLocalDate(v.recorded_at);
          if (!(date in map)) map[date] = v.value;
        }

        // Summary stats are always based on the most recent 7 days.
        const last7dates = buildDateRange(7);
        const todayDate = last7dates[last7dates.length - 1];
        const today = map[todayDate] ?? null;

        const last7logged = last7dates
          .filter((d) => d in map)
          .map((d) => map[d]);

        const weekAvg =
          last7logged.length > 0
            ? last7logged.reduce((a, b) => a + b, 0) / last7logged.length
            : null;
        const weekBest =
          last7logged.length > 0 ? Math.max(...last7logged) : null;

        setByDate(map);
        setSummary({ today, weekAvg, weekBest });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { byDate, loading, summary };
}
