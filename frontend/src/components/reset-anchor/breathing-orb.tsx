"use client";

import { useId, useState } from "react";
import { motion } from "framer-motion";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import type { ResetAnimation } from "@/lib/reset-scripts";

/** Square bounds — width and height always match. */
const ORB_SIZE = "min(max(200px, min(62vw, 42vh)), 320px)";

/** Centered fill reads as a sphere; offset fill can look egg-shaped on mobile. */
const BREATHE_ORB_FILL =
  "radial-gradient(circle at 50% 50%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)";

const ORB_SCALE = {
  expanded: 1.12,
  contracted: 0.92,
  idleExpanded: 1.04,
  idleContracted: 0.96,
} as const;

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
    if (animation === "none") {
      return idleExpanded ? ORB_SCALE.idleExpanded : ORB_SCALE.idleContracted;
    }
    return expanded ? ORB_SCALE.expanded : ORB_SCALE.contracted;
  })();

  const transitionDuration = animation === "none" ? 3.2 : transitionSecs;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        width: ORB_SIZE,
        height: ORB_SIZE,
        minWidth: ORB_SIZE,
        minHeight: ORB_SIZE,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        overflow: "visible",
      }}
    >
      <motion.div
        initial={false}
        animate={{ scale }}
        transition={{
          duration: transitionDuration,
          ease: "easeInOut",
        }}
        style={{
          width: ORB_SIZE,
          height: ORB_SIZE,
          minWidth: ORB_SIZE,
          minHeight: ORB_SIZE,
          maxWidth: ORB_SIZE,
          maxHeight: ORB_SIZE,
          borderRadius: "50%",
          overflow: "hidden",
          opacity: 0.72,
          transformOrigin: "center center",
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          clipPath: "circle(50% at 50% 50%)",
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
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: BREATHE_ORB_FILL,
          }}
        />
      </motion.div>
    </div>
  );
}
