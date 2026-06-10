"use client";

import { memo } from "react";
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

function ambientOverlayPropsEqual(
  prev: AmbientOverlayProps,
  next: AmbientOverlayProps,
): boolean {
  const prevShow = shouldShowAmbientMiniOrb(
    prev.ambientEnabled,
    prev.ambientState,
    prev.hasMessages,
  );
  const nextShow = shouldShowAmbientMiniOrb(
    next.ambientEnabled,
    next.ambientState,
    next.hasMessages,
  );
  if (!prevShow && !nextShow) return true;

  return (
    prev.ambientEnabled === next.ambientEnabled &&
    prev.ambientState === next.ambientState &&
    prev.hasMessages === next.hasMessages &&
    prev.aliveState === next.aliveState &&
    prev.onOrbTap === next.onOrbTap
  );
}

/** Floating mini-orb layer for ambient mode (put-down hold + active chat). */
export const AmbientOverlay = memo(function AmbientOverlay({
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

  if (!showOrb) return null;

  return (
    <AnimatePresence>
      <AmbientOrb
        key="ambient-orb"
        ambientState={ambientState}
        aliveState={aliveState}
        onTap={onOrbTap}
      />
    </AnimatePresence>
  );
}, ambientOverlayPropsEqual);
