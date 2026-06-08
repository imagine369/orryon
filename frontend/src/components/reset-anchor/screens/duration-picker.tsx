"use client";

import { useState } from "react";
import { FONT } from "@/components/reset-anchor/tokens";


export function DurationPicker({
  options,
  selectedIdx,
  onSelect,
}: {
  options: number[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const [chosen, setChosen] = useState(false);

  const handleSelect = (idx: number) => {
    onSelect(idx);
    setChosen(true);
  };

  const toLabel = (secs: number) => secs < 60 ? `${secs}s` : `${secs / 60} min`;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {options.map((secs, idx) => (
        <button
          key={idx}
          onClick={() => handleSelect(idx)}
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "transparent",
            color: "rgba(255,255,255,0.55)",
            fontSize: 12,
            fontWeight: 500,
            fontFamily: FONT,
            cursor: "pointer",
            opacity: chosen && idx !== selectedIdx ? 0.25 : 1,
            transition: "opacity 0.3s ease",
            WebkitTapHighlightColor: "transparent",
            minWidth: 44,
            textAlign: "center",
          }}
        >
          {toLabel(secs)}
        </button>
      ))}
    </div>
  );
}

