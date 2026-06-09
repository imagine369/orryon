"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { ResetAnchor } from "@/lib/reset-scripts";
import { resolvedDuration } from "@/lib/reset-scripts";
import type { MoodState } from "@/lib/use-reset-anchors";
import { stopBackgroundSound } from "@/lib/breathing-sounds";
import { SESSION_BG, FONT } from "@/components/reset-anchor/tokens";
import { SessionScreen } from "@/components/reset-anchor/screens/session-screen";
import { PostMoodScreen } from "@/components/reset-anchor/screens/post-mood-screen";
import { CompletionScreen } from "@/components/reset-anchor/screens/completion-screen";

type Screen = "pre-mood" | "session" | "post-mood" | "completion";


export interface ResetAnchorSessionProps {
  anchor: ResetAnchor;
  onClose: () => void;
  alreadyMarkedToday: boolean;
  streakCount: number;
  onAddCompletion: (anchorId: string, duration: number, preMood?: MoodState) => string;
  onUpdateCompletion: (id: string, postMood?: MoodState, note?: string) => void;
  onMarkStreak: (completionId: string) => void;
}

export function ResetAnchorSession({
  anchor,
  onClose,
  alreadyMarkedToday,
  streakCount,
  onAddCompletion,
  onUpdateCompletion,
  onMarkStreak,
}: ResetAnchorSessionProps) {
  const [screen,          setScreen]          = useState<Screen>("session");
  const [completionId,    setCompletionId]    = useState<string | null>(null);
  const [sessionSecs,     setSessionSecs]     = useState(0);
  const [durationOptIdx,  setDurationOptIdx]  = useState(anchor.defaultDurationIndex ?? 0);
  const [markedStreak,    setMarkedStreak]    = useState(false);
  const [container,       setContainer]       = useState<HTMLElement | null>(null);

  useQueuedEffect(() => { setContainer(document.body); }, []);

  // Ensure any prior session ambience is stopped when the overlay closes.
  useEffect(() => () => stopBackgroundSound(), []);

  const durationSecs = resolvedDuration(anchor, durationOptIdx);

  const handleSessionComplete = useCallback((elapsed: number) => {
    setSessionSecs(elapsed);
    const id = onAddCompletion(anchor.id, elapsed, undefined);
    setCompletionId(id);
    setScreen("post-mood");
  }, [anchor.id, onAddCompletion]);

  const handlePostMoodDone = useCallback(
    (params: { postMood?: MoodState; note?: string; markStreak: boolean }) => {
      if (completionId) {
        onUpdateCompletion(completionId, params.postMood, params.note);
        if (params.markStreak) {
          onMarkStreak(completionId);
          setMarkedStreak(true);
        }
      }
      setScreen("completion");
    },
    [completionId, onUpdateCompletion, onMarkStreak]
  );

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="reset-session-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          background: SESSION_BG,
          fontFamily: FONT,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        {/* Header — close */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "14px 20px",
        }}>
          <button
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.22)",
              padding: 8,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* Screen content */}
        <AnimatePresence mode="wait">
          {screen === "session" && (
            <motion.div
              key="session"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "flex", flex: 1, minHeight: 0 }}
            >
              <SessionScreen
                anchor={anchor}
                durationSecs={durationSecs}
                durationOptIdx={durationOptIdx}
                onDurationSelect={setDurationOptIdx}
                onComplete={handleSessionComplete}
                onBack={onClose}
              />
            </motion.div>
          )}

          {screen === "post-mood" && (
            <motion.div
              key="post-mood"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "flex", flex: 1, minHeight: 0, overflowY: "auto" }}
            >
              <PostMoodScreen
                anchor={anchor}
                alreadyMarked={alreadyMarkedToday}
                onDone={handlePostMoodDone}
              />
            </motion.div>
          )}

          {screen === "completion" && (
            <motion.div
              key="completion"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ display: "flex", flex: 1, minHeight: 0, overflowY: "auto" }}
            >
              <CompletionScreen
                anchor={anchor}
                streakCount={streakCount + (markedStreak ? 1 : 0)}
                markedStreak={markedStreak}
                onClose={onClose}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );

  if (!container) return null;
  return createPortal(overlay, container);
}
