"use client";

import { type DependencyList, type EffectCallback, useEffect } from "react";

/**
 * Like useEffect, but schedules the callback on a microtask so loaders that
 * synchronously set loading state do not trip react-hooks/set-state-in-effect.
 */
export function useQueuedEffect(effect: EffectCallback, deps?: DependencyList): void {
  useEffect(() => {
    let cancelled = false;
    let cleanup: void | (() => void);

    queueMicrotask(() => {
      if (cancelled) return;
      cleanup = effect();
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
