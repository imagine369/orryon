/**
 * AmbientOrryonService — core state machine for Smart Ambient Pickup.
 *
 * Orchestrates sleeping → awakening → active ↔ miniOrb → sleeping with:
 * - confidence-gated pickup (> 0.75, adjusted by user sensitivity)
 * - 75s inactivity auto-sleep
 * - put-down: Premium + active voice → miniOrb; otherwise graceful sleep
 *
 * Sensor fusion, audio, haptics, and UI are wired by higher layers (hook + components).
 */

import {
  canTransitionAmbientState,
  type AmbientAvatarState,
} from "@/lib/ambient-avatar-state";
import { clampAmbientSensitivity } from "@/lib/ambient-plan";

export const PICKUP_CONFIDENCE_BASE = 0.75;
export const AMBIENT_INACTIVITY_MS = 75_000;
export const AMBIENT_AWAKENING_MS = 1_200;
export const AMBIENT_PUT_DOWN_DEBOUNCE_MS = 1_500;
export const AMBIENT_PICKUP_DEBOUNCE_MS = 300;

export interface AmbientOrryonConfig {
  enabled: boolean;
  sensitivity: number;
  premiumVoiceHold: boolean;
}

export interface AmbientOrryonCallbacks {
  onStateChange?: (state: AmbientAvatarState, previous: AmbientAvatarState) => void;
  /** Fired once when awakening begins (haptics / SFX / TTS hook). */
  onWakeStart?: () => void;
  /** Fired when entering sleeping from an awake state (settling SFX hook). */
  onSleepStart?: () => void;
}

export type AmbientOrryonListener = (state: AmbientAvatarState) => void;

/** Map user sensitivity (0–1) to pickup threshold offset (±0.1 around base). */
export function effectivePickupThreshold(sensitivity: number): number {
  const clamped = clampAmbientSensitivity(sensitivity);
  const offset = (clamped - 0.5) * 0.2;
  return Math.min(0.95, Math.max(0.55, PICKUP_CONFIDENCE_BASE - offset));
}

export class AmbientOrryonService {
  private state: AmbientAvatarState = "sleeping";
  private config: AmbientOrryonConfig;
  private callbacks: AmbientOrryonCallbacks;
  private listeners = new Set<AmbientOrryonListener>();

  private conversationActive = false;
  private highConfidenceSince: number | null = null;
  private putDownSince: number | null = null;

  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private awakeningTimer: ReturnType<typeof setTimeout> | null = null;
  private putDownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    config: AmbientOrryonConfig,
    callbacks: AmbientOrryonCallbacks = {},
  ) {
    this.config = { ...config };
    this.callbacks = callbacks;
  }

  getState(): AmbientAvatarState {
    return this.state;
  }

  getConfig(): Readonly<AmbientOrryonConfig> {
    return this.config;
  }

  subscribe(listener: AmbientOrryonListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateConfig(patch: Partial<AmbientOrryonConfig>): void {
    this.config = { ...this.config, ...patch };
    if (!this.config.enabled && this.state !== "sleeping") {
      this.transitionTo("sleeping", { sleepCallback: false });
    }
  }

  setConversationActive(active: boolean): void {
    this.conversationActive = active;
    if (active) this.touchActivity();
  }

  /** User interaction, motion while awake, or voice — resets 75s inactivity. */
  touchActivity(): void {
    if (!this.config.enabled || this.state === "sleeping") return;
    this.resetInactivityTimer();
  }

  /**
   * Report fused pickup confidence (0.0–1.0) from sensor fusion layer.
   * Activates only when above threshold for AMBIENT_PICKUP_DEBOUNCE_MS.
   */
  reportPickupConfidence(score: number): void {
    if (!this.config.enabled || this.state !== "sleeping") return;

    const threshold = effectivePickupThreshold(this.config.sensitivity);
    const now = Date.now();

    if (score >= threshold) {
      if (this.highConfidenceSince === null) {
        this.highConfidenceSince = now;
      } else if (now - this.highConfidenceSince >= AMBIENT_PICKUP_DEBOUNCE_MS) {
        this.highConfidenceSince = null;
        this.beginAwakening();
      }
    } else {
      this.highConfidenceSince = null;
    }
  }

  /** Report device set-down from sensor fusion layer. */
  reportPutDown(): void {
    if (!this.config.enabled) return;
    if (this.state !== "active" && this.state !== "miniOrb") return;
    if (
      this.state === "miniOrb" &&
      this.config.premiumVoiceHold &&
      this.conversationActive
    ) {
      return;
    }

    const now = Date.now();
    if (this.putDownSince === null) {
      this.putDownSince = now;
      this.schedulePutDownCheck();
    }
  }

  /** Cancel put-down debounce when motion resumes. */
  reportMotionResumed(): void {
    this.putDownSince = null;
    this.clearPutDownTimer();
    if (this.state === "miniOrb") {
      this.transitionTo("active");
    }
    this.touchActivity();
  }

  destroy(): void {
    this.clearInactivityTimer();
    this.clearAwakeningTimer();
    this.clearPutDownTimer();
    this.listeners.clear();
    this.highConfidenceSince = null;
    this.putDownSince = null;
    this.state = "sleeping";
  }

  private beginAwakening(): void {
    if (!this.transitionTo("awakening")) return;
    this.callbacks.onWakeStart?.();

    this.clearAwakeningTimer();
    this.awakeningTimer = setTimeout(() => {
      this.awakeningTimer = null;
      if (this.state === "awakening") {
        this.transitionTo("active");
        this.resetInactivityTimer();
      }
    }, AMBIENT_AWAKENING_MS);
  }

  private schedulePutDownCheck(): void {
    this.clearPutDownTimer();
    this.putDownTimer = setTimeout(() => {
      this.putDownTimer = null;
      if (this.putDownSince === null) return;
      this.handlePutDownSettled();
    }, AMBIENT_PUT_DOWN_DEBOUNCE_MS);
  }

  private handlePutDownSettled(): void {
    this.putDownSince = null;

    const holdInOrb =
      this.config.premiumVoiceHold &&
      this.conversationActive;

    if (holdInOrb && this.state === "active") {
      this.transitionTo("miniOrb");
      this.resetInactivityTimer();
      return;
    }

    if (
      this.state === "miniOrb" &&
      this.config.premiumVoiceHold &&
      this.conversationActive
    ) {
      this.resetInactivityTimer();
      return;
    }

    if (this.state === "active" || this.state === "miniOrb") {
      this.transitionTo("sleeping", { sleepCallback: true });
    }
  }

  private transitionTo(
    next: AmbientAvatarState,
    opts: { sleepCallback?: boolean } = {},
  ): boolean {
    if (this.state === next) return true;
    if (!canTransitionAmbientState(this.state, next)) return false;

    const previous = this.state;
    this.state = next;

    if (next === "sleeping") {
      this.clearInactivityTimer();
      this.clearAwakeningTimer();
      this.clearPutDownTimer();
      this.highConfidenceSince = null;
      this.putDownSince = null;
      if (opts.sleepCallback) {
        this.callbacks.onSleepStart?.();
      }
    }

    this.callbacks.onStateChange?.(next, previous);
    for (const listener of this.listeners) {
      listener(next);
    }
    return true;
  }

  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    if (this.state === "sleeping" || this.state === "awakening") return;

    this.inactivityTimer = setTimeout(() => {
      this.inactivityTimer = null;
      if (this.state === "active" || this.state === "miniOrb") {
        this.transitionTo("sleeping", { sleepCallback: true });
      }
    }, AMBIENT_INACTIVITY_MS);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer !== null) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private clearAwakeningTimer(): void {
    if (this.awakeningTimer !== null) {
      clearTimeout(this.awakeningTimer);
      this.awakeningTimer = null;
    }
  }

  private clearPutDownTimer(): void {
    if (this.putDownTimer !== null) {
      clearTimeout(this.putDownTimer);
      this.putDownTimer = null;
    }
  }
}
