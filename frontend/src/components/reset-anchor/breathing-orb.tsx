"use client";

import { useId, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import type { ResetAnimation } from "@/lib/reset-scripts";
import { ORB_FILL } from "./tokens";

/** One square size token so width/height can never diverge in flex layouts. */
const ORB_SIZE = "min(max(200px, min(62vw, 42vh)), 320px)";

export function BreathingOrb({
  animation,
  expanded,
  transitionSecs = 4,
}: {
  animation: ResetAnimation;
  expanded: boolean;
  transitionSecs?: number;
}) {
  const ringGradientId = useId().replace(/:/g, "");
  const [idleExpanded, setIdleExpanded] = useState(false);

  useQueuedEffect(() => {
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
      aria-hidden="true"
      style={{
        position: "relative",
        width: ORB_SIZE,
        aspectRatio: "1",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          overflow: "hidden",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          transition: `transform ${transitionDuration}s ease-in-out`,
          willChange: "transform",
          opacity: 0.72,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
          }}
        >
          <defs>
            <linearGradient id={ringGradientId} x1="0.3" y1="0" x2="0.7" y2="1">
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
            stroke={`url(#${ringGradientId})`}
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
    </div>
  );
}
