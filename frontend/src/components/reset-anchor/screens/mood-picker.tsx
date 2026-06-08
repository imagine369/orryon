"use client";

import type { MoodState } from "@/lib/use-reset-anchors";
import { FONT } from "@/components/reset-anchor/tokens";
import { MOOD_OPTIONS } from "@/components/reset-anchor/mood-data";


export function MoodPicker({
  selected,
  onSelect,
}: {
  selected?: MoodState;
  onSelect: (m: MoodState) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
        width: "100%",
        maxWidth: 320,
      }}
    >
      {MOOD_OPTIONS.map((opt) => {
          const active = selected === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "14px 8px",
              borderRadius: 14,
              border: active
                ? "1px solid rgba(255,255,255,0.28)"
                : "1px solid rgba(255,255,255,0.09)",
              background: active ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.03)",
              color: active ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.42)",
              cursor: "pointer",
              transition: "all 0.18s ease",
              fontFamily: FONT,
            }}
          >
            {opt.icon}
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.04em" }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

