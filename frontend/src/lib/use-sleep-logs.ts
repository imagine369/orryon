"use client";

/**
 * use-sleep-logs.ts
 *
 * Fetches sleep vitals from /api/health/vitals and returns:
 *   - byDate  — map of "YYYY-MM-DD" → hours (all available history)
 *   - summary — last-7-day stats (always recent, regardless of chart range)
 *   - loading
 *
 * The SleepSection component holds the selected range (W / M / 3M) and
 * builds the chart dataset client-side from byDate — no re-fetches on nav.
 */

import { useCallback, useRef, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { useDataRefresh } from "@/lib/use-data-refresh";
import { api, isDemoMode } from "@/lib/api";

export interface SleepDataPoint {
  date: string;      // "YYYY-MM-DD" (first day of the bucket for 3M weekly bars)
  label: string;     // "Jun 10" — for chart x-axis / tooltip
  hours: number;     // actual hours, or SLEEP_GHOST_VALUE when no data
  hasData: boolean;
}

export interface SleepSummary {
  lastNight: number | null;
  weekAvg: number | null;
  weekBest: number | null;
}

/** Rendered value for days / weeks with no log — tiny ghost bar at baseline. */
export const SLEEP_GHOST_VALUE = 0.15;

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Build an array of the last `days` date strings in "YYYY-MM-DD" format (oldest → newest). */
export function buildDateRange(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${mo}-${dy}`);
  }
  return dates;
}

/** Convert an ISO UTC datetime string to a local-timezone date string "YYYY-MM-DD". */
export function toLocalDate(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

/** Short display label: "Jun 10" */
export function toDateLabel(dateStr: string): string {
  const [y, mo, dy] = dateStr.split("-").map(Number);
  const d = new Date(y, mo - 1, dy);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Range builders ────────────────────────────────────────────────────────────

/** Last 7 days — one bar per day. */
export function build7d(byDate: Record<string, number>): SleepDataPoint[] {
  return buildDateRange(7).map((date) => ({
    date,
    label: toDateLabel(date),
    hours: byDate[date] ?? SLEEP_GHOST_VALUE,
    hasData: date in byDate,
  }));
}

/** Last 30 days — one bar per day. */
export function build30d(byDate: Record<string, number>): SleepDataPoint[] {
  return buildDateRange(30).map((date) => ({
    date,
    label: toDateLabel(date),
    hours: byDate[date] ?? SLEEP_GHOST_VALUE,
    hasData: date in byDate,
  }));
}

/**
 * Last 13 weeks — one bar per week (weekly average of logged nights).
 * Each bucket covers 7 consecutive days; label shows the first date of that bucket.
 */
export function build3m(byDate: Record<string, number>): SleepDataPoint[] {
  const dates = buildDateRange(91); // 13 × 7
  const weeks: SleepDataPoint[] = [];
  for (let i = 0; i < 13; i++) {
    const bucket = dates.slice(i * 7, i * 7 + 7);
    const logged = bucket.filter((d) => d in byDate).map((d) => byDate[d]);
    const hasData = logged.length > 0;
    const hours = hasData
      ? logged.reduce((a, b) => a + b, 0) / logged.length
      : SLEEP_GHOST_VALUE;
    weeks.push({
      date: bucket[0],
      label: toDateLabel(bucket[0]),
      hours,
      hasData,
    });
  }
  return weeks;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSleepLogs() {
  const [byDate, setByDate] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SleepSummary>({
    lastNight: null,
    weekAvg: null,
    weekBest: null,
  });
  const activeRef = useRef(false);

  const reload = useCallback(() => {
    if (isDemoMode()) {
      setLoading(false);
      return;
    }
    if (activeRef.current) return;
    activeRef.current = true;

    // limit=200 covers ~6 months of daily logs comfortably
    api
      .get<{ vitals: { value: number; recorded_at: string }[] }>(
        "/api/health/vitals?type=sleep&limit=200",
      )
      .then((res) => {
        const vitals = res.vitals ?? [];

        // Build date → hours map; API returns DESC so first hit per date wins.
        const map: Record<string, number> = {};
        for (const v of vitals) {
          const date = toLocalDate(v.recorded_at);
          if (!(date in map)) map[date] = v.value;
        }

        // Summary stats are always based on the most recent 7 days.
        const last7dates = buildDateRange(7);
        const todayDate = last7dates[last7dates.length - 1];
        const lastNight = map[todayDate] ?? null;

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
        setSummary({ lastNight, weekAvg, weekBest });
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        activeRef.current = false;
      });
  }, []);

  useQueuedEffect(() => { reload(); }, [reload]);
  useDataRefresh(["health"], reload);

  return { byDate, loading, summary };
}
