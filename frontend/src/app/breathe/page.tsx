"use client";

import { Suspense, useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useResetAnchors } from "@/lib/use-reset-anchors";
import { getAnchorById, type ResetAnchor } from "@/lib/reset-scripts";
import {
  CUSTOM_LOOP_ANCHOR_ID,
  resolveStartAnchor,
} from "@/lib/custom-breath-loop";
import { ResetAnchorSession } from "@/components/reset-anchor-session";
import { ResetAnchorBrowse } from "@/components/reset-anchor/reset-anchor-browse";
import { primeAudioContext } from "@/lib/breathing-sounds";
import type { MoodState } from "@/lib/use-reset-anchors";

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function StreakRing({ count }: { count: number }) {
  const r = 10;
  const c = 2 * Math.PI * r;
  const segments = Math.min(count, 7);
  const fraction = segments / 7;
  const dash = c * fraction;
  const gap = c - dash;
  return (
    <div style={{ position: "relative", width: 28, height: 28 }}>
      <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
        {count > 0 && (
          <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5"
            strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
        )}
      </svg>
      <span style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontWeight: 700, lineHeight: 1,
        color: count > 0 ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)",
      }}>
        {count}
      </span>
    </div>
  );
}

function BreathePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startId = searchParams.get("start");
  const isClient = useIsClient();

  const {
    lastUsedId,
    markedToday,
    streakCount,
    completions,
    addCompletion,
    updateCompletion,
    markStreakForCompletion,
  } = useResetAnchors();

  const [manualAnchor, setManualAnchor] = useState<ResetAnchor | null>(null);
  const [autoStartDismissed, setAutoStartDismissed] = useState(false);

  const resolvedStart = useMemo(() => {
    if (!startId) return null;
    if (startId === CUSTOM_LOOP_ANCHOR_ID) {
      if (!isClient) return null;
      return resolveStartAnchor(startId);
    }
    return getAnchorById(startId) ?? null;
  }, [startId, isClient]);

  const deepLinkPending = startId === CUSTOM_LOOP_ANCHOR_ID && !isClient;
  const deepLinkUnknown = !!startId && !resolvedStart && !deepLinkPending;
  const autoAnchor = !autoStartDismissed && resolvedStart ? resolvedStart : null;
  const activeAnchor = manualAnchor ?? autoAnchor;

  const handleStartAnchor = useCallback((anchor: ResetAnchor) => {
    primeAudioContext();
    setManualAnchor(anchor);
    setAutoStartDismissed(true);
  }, []);

  const handleCloseSession = useCallback(() => {
    setManualAnchor(null);
    setAutoStartDismissed(true);
    if (startId) router.replace("/breathe");
  }, [router, startId]);

  const handleAddCompletion = (anchorId: string, duration: number, preMood?: MoodState): string =>
    addCompletion({ anchorId, duration, preMood }).id;

  const handleUpdateCompletion = (id: string, postMood?: MoodState, note?: string) =>
    updateCompletion(id, { postMood, note });

  return (
    <div className="min-h-full bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: [0.88, 1.0, 0.88] }}
              transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
              style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
                opacity: 0.8,
              }}
            />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.02em" }}>
              Reset Anchors
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StreakRing count={streakCount} />
            <span style={{ fontSize: 10, color: streakCount > 0 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)", fontWeight: 600, letterSpacing: "0.04em" }}>
              {streakCount === 0 ? "Start today" : streakCount === 1 ? "1 day" : `${streakCount} days`}
            </span>
          </div>
        </div>

        {deepLinkUnknown && !activeAnchor && (
          <p
            role="status"
            style={{
              fontSize: 12,
              color: "rgba(255,180,180,0.55)",
              lineHeight: 1.5,
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            {startId === CUSTOM_LOOP_ANCHOR_ID
              ? "Save a custom loop below first, then open this link again."
              : `"${startId}" isn't a reset we recognize — pick one below.`}
          </p>
        )}

        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", lineHeight: 1.6, marginBottom: 28, maxWidth: 440 }}>
          Breathing and meditation are always free — for everyone, always.
        </p>

        <ResetAnchorBrowse
          lastUsedId={lastUsedId}
          markedToday={markedToday}
          completions={completions}
          onStart={handleStartAnchor}
        />
      </div>

      {activeAnchor && (
        <ResetAnchorSession
          anchor={activeAnchor}
          onClose={handleCloseSession}
          alreadyMarkedToday={markedToday}
          streakCount={streakCount}
          onAddCompletion={handleAddCompletion}
          onUpdateCompletion={handleUpdateCompletion}
          onMarkStreak={markStreakForCompletion}
        />
      )}
    </div>
  );
}

export default function BreathePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-black">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      }
    >
      <BreathePageContent />
    </Suspense>
  );
}
