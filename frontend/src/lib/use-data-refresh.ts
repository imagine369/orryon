"use client";

/**
 * useDataRefresh — reusable hook for auto-refreshing a dashboard tab when
 * Orryon performs an action via chat.
 *
 * When Orryon finishes a tool call, the home page dispatches a
 * `orryon:data-changed` CustomEvent carrying the list of affected tab keys
 * (from the chat SSE `done` event / tool handler contract). Any tab that cares about one of
 * those keys calls `useDataRefresh([...keys], reloadFn)` and the tab will
 * re-fetch itself automatically — no manual refresh, no close-and-reopen.
 *
 * Usage:
 *   useDataRefresh(["dashboard", "budget"], reloadData);
 *
 * The hook also listens for a generic "*" wildcard so one-off callers can
 * force a refresh across the whole UI if they ever need to.
 */

import { useEffect, useRef } from "react";

export const DATA_CHANGED_EVENT = "orryon:data-changed";

export interface DataChangedDetail {
  tabs?: string[];
}

/** Quick Access drawer tab keys — kept in sync with nav-bar/quick-access-drawer.tsx */
export const QUICK_ACCESS_TAB_KEYS = [
  "today",
  "errands",
  "calendar",
  "lists",
] as const;

/**
 * Map backend tool tab keys (e.g. "schedule") to Quick Access + dashboard listeners.
 */
export function expandDataChangeTabs(serverTabs: string[]): string[] {
  const out = new Set<string>(serverTabs);
  for (const tab of serverTabs) {
    if (tab === "schedule" || tab === "dashboard") {
      out.add("today");
      out.add("calendar");
    }
    if (tab === "calendar") out.add("today");
    if (tab === "today") {
      out.add("calendar");
      out.add("schedule");
    }
    if (tab === "lists") out.add("lists");
    if (tab === "errands") out.add("errands");
  }
  return [...out];
}

export function dispatchDataChanged(tabs: string[]): void {
  if (typeof window === "undefined") return;
  if (!tabs || tabs.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<DataChangedDetail>(DATA_CHANGED_EVENT, {
      detail: { tabs },
    }),
  );
}

let _pendingTabs: Set<string> | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesce rapid refresh signals (multi-tool turns) into one event. */
export function scheduleDataChanged(tabs: string[]): void {
  if (typeof window === "undefined" || !tabs?.length) return;
  if (!_pendingTabs) _pendingTabs = new Set();
  for (const t of tabs) _pendingTabs.add(t);
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    const batch = [..._pendingTabs!];
    _pendingTabs = null;
    _flushTimer = null;
    dispatchDataChanged(batch);
    // Second pass after React commits any mounts triggered by the first event.
    setTimeout(() => dispatchDataChanged(batch), 120);
  }, 60);
}

/** True when a tool likely wrote user data (not a read/search). */
export function isMutatingTool(toolName: string): boolean {
  if (!toolName) return false;
  if (toolName.startsWith("get_") || toolName.startsWith("search_")) return false;
  if (
    toolName === "web_search" ||
    toolName === "x_search" ||
    toolName === "get_weather" ||
    toolName === "generate_insights" ||
    toolName === "generate_forecast" ||
    toolName === "generate_yearly_summary"
  ) {
    return false;
  }
  return true;
}

/**
 * Notify the UI after chat tools run. Refreshes all Quick Access tabs when any
 * action was taken; otherwise expands server tab keys for read-only turns.
 */
export function notifyChatDataChanged(
  actions: unknown[] | undefined,
  serverTabs: string[] | undefined,
): void {
  const acted = Array.isArray(actions) && actions.length > 0;
  if (acted) {
    scheduleDataChanged(["*", ...QUICK_ACCESS_TAB_KEYS]);
    return;
  }
  const tabs = expandDataChangeTabs(
    Array.isArray(serverTabs) ? serverTabs : [],
  );
  if (tabs.length > 0) scheduleDataChanged(tabs);
}

/**
 * Re-run `reload()` whenever Orryon signals any of `watchedTabs` changed.
 *
 * `reload` is intentionally not in the dep array — we capture it via a ref
 * so callers don't have to wrap it in `useCallback`. The effect itself only
 * re-subscribes if the *set* of watched tabs changes.
 */
export function useDataRefresh(
  watchedTabs: readonly string[],
  reload: () => void,
): void {
  const reloadRef = useRef(reload);

  useEffect(() => {
    reloadRef.current = reload;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DataChangedDetail>).detail;
      const changed = detail?.tabs ?? [];
      if (changed.length === 0) return;
      if (changed.includes("*")) {
        reloadRef.current();
        return;
      }
      if (changed.some((t) => watchedTabs.includes(t))) {
        reloadRef.current();
      }
    };
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
    // watchedTabs is treated as a stable array — callers should pass a
    // literal so React's shallow compare doesn't cause spurious re-subs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedTabs.join("|")]);
}
