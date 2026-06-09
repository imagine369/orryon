"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  POST_CHECKOUT_SESSION_KEY,
  readCheckoutIntent,
  clearCheckoutIntent,
  planDisplayName,
  isCheckoutComplete,
  storeCheckoutIntent,
} from "@/lib/post-checkout";
import type { Subscription } from "@/lib/use-subscription";

export function usePostCheckout(
  sub: Subscription | null,
  refreshSub: () => void,
) {
  const searchParams = useSearchParams();
  const [activating, setActivating] = useState(false);
  const [activationPlan, setActivationPlan] = useState("");
  const [upgradeBanner, setUpgradeBanner] = useState(false);
  const pollStartedRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlUpgraded = searchParams.get("upgraded") === "1";
    const planParam = searchParams.get("plan");

    if (urlUpgraded) {
      try {
        sessionStorage.setItem(POST_CHECKOUT_SESSION_KEY, "1");
        if (planParam) storeCheckoutIntent(planParam);
      } catch {
        /* ignore */
      }
    }

    let pending = false;
    try {
      pending = sessionStorage.getItem(POST_CHECKOUT_SESSION_KEY) === "1";
    } catch {
      pending = urlUpgraded;
    }

    if (!pending) {
      pollStartedRef.current = false;
      return;
    }

    if (pollStartedRef.current) return;
    pollStartedRef.current = true;

    const expected = planParam || readCheckoutIntent();
    setActivating(true);
    setActivationPlan(planDisplayName(expected));

    if (urlUpgraded) {
      window.history.replaceState({}, "", "/home");
    }

    const runSync = () =>
      api
        .post<Subscription>("/api/subscription/sync")
        .then(() => refreshSub())
        .catch(() => {});

    void runSync();

    let attempts = 0;
    pollIntervalRef.current = setInterval(() => {
      if (attempts % 2 === 0) void runSync();
      else refreshSub();
      attempts++;
      if (attempts >= 30) {
        clearCheckoutIntent();
        pollStartedRef.current = false;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setActivating(false);
      }
    }, 1500);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      pollStartedRef.current = false;
    };
  }, [searchParams, refreshSub]);

  useEffect(() => {
    if (!activating || !sub) return;
    const expected = readCheckoutIntent();
    if (!isCheckoutComplete(sub, expected)) return;

    clearCheckoutIntent();
    pollStartedRef.current = false;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    queueMicrotask(() => {
      setActivating(false);
      setActivationPlan(planDisplayName(sub.plan));
      setUpgradeBanner(true);
    });
    const t = setTimeout(() => setUpgradeBanner(false), 8000);
    return () => clearTimeout(t);
  }, [activating, sub]);

  return { activating, activationPlan, upgradeBanner };
}
