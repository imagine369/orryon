"use client";

import { useEffect, useState } from "react";
import type { ResetAnimation } from "@/lib/reset-scripts";
import { ORB_FILL } from "./tokens";

export function BreathingOrb({
  animation,
  expanded,
  transitionSecs = 4,
}: {
  animation: ResetAnimation;
  expanded: boolean;
  transitionSecs?: number;
}) {
  const [idleExpanded, setIdleExpanded] = useState(false);

  useEffect(() => {
    if (animation !== "none") {
      setIdleExpanded(false);
      return;
    }
    const t = setTimeout(() => setIdleExpanded(true), 400);
    const id = setInterval(() => setIdleExpanded((v) => !v), 3200);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [animation]);

  const scale = (() => {
    if (animation === "none") return idleExpanded ? 1.04 : 0.94;
    if (animation === "orb-double") return expanded ? 1.18 : 0.9;
    return expanded ? 1.2 : 1.0;
  })();

  const transitionDuration = animation === "none" ? 3.2 : transitionSecs;

  return (
    <div
      style={{
        position: "relative",
        width: "clamp(200px, 62vw, 320px)",
        height: "clamp(200px, 62vw, 320px)",
        maxWidth: "min(62vw, 42vh)",
        maxHeight: "min(62vw, 42vh)",
        borderRadius: "50%",
        overflow: "hidden",
        transform: `scale(${scale})`,
        transition: `transform ${transitionDuration}s ease-in-out`,
        opacity: 0.72,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient id="ra-ring-grad" x1="0.3" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#3ecfba" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#a8c8e8" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#8866a0" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#ra-ring-grad)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: ORB_FILL,
        }}
      />
    </div>
  );
}
