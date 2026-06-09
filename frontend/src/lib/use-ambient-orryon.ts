"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStatus } from "@/components/chat-input";
import type { AmbientAvatarState } from "@/lib/ambient-avatar-state";
import {
  AmbientOrryonService,
  type AmbientOrryonCallbacks,
} from "@/lib/ambient-orryon-service";
import {
  normalizeAmbientSoundStyle,
  planAllowsAmbientSpokenGreeting,
  planAllowsAmbientVoiceHold,
} from "@/lib/ambient-plan";
import type { UserPreferences } from "@/lib/use-preferences";
import { SensorFusionController } from "@/lib/sensor-fusion";

/** User speech only — not Orryon thinking/TTS (put-down VAD hold). */
const USER_SPEAKING_STATUSES = new Set<VoiceStatus>([
  "listening",
  "transcribing",
]);

function isUserSpeaking(status: VoiceStatus): boolean {
  return USER_SPEAKING_STATUSES.has(status);
}

export interface UseAmbientOrryonOptions {
  prefs: UserPreferences;
  plan: string | undefined | null;
  voiceStatus: VoiceStatus;
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
  callbacks,
}: UseAmbientOrryonOptions) {
  const [ambientState, setAmbientState] = useState<AmbientAvatarState>("sleeping");
  const serviceRef = useRef<AmbientOrryonService | null>(null);
  const fusionRef = useRef<SensorFusionController | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const service = new AmbientOrryonService(
      {
        enabled: prefs.ambient_mode_enabled,
        sensitivity: prefs.ambient_sensitivity,
        soundStyle: normalizeAmbientSoundStyle(prefs.ambient_sound_style),
        premiumGreeting: planAllowsAmbientSpokenGreeting(plan),
        premiumVoiceHold: planAllowsAmbientVoiceHold(plan),
      },
      {
        onStateChange: (state, previous) => {
          callbacksRef.current?.onStateChange?.(state, previous);
        },
        onWakeStart: () => callbacksRef.current?.onWakeStart?.(),
        onSleepStart: () => callbacksRef.current?.onSleepStart?.(),
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
      soundStyle: normalizeAmbientSoundStyle(prefs.ambient_sound_style),
      premiumGreeting: planAllowsAmbientSpokenGreeting(plan),
      premiumVoiceHold: planAllowsAmbientVoiceHold(plan),
    });
  }, [
    prefs.ambient_mode_enabled,
    prefs.ambient_sensitivity,
    prefs.ambient_sound_style,
    plan,
  ]);

  useEffect(() => {
    const active =
      planAllowsAmbientVoiceHold(plan) && isUserSpeaking(voiceStatus);
    serviceRef.current?.setConversationActive(active);
  }, [plan, voiceStatus]);

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

  const primeAmbientMotion = useCallback(async () => {
    return fusionRef.current?.primePermission() ?? false;
  }, []);

  const reportPickupConfidence = useCallback((score: number) => {
    serviceRef.current?.reportPickupConfidence(score);
  }, []);

  const reportPutDown = useCallback(() => {
    serviceRef.current?.reportPutDown();
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
    primeAmbientMotion,
    reportPickupConfidence,
    reportPutDown,
    reportMotionResumed,
    touchActivity,
    service: serviceRef,
  };
}
