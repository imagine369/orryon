"use client";

import { motion } from "framer-motion";
import { OrryonAliveAvatar } from "@/components/orryon-alive-avatar";
import type { AmbientAvatarState } from "@/lib/ambient-avatar-state";
import type { OrryonAliveState } from "@/lib/orryon-alive-state";
import { AMBIENT_AWAKENING_MS } from "@/lib/ambient-orryon-service";
import { cn } from "@/lib/utils";

const PULSE_STATES = new Set<OrryonAliveState>([
  "listening",
  "thinking",
  "streaming",
  "speaking",
]);

type AmbientOrbProps = {
  ambientState: AmbientAvatarState;
  aliveState: OrryonAliveState;
  onTap?: () => void;
  className?: string;
};

/**
 * Small floating orb with Orryon's face — pulses when listening or thinking.
 */
export function AmbientOrb({
  ambientState,
  aliveState,
  onTap,
  className,
}: AmbientOrbProps) {
  const pulseActive = PULSE_STATES.has(aliveState);
  const isAwakening = ambientState === "awakening";
  const avatarSize = 44;

  return (
    <motion.button
      type="button"
      aria-label="Orryon ambient companion"
      onClick={onTap}
      className={cn(
        "fixed z-40 flex items-center justify-center rounded-full",
        "border border-white/[0.12] bg-black/40 backdrop-blur-md",
        "shadow-[0_8px_32px_rgba(0,0,0,0.45)]",
        "bottom-[max(6.5rem,calc(5rem+env(safe-area-inset-bottom)))] right-[max(1rem,env(safe-area-inset-right))] md:bottom-24",
        "h-[clamp(3.25rem,14vw,4.5rem)] w-[clamp(3.25rem,14vw,4.5rem)]",
        "md:right-8 md:h-[4.5rem] md:w-[4.5rem]",
        "transition-colors hover:border-white/[0.2] hover:bg-black/50",
        className,
      )}
      initial={isAwakening ? { scale: 0.2, opacity: 0 } : { scale: 0.85, opacity: 0 }}
      animate={{
        scale: pulseActive ? [1, 1.06, 1] : 1,
        opacity: 1,
      }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={
        isAwakening
          ? { duration: AMBIENT_AWAKENING_MS / 1000, ease: [0.22, 1, 0.36, 1] }
          : pulseActive
            ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.35, ease: "easeOut" }
      }
    >
      <motion.div
        className="pointer-events-none absolute inset-1 rounded-full"
        animate={
          pulseActive
            ? {
                boxShadow: [
                  "0 0 0px 0px rgba(200,160,240,0)",
                  "0 0 18px 6px rgba(200,160,240,0.55)",
                  "0 0 10px 3px rgba(200,160,240,0.3)",
                ],
              }
            : {
                boxShadow: "0 0 12px 3px rgba(200,160,240,0.2)",
              }
        }
        transition={{
          duration: pulseActive ? 1.1 : 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <OrryonAliveAvatar
        size={avatarSize}
        state={aliveState}
        className="relative z-[1]"
      />
    </motion.button>
  );
}
