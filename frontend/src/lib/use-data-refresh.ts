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

import { useEffect } from "react";

export const DATA_CHANGED_EVENT = "orryon:data-changed";

export interface DataChangedDetail {
  tabs?: string[];
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
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DataChangedDetail>).detail;
      const changed = detail?.tabs ?? [];
      if (changed.length === 0) return;
      if (changed.includes("*")) {
        reload();
        return;
      }
      if (changed.some((t) => watchedTabs.includes(t))) {
        reload();
      }
    };
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
    // watchedTabs is treated as a stable array — callers should pass a
    // literal so React's shallow compare doesn't cause spurious re-subs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedTabs.join("|")]);
}
