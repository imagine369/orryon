"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { usePanels } from "@/lib/panel-context";
import { useResetAnchors } from "@/lib/use-reset-anchors";
import { type ResetAnchor } from "@/lib/reset-scripts";
import { ResetAnchorSession } from "@/components/reset-anchor-session";
import { ResetAnchorBrowse } from "@/components/reset-anchor/reset-anchor-browse";
import type { MoodState } from "@/lib/use-reset-anchors";

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
          <circle
            cx="14" cy="14" r={r}
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1.5"
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8,
          fontWeight: 700,
          color: count > 0 ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {count}
      </span>
    </div>
  );
}

export function ResetAnchorPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "reset";

  const {
    lastUsedId,
    markedToday,
    streakCount,
    completions,
    addCompletion,
    updateCompletion,
    markStreakForCompletion,
  } = useResetAnchors();

  const [activeAnchor, setActiveAnchor] = useState<ResetAnchor | null>(null);

  const handleStart = (anchor: ResetAnchor) => {
    setActiveAnchor(anchor);
  };

  const handleSessionClose = () => {
    setActiveAnchor(null);
  };

  const handleAddCompletion = (
    anchorId: string,
    duration: number,
    preMood?: MoodState,
  ): string => {
    return addCompletion({ anchorId, duration, preMood }).id;
  };

  const handleUpdateCompletion = (id: string, postMood?: MoodState, note?: string) => {
    updateCompletion(id, { postMood, note });
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="reset-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              onClick={close}
            />

            <motion.div
              key="reset-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.2 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80 || info.velocity.x > 500) close();
              }}
              className="fixed top-0 right-0 h-full z-50 flex flex-col"
              style={{ width: "95vw", maxWidth: 600 }}
            >
              <div
                className="h-full rounded-l-2xl flex flex-col overflow-hidden"
                style={{ background: "#080808" }}
              >
                <div
                  className="shrink-0"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <motion.div
                      animate={{ scale: [0.88, 1.0, 0.88] }}
                      transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border: "1.2px solid rgba(255,255,255,0.35)",
                        background: "rgba(255,255,255,0.06)",
                        flexShrink: 0,
                      }}
                    />
                    <h1
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.9)",
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                      }}
                    >
                      Reset Anchors
                    </h1>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <StreakRing count={streakCount} />
                      <span
                        style={{
                          fontSize: 10,
                          color: streakCount > 0 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {streakCount === 0
                          ? "Start today"
                          : streakCount === 1
                          ? "1 day"
                          : `${streakCount} days`}
                      </span>
                    </div>
                    <button
                      onClick={close}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.05)",
                        border: "none",
                        cursor: "pointer",
                        color: "rgba(255,255,255,0.5)",
                      }}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <div
                  className="flex-1 overflow-y-auto"
                  style={{ padding: "16px 20px 32px" }}
                >
                  <ResetAnchorBrowse
                    lastUsedId={lastUsedId}
                    markedToday={markedToday}
                    completions={completions}
                    onStart={handleStart}
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {activeAnchor && (
        <ResetAnchorSession
          anchor={activeAnchor}
          onClose={handleSessionClose}
          alreadyMarkedToday={markedToday}
          streakCount={streakCount}
          onAddCompletion={handleAddCompletion}
          onUpdateCompletion={handleUpdateCompletion}
          onMarkStreak={markStreakForCompletion}
        />
      )}
    </>
  );
}
