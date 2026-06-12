"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { ResetAnchor } from "@/lib/reset-scripts";
import type { MoodState } from "@/lib/use-reset-anchors";
import { ACCENT_TEXT, MUTED_TEXT, FONT } from "@/components/reset-anchor/tokens";
import { MoodPicker } from "./mood-picker";


export function PostMoodScreen({
  anchor,
  alreadyMarked,
  onDone,
}: {
  anchor: ResetAnchor;
  alreadyMarked: boolean;
  onDone: (params: { postMood?: MoodState; note?: string; markStreak: boolean }) => void;
}) {
  const [mood,        setMood]        = useState<MoodState | undefined>(undefined);
  const [note,        setNote]        = useState("");
  const [markStreak,  setMarkStreak]  = useState(!alreadyMarked);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `0 clamp(16px, 5vw, 32px) max(24px, calc(24px + env(safe-area-inset-bottom, 0px)))`,
        gap: 0,
        fontFamily: FONT,
      }}
    >
      <p style={{ fontSize: "clamp(0.625rem, 2.8vw, 0.6875rem)", color: MUTED_TEXT, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
        {anchor.shortTitle} · Reset complete
      </p>
      <p
        style={{
          fontSize: "clamp(1.125rem, 5.5vw, 1.375rem)",
          fontWeight: 700,
          color: ACCENT_TEXT,
          marginBottom: 6,
          textAlign: "center",
          letterSpacing: "-0.02em",
        }}
      >
        How do you feel now?
      </p>
      <p style={{ fontSize: "clamp(0.75rem, 3.2vw, 0.8125rem)", color: MUTED_TEXT, marginBottom: 28, textAlign: "center" }}>
        Optional.
      </p>

      <MoodPicker selected={mood} onSelect={setMood} />

      {/* Optional note */}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="One sentence — anything on your mind..."
        maxLength={200}
        rows={2}
        style={{
          marginTop: 16,
          width: "100%",
          maxWidth: "min(100%, 320px)",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
          padding: "12px 14px",
          color: "rgba(255,255,255,0.75)",
          fontSize: "clamp(0.75rem, 3.2vw, 0.8125rem)",
          fontFamily: FONT,
          resize: "none",
          outline: "none",
          lineHeight: 1.5,
        }}
      />

      {/* Streak toggle */}
      {!alreadyMarked && (
        <button
          onClick={() => setMarkStreak((v) => !v)}
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            maxWidth: "min(100%, 320px)",
            padding: "12px 14px",
            borderRadius: 12,
            border: markStreak
              ? "1px solid rgba(255,255,255,0.22)"
              : "1px solid rgba(255,255,255,0.09)",
            background: markStreak ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.02)",
            color: markStreak ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.38)",
            fontFamily: FONT,
            fontSize: "clamp(0.75rem, 3.2vw, 0.8125rem)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: markStreak ? "none" : "1.5px solid rgba(255,255,255,0.30)",
              background: markStreak ? "rgba(255,255,255,0.88)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {markStreak && <Check size={10} strokeWidth={2.5} color="#1e2540" />}
          </div>
          Mark today&apos;s Reset Anchor streak
        </button>
      )}

      {alreadyMarked && (
        <p style={{ marginTop: 14, fontSize: 12, color: MUTED_TEXT, textAlign: "center" }}>
          Today&apos;s streak is already marked.
        </p>
      )}

      <button
        onClick={() => onDone({ postMood: mood, note: note.trim() || undefined, markStreak })}
        style={{
          marginTop: 20,
          width: "100%",
          maxWidth: "min(100%, 320px)",
          padding: "14px 0",
          borderRadius: 12,
          border: "none",
          background: "rgba(255,255,255,0.92)",
          color: "#1e2540",
          fontSize: "clamp(0.75rem, 3.2vw, 0.8125rem)",
          fontWeight: 600,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        Done
      </button>
    </div>
  );
}

