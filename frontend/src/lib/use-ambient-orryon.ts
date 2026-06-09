"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import type { VoiceStatus } from "@/components/chat-input";
import type { AmbientAvatarState } from "@/lib/ambient-avatar-state";
import {
  AMBIENT_INACTIVITY_MS,
  AmbientOrryonService,
  type AmbientOrryonCallbacks,
} from "@/lib/ambient-orryon-service";
import {
  normalizeAmbientSoundStyle,
  planAllowsAmbientSpokenGreeting,
  planAllowsAmbientVoiceHold,
} from "@/lib/ambient-plan";
import type { UserPreferences } from "@/lib/use-preferences";
import { primeAmbientAudioContext } from "@/lib/ambient-audio";
import {
  playAmbientSleepSequence,
  playAmbientWakeSequence,
} from "@/lib/ambient-wake";
import { SensorFusionController } from "@/lib/sensor-fusion";

/** Voice statuses that keep Premium mini-orb on put-down (mic + Orryon TTS). */
const AMBIENT_VOICE_SESSION_STATUSES = new Set<VoiceStatus>([
  "listening",
  "transcribing",
  "speaking",
]);

function isAmbientVoiceSessionActive(status: VoiceStatus): boolean {
  return AMBIENT_VOICE_SESSION_STATUSES.has(status);
}

function isAmbientTestHookEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_AMBIENT_TEST_HOOK === "true"
  );
}

/** Playwright smoke tests: set on `window` before navigation (dev / explicit hook only). */
function readAmbientTestStateOverride(): AmbientAvatarState | null {
  if (!isAmbientTestHookEnabled() || typeof window === "undefined") return null;
  const raw = (window as Window & { __ORRYON_AMBIENT_TEST_STATE__?: string })
    .__ORRYON_AMBIENT_TEST_STATE__;
  if (
    raw === "sleeping" ||
    raw === "awakening" ||
    raw === "active" ||
    raw === "miniOrb"
  ) {
    return raw;
  }
  return null;
}

export interface UseAmbientOrryonOptions {
  prefs: UserPreferences;
  plan: string | undefined | null;
  voiceStatus: VoiceStatus;
  chatStreaming?: boolean;
  chatThinking?: boolean;
  callbacks?: AmbientOrryonCallbacks;
}

/**
 * React hook wrapping AmbientOrryonService — syncs prefs, tier gates, voice VAD,
 * and sensor fusion for pickup / put-down detection.
 */
export function useAmbientOrryon({
  prefs,
  plan,
  voiceStatus,
  chatStreaming = false,
  chatThinking = false,
  callbacks,
}: UseAmbientOrryonOptions) {
  const [ambientState, setAmbientState] = useState<AmbientAvatarState>("sleeping");
  const serviceRef = useRef<AmbientOrryonService | null>(null);
  const fusionRef = useRef<SensorFusionController | null>(null);
  const wakeConfigRef = useRef({
    soundStyle: normalizeAmbientSoundStyle(prefs.ambient_sound_style),
    premiumGreeting: planAllowsAmbientSpokenGreeting(plan),
  });
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
    wakeConfigRef.current = {
      soundStyle: normalizeAmbientSoundStyle(prefs.ambient_sound_style),
      premiumGreeting: planAllowsAmbientSpokenGreeting(plan),
    };
  }, [callbacks, prefs.ambient_sound_style, plan]);

  useEffect(() => {
    const service = new AmbientOrryonService(
      {
        enabled: prefs.ambient_mode_enabled,
        sensitivity: prefs.ambient_sensitivity,
        premiumVoiceHold: planAllowsAmbientVoiceHold(plan),
      },
      {
        onStateChange: (state, previous) => {
          callbacksRef.current?.onStateChange?.(state, previous);
        },
        onWakeStart: () => {
          void playAmbientWakeSequence(wakeConfigRef.current);
          callbacksRef.current?.onWakeStart?.();
        },
        onSleepStart: () => {
          void playAmbientSleepSequence();
          callbacksRef.current?.onSleepStart?.();
        },
      },
    );
    serviceRef.current = service;
    setAmbientState(service.getState());

    const unsubscribe = service.subscribe(setAmbientState);
    return () => {
      unsubscribe();
      service.destroy();
      serviceRef.current = null;
    };
  }, []);

  useEffect(() => {
    serviceRef.current?.updateConfig({
      enabled: prefs.ambient_mode_enabled,
      sensitivity: prefs.ambient_sensitivity,
      premiumVoiceHold: planAllowsAmbientVoiceHold(plan),
    });
  }, [prefs.ambient_mode_enabled, prefs.ambient_sensitivity, plan]);

  useEffect(() => {
    const active =
      planAllowsAmbientVoiceHold(plan) &&
      isAmbientVoiceSessionActive(voiceStatus);
    serviceRef.current?.setConversationActive(active);
  }, [plan, voiceStatus]);

  /** Reset inactivity while chat streams, thinks, or Orryon TTS plays. */
  useEffect(() => {
    const keepAlive =
      chatStreaming || chatThinking || voiceStatus === "speaking";
    if (!keepAlive) return;

    serviceRef.current?.touchActivity();
    const intervalMs = Math.max(30_000, AMBIENT_INACTIVITY_MS - 15_000);
    const intervalId = setInterval(
      () => serviceRef.current?.touchActivity(),
      intervalMs,
    );
    return () => clearInterval(intervalId);
  }, [chatStreaming, chatThinking, voiceStatus]);

  useEffect(() => {
    fusionRef.current?.setAmbientState(ambientState);
  }, [ambientState]);

  useEffect(() => {
    const fusion = new SensorFusionController({
      onPickupConfidence: (score) => {
        serviceRef.current?.reportPickupConfidence(score);
      },
      onPutDown: () => {
        serviceRef.current?.reportPutDown();
      },
      onMotionResumed: () => {
        serviceRef.current?.reportMotionResumed();
      },
    });
    fusionRef.current = fusion;
    fusion.setEnabled(prefs.ambient_mode_enabled);

    return () => {
      void fusion.stop();
      fusionRef.current = null;
    };
  }, []);

  useEffect(() => {
    fusionRef.current?.setEnabled(prefs.ambient_mode_enabled);
  }, [prefs.ambient_mode_enabled]);

  useQueuedEffect(() => {
    const override = readAmbientTestStateOverride();
    if (override && prefs.ambient_mode_enabled) {
      setAmbientState(override);
    }
  }, [prefs.ambient_mode_enabled]);

  /** Prime audio + motion inside a user gesture (settings toggle). */
  const primeAmbientWake = useCallback(async () => {
    primeAmbientAudioContext();
    return fusionRef.current?.primePermission() ?? false;
  }, []);

  const reportMotionResumed = useCallback(() => {
    serviceRef.current?.reportMotionResumed();
  }, []);

  const touchActivity = useCallback(() => {
    serviceRef.current?.touchActivity();
  }, []);

  return {
    ambientState,
    isAmbientEnabled: prefs.ambient_mode_enabled,
    primeAmbientWake,
    reportMotionResumed,
    touchActivity,
  };
}
