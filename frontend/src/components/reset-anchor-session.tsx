"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { ResetAnchor } from "@/lib/reset-scripts";
import { resolvedDuration } from "@/lib/reset-scripts";
import type { MoodState } from "@/lib/use-reset-anchors";
import { stopBackgroundSound, primeAudioContext } from "@/lib/breathing-sounds";
import { SESSION_BG, FONT } from "@/components/reset-anchor/tokens";
import { PreMoodScreen } from "@/components/reset-anchor/screens/pre-mood-screen";
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
  const [screen, setScreen] = useState<Screen>("pre-mood");
  const [preMood, setPreMood] = useState<MoodState | undefined>(undefined);
  const [completionId, setCompletionId] = useState<string | null>(null);
  const [postMood, setPostMood] = useState<MoodState | undefined>(undefined);
  const [durationOptIdx, setDurationOptIdx] = useState(anchor.defaultDurationIndex ?? 0);
  const [markedStreak, setMarkedStreak] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useQueuedEffect(() => { setContainer(document.body); }, []);

  useEffect(() => () => stopBackgroundSound(), []);

  const durationSecs = resolvedDuration(anchor, durationOptIdx);

  const handlePreMoodContinue = useCallback((mood?: MoodState) => {
    primeAudioContext();
    setPreMood(mood);
    setScreen("session");
  }, []);

  const handleSessionComplete = useCallback((elapsed: number) => {
    const id = onAddCompletion(anchor.id, elapsed, preMood);
    setCompletionId(id);
    setScreen("post-mood");
  }, [anchor.id, onAddCompletion, preMood]);

  const handlePostMoodDone = useCallback(
    (params: { postMood?: MoodState; note?: string; markStreak: boolean }) => {
      setPostMood(params.postMood);
      if (completionId) {
        onUpdateCompletion(completionId, params.postMood, params.note);
        if (params.markStreak) {
          onMarkStreak(completionId);
          setMarkedStreak(true);
        }
      }
      setScreen("completion");
    },
    [completionId, onUpdateCompletion, onMarkStreak],
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
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "14px 20px",
          flexShrink: 0,
          opacity: screen === "session" ? 0.38 : 1,
          transition: "opacity 0.3s",
        }}>
          <button
            onClick={onClose}
            aria-label="Close session"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: screen === "session"
                ? "rgba(255,255,255,0.28)"
                : "rgba(255,255,255,0.22)",
              padding: 8,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {screen === "pre-mood" && (
            <motion.div
              key="pre-mood"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "flex", flex: 1, minHeight: 0 }}
            >
              <PreMoodScreen
                anchor={anchor}
                durationOptIdx={durationOptIdx}
                onDurationSelect={setDurationOptIdx}
                onSkip={() => handlePreMoodContinue(undefined)}
                onContinue={handlePreMoodContinue}
              />
            </motion.div>
          )}

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
                key={`${anchor.id}-${durationSecs}`}
                anchor={anchor}
                durationSecs={durationSecs}
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
                preMood={preMood}
                postMood={postMood}
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
