"use client";

import type { ResetAnchor } from "@/lib/reset-scripts";
import { ACCENT_TEXT, MUTED_TEXT, FONT } from "@/components/reset-anchor/tokens";


export function CompletionScreen({
  anchor,
  streakCount,
  markedStreak,
  onClose,
}: {
  anchor: ResetAnchor;
  streakCount: number;
  markedStreak: boolean;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `0 clamp(16px, 5vw, 32px) max(32px, calc(32px + env(safe-area-inset-bottom, 0px)))`,
        gap: 0,
        fontFamily: FONT,
        textAlign: "center",
      }}
    >
      {markedStreak && streakCount > 0 && (
        <p style={{ fontSize: "clamp(0.625rem, 2.8vw, 0.6875rem)", color: MUTED_TEXT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
          {streakCount === 1 ? "Day 1" : `${streakCount}-day streak`}
        </p>
      )}

      <p
        style={{
          fontSize: "clamp(1.25rem, 6vw, 1.625rem)",
          fontWeight: 700,
          color: ACCENT_TEXT,
          letterSpacing: "-0.02em",
          lineHeight: 1.3,
          marginBottom: 10,
          wordBreak: "break-word",
        }}
      >
        {anchor.id === "evening-release-7min"
          ? "Tonight, you rest."
          : anchor.id === "focus-return-4min"
          ? "You're clear. Begin."
          : "Your system has reset."}
      </p>
      <p style={{ fontSize: "clamp(0.8125rem, 3.5vw, 0.875rem)", color: MUTED_TEXT, maxWidth: "min(100%, 260px)", lineHeight: 1.6, marginBottom: "clamp(2rem, 8vw, 3rem)", wordBreak: "break-word" }}>
        {anchor.tagline}
      </p>

      <button
        onClick={onClose}
        style={{
          padding: "13px clamp(1.5rem, 8vw, 2.5rem)",
          borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
          background: "transparent",
          color: "rgba(255,255,255,0.45)",
          fontSize: 13,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  );
}

