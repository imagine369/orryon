"use client";

import { useState } from "react";
import type { ResetAnchor } from "@/lib/reset-scripts";
import type { MoodState } from "@/lib/use-reset-anchors";
import { ACCENT_TEXT, MUTED_TEXT, FONT } from "@/components/reset-anchor/tokens";
import { MoodPicker } from "./mood-picker";


export function PreMoodScreen({
  anchor,
  onSkip,
  onContinue,
}: {
  anchor: ResetAnchor;
  onSkip: () => void;
  onContinue: (mood?: MoodState) => void;
}) {
  const [mood, setMood] = useState<MoodState | undefined>(undefined);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
        gap: 0,
        fontFamily: FONT,
      }}
    >
      <p style={{ fontSize: 11, color: MUTED_TEXT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
        Before you begin
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, color: ACCENT_TEXT, marginBottom: 6, textAlign: "center", letterSpacing: "-0.02em" }}>
        How are you feeling?
      </p>
      <p style={{ fontSize: 13, color: MUTED_TEXT, marginBottom: 36, textAlign: "center" }}>
        Optional — helps track what resets work for you.
      </p>

      <MoodPicker selected={mood} onSelect={setMood} />

      <div style={{ display: "flex", gap: 10, marginTop: 36, width: "100%", maxWidth: 320 }}>
        <button
          onClick={onSkip}
          style={{
            flex: 1,
            padding: "13px 0",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "transparent",
            color: "rgba(255,255,255,0.40)",
            fontSize: 13,
            fontFamily: FONT,
            cursor: "pointer",
          }}
        >
          Skip
        </button>
        <button
          onClick={() => onContinue(mood)}
          style={{
            flex: 2,
            padding: "13px 0",
            borderRadius: 12,
            border: "none",
          background: "rgba(255,255,255,0.92)",
          color: "#1e2540",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        Begin
      </button>
      </div>
    </div>
  );
}

