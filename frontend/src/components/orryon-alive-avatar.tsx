"use client";

import { motion, type TargetAndTransition } from "framer-motion";
import { cn } from "@/lib/utils";
import type { OrryonAliveState } from "@/lib/orryon-alive-state";

const breatheAnim: TargetAndTransition = {
  scale: [1, 1.035, 1, 1.035, 1],
  transition: { duration: 4.2, repeat: Infinity, ease: "easeInOut" },
};

const ACTIVE_STATES = new Set<OrryonAliveState>([
  "listening",
  "thinking",
  "streaming",
  "speaking",
]);

type OrryonAliveAvatarProps = {
  size: number;
  state?: OrryonAliveState;
  className?: string;
  priority?: boolean;
  /** Subtle idle pulse when state is idle (hero / empty chat). */
  idlePulse?: boolean;
};

export function OrryonAliveAvatar({
  size,
  state = "idle",
  className,
  priority,
  idlePulse = false,
}: OrryonAliveAvatarProps) {
  const glowActive = ACTIVE_STATES.has(state);
  const showIdlePulse = !glowActive && idlePulse;

  return (
    <motion.div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      animate={
        state === "listening"
          ? { scale: [1, 1.06, 1], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } }
          : breatheAnim
      }
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-full"
        animate={
          glowActive
            ? {
                boxShadow: [
                  "0 0 0px 0px rgba(200,160,240,0)",
                  state === "listening"
                    ? "0 0 22px 8px rgba(200,160,240,0.65)"
                    : "0 0 18px 6px rgba(200,160,240,0.55)",
                  state === "listening"
                    ? "0 0 12px 4px rgba(200,160,240,0.35)"
                    : "0 0 10px 3px rgba(200,160,240,0.30)",
                ],
              }
            : showIdlePulse
              ? {
                  boxShadow: [
                    "0 0 0px 0px rgba(200,160,240,0)",
                    "0 0 12px 3px rgba(200,160,240,0.18)",
                    "0 0 0px 0px rgba(200,160,240,0)",
                  ],
                }
              : { boxShadow: "0 0 0px 0px rgba(200,160,240,0)" }
        }
        transition={{
          duration: glowActive ? 0.9 : 4.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Plain img + explicit px sizing — Next/Image did not honor size in chat layout */}
      <img
        src="/avatar.png"
        alt="Orryon"
        width={size}
        height={size}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        draggable={false}
        className="relative rounded-full object-cover ring-1 ring-white/[0.08] select-none"
        style={{ width: size, height: size }}
      />
    </motion.div>
  );
}
