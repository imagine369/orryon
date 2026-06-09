"use client";

import { motion } from "framer-motion";
import { OrryonAliveAvatar } from "@/components/orryon-alive-avatar";
import type { AmbientAvatarState } from "@/lib/ambient-avatar-state";
import type { OrryonAliveState } from "@/lib/orryon-alive-state";
import { AMBIENT_AWAKENING_MS } from "@/lib/ambient-orryon-service";
import { cn } from "@/lib/utils";

type AmbientAvatarProps = {
  ambientState: AmbientAvatarState;
  aliveState: OrryonAliveState;
  size: number;
  className?: string;
  priority?: boolean;
  idlePulse?: boolean;
};

/**
 * Full ambient avatar — expands from a small orb during awakening,
 * then breathes with Orryon glow states (listening / thinking).
 */
export function AmbientAvatar({
  ambientState,
  aliveState,
  size,
  className,
  priority,
  idlePulse = false,
}: AmbientAvatarProps) {
  const isAwakening = ambientState === "awakening";

  return (
    <motion.div
      className={cn("relative shrink-0", className)}
      initial={isAwakening ? { scale: 0.38, opacity: 0.55 } : false}
      animate={{
        scale: 1,
        opacity: 1,
      }}
      transition={
        isAwakening
          ? { duration: AMBIENT_AWAKENING_MS / 1000, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0.35, ease: "easeOut" }
      }
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-full"
        animate={
          isAwakening
            ? {
                boxShadow: [
                  "0 0 0px 0px rgba(200,160,240,0)",
                  "0 0 28px 10px rgba(200,160,240,0.5)",
                  "0 0 14px 5px rgba(200,160,240,0.28)",
                ],
              }
            : undefined
        }
        transition={
          isAwakening
            ? { duration: AMBIENT_AWAKENING_MS / 1000, ease: "easeOut" }
            : undefined
        }
      />
      <OrryonAliveAvatar
        size={size}
        state={aliveState}
        priority={priority}
        idlePulse={idlePulse || isAwakening}
      />
    </motion.div>
  );
}
