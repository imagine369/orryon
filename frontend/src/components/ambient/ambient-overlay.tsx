"use client";

import { AnimatePresence } from "framer-motion";
import { AmbientOrb } from "@/components/ambient/ambient-orb";
import type { AmbientAvatarState } from "@/lib/ambient-avatar-state";
import { shouldShowAmbientMiniOrb } from "@/lib/ambient-alive-state";
import type { OrryonAliveState } from "@/lib/orryon-alive-state";

type AmbientOverlayProps = {
  ambientEnabled: boolean;
  ambientState: AmbientAvatarState;
  aliveState: OrryonAliveState;
  hasMessages: boolean;
  onOrbTap?: () => void;
};

/** Floating mini-orb layer for ambient mode (put-down hold + active chat). */
export function AmbientOverlay({
  ambientEnabled,
  ambientState,
  aliveState,
  hasMessages,
  onOrbTap,
}: AmbientOverlayProps) {
  const showOrb = shouldShowAmbientMiniOrb(
    ambientEnabled,
    ambientState,
    hasMessages,
  );

  return (
    <AnimatePresence>
      {showOrb && (
        <AmbientOrb
          key="ambient-orb"
          ambientState={ambientState}
          aliveState={aliveState}
          onTap={onOrbTap}
        />
      )}
    </AnimatePresence>
  );
}
