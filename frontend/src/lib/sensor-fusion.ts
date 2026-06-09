/**
 * Sensor fusion for Smart Ambient Pickup — accelerometer, gyroscope,
 * proximity, ambient light, and touch/grip with weighted confidence (0–1).
 *
 * Feeds AmbientOrryonService via pickup / put-down / motion-resume callbacks.
 * Uses @capacitor/motion on native shells and DeviceMotionEvent on web.
 */

import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type { AmbientAvatarState } from "@/lib/ambient-avatar-state";
import {
  MOTION_PROBE_TIMEOUT_MS,
  readAmbientMotionGrantedStorage,
  storeAmbientMotionGranted,
  validateAmbientMotionStorageGrant,
  wasAmbientMotionPermissionGranted,
} from "@/lib/ambient-motion-permission";
import { deviceMotionRequiresGesture } from "@/lib/platform";

export { wasAmbientMotionPermissionGranted };

export const FUSION_WEIGHTS = {
  motion: 0.35,
  proximity: 0.30,
  light: 0.15,
  gyro: 0.1,
  touch: 0.1,
} as const;

export const PUT_DOWN_CONFIDENCE_THRESHOLD = 0.75;
export const MOTION_RESUMED_THRESHOLD = 0.45;
export const SAMPLE_THROTTLE_SLEEPING_MS = 100;
export const SAMPLE_THROTTLE_AWAKE_MS = 150;
export const SAMPLE_THROTTLE_MINIORB_MS = 300;

/** Sample interval by ambient avatar state (battery vs responsiveness). */
export function sampleThrottleMsForAmbientState(state: AmbientAvatarState): number {
  if (state === "sleeping") return SAMPLE_THROTTLE_SLEEPING_MS;
  if (state === "miniOrb") return SAMPLE_THROTTLE_MINIORB_MS;
  return SAMPLE_THROTTLE_AWAKE_MS;
}

export const PUT_DOWN_SUSTAIN_MS = 400;
export const MOTION_RESUMED_DEBOUNCE_MS = 500;
export const TOUCH_DECAY_MS = 2_000;

const activeFusionControllers = new Set<SensorFusionController>();

function notifyActiveFusionMotionGrant(): void {
  for (const controller of activeFusionControllers) {
    void controller.applyMotionPermissionGrant();
  }
}

/** Detach motion listeners on all live fusion instances (e.g. permission revoked). */
export function notifyActiveFusionMotionRevoked(): void {
  for (const controller of activeFusionControllers) {
    void controller.handleMotionPermissionRevoked();
  }
}

function storeMotionGranted(granted: boolean): void {
  storeAmbientMotionGranted(granted, granted ? notifyActiveFusionMotionGrant : undefined);
}

async function validateStoredMotionPermission(): Promise<boolean> {
  return validateAmbientMotionStorageGrant({
    timeoutMs: MOTION_PROBE_TIMEOUT_MS,
    onRevoked: notifyActiveFusionMotionRevoked,
  });
}

export interface SensorReading {
  motion: number;
  gyro: number;
  proximity: number;
  light: number;
  touch: number;
}

export interface SensorFusionCallbacks {
  onPickupConfidence: (score: number) => void;
  onPutDown: () => void;
  onMotionResumed: () => void;
}

type Vec3 = { x: number; y: number; z: number };

type MotionSample = {
  accel: Vec3;
  rotationRate: Vec3;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function vecMag(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vecDelta(a: Vec3, b: Vec3): number {
  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,
  );
}

/** Weighted pickup confidence from fused sensor readings. */
export function fusePickupConfidence(reading: SensorReading): number {
  const w = FUSION_WEIGHTS;
  return clamp01(
    reading.motion * w.motion +
      reading.proximity * w.proximity +
      reading.light * w.light +
      reading.gyro * w.gyro +
      reading.touch * w.touch,
  );
}

/** Put-down: stillness, far proximity, stable orientation, no touch. */
export function fusePutDownConfidence(reading: SensorReading): number {
  const w = FUSION_WEIGHTS;
  const stillness = 1 - reading.motion;
  const stability = 1 - reading.gyro;
  const far = 1 - reading.proximity;
  const uncovered = 1 - reading.light;
  const noTouch = 1 - reading.touch;
  return clamp01(
    stillness * w.motion +
      far * w.proximity +
      uncovered * w.light +
      stability * w.gyro +
      noTouch * w.touch,
  );
}

export function scoreMotionDelta(deltaMs2: number): number {
  return clamp01(deltaMs2 / 2.5);
}

export function scoreGyroMagnitude(degPerSec: number): number {
  return clamp01(degPerSec / 120);
}

/** Infer lift / near-face from gravity vector when proximity API is absent. */
export function scoreProximityHeuristic(accelWithGravity: Vec3): number {
  const g = vecMag(accelWithGravity) || 1;
  const nz = Math.abs(accelWithGravity.z) / g;
  const tilt = 1 - nz;
  return clamp01(tilt * 1.4);
}

export function scoreLightPickup(
  illuminance: number | null,
  baseline: number | null,
  tilt: number,
): number {
  if (illuminance != null && baseline != null && baseline > 0) {
    const drop = (baseline - illuminance) / baseline;
    return clamp01(drop * 2.5);
  }
  return clamp01(tilt * 0.65);
}

export function scoreTouchDecay(lastTouchAt: number, now: number): number {
  const elapsed = now - lastTouchAt;
  if (elapsed > TOUCH_DECAY_MS) return 0;
  return clamp01(1 - elapsed / TOUCH_DECAY_MS);
}

/**
 * Request motion sensor permission (iOS Safari). Call inside a user gesture.
 * Returns true when accelerometer data may be collected.
 */
export async function requestAmbientMotionPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (Capacitor.isNativePlatform()) {
    notifyActiveFusionMotionGrant();
    return true;
  }

  const motionCtor = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<PermissionState>;
  };

  if (typeof motionCtor?.requestPermission === "function") {
    try {
      const result = await motionCtor.requestPermission();
      const granted = result === "granted";
      storeMotionGranted(granted);
      return granted;
    } catch {
      storeMotionGranted(false);
      return false;
    }
  }

  const granted = "DeviceMotionEvent" in window;
  if (granted) storeMotionGranted(true);
  return granted;
}

export class SensorFusionController {
  private callbacks: SensorFusionCallbacks;
  private enabled = false;
  private ambientState: AmbientAvatarState = "sleeping";
  private running = false;
  private permissionGranted = false;

  private accelListener: PluginListenerHandle | null = null;
  private proximitySensor: ProximitySensor | null = null;
  private lightSensor: AmbientLightSensor | null = null;

  private baselineAccel: Vec3 = { x: 0, y: 0, z: 9.81 };
  private lastTouchAt = 0;
  private proximityNear: boolean | null = null;
  private lightLevel: number | null = null;
  private lightBaseline: number | null = null;

  private lastSampleAt = 0;
  private putDownHighSince: number | null = null;
  private lastMotionResumedAt = 0;
  private putDownSignaled = false;

  private onDeviceMotion = (event: DeviceMotionEvent) => {
    this.handleMotionSample(this.sampleFromDeviceMotion(event));
  };

  private onTouch = () => {
    this.lastTouchAt = Date.now();
    void this.ensurePermissionFromGesture();
  };

  private async ensurePermissionFromGesture(): Promise<void> {
    if (this.permissionGranted || !this.enabled) return;
    if (readAmbientMotionGrantedStorage()) {
      this.permissionGranted = deviceMotionRequiresGesture()
        ? await validateStoredMotionPermission()
        : true;
      if (!this.permissionGranted) {
        this.permissionGranted = await requestAmbientMotionPermission();
      }
    } else {
      this.permissionGranted = await requestAmbientMotionPermission();
    }
    if (this.permissionGranted && !this.accelListener) {
      await this.attachMotion();
      this.attachAuxiliarySensors();
    }
  }

  /** Drop cached grant when motion events stop (revoked permission). */
  async handleMotionPermissionRevoked(): Promise<void> {
    this.permissionGranted = false;
    if (this.accelListener) {
      await this.accelListener.remove();
      this.accelListener = null;
    }
    this.detachAuxiliarySensors();
  }

  private onProximityReading = () => {
    if (this.proximitySensor) {
      this.proximityNear = this.proximitySensor.near;
    }
  };

  private onLightReading = () => {
    if (this.lightSensor) {
      this.lightLevel = this.lightSensor.illuminance;
      if (this.lightBaseline === null) {
        this.lightBaseline = this.lightSensor.illuminance;
      }
    }
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      void this.pause();
    } else if (this.enabled) {
      void this.resume();
    }
  };

  constructor(callbacks: SensorFusionCallbacks) {
    this.callbacks = callbacks;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      void this.stop();
    } else if (!document.hidden) {
      void this.start();
    }
  }

  setAmbientState(state: AmbientAvatarState): void {
    this.ambientState = state;
    this.putDownHighSince = null;
    this.putDownSignaled = false;
  }

  /**
   * Sync permission + attach sensors when grant happens outside this instance
   * (e.g. settings panel calling requestAmbientMotionPermission).
   */
  async applyMotionPermissionGrant(): Promise<void> {
    if (!Capacitor.isNativePlatform() && !readAmbientMotionGrantedStorage()) {
      return;
    }
    this.permissionGranted = true;
    if (!this.enabled || !this.running || this.accelListener) return;
    await this.attachMotion();
    this.attachAuxiliarySensors();
  }

  /** Prime motion permission inside a user gesture (e.g. settings toggle). */
  async primePermission(): Promise<boolean> {
    if (!this.permissionGranted) {
      if (readAmbientMotionGrantedStorage()) {
        this.permissionGranted = deviceMotionRequiresGesture()
          ? await validateStoredMotionPermission()
          : true;
        if (!this.permissionGranted) {
          this.permissionGranted = await requestAmbientMotionPermission();
        }
      } else {
        this.permissionGranted = await requestAmbientMotionPermission();
      }
    }
    if (this.permissionGranted && this.running && this.enabled && !this.accelListener) {
      await this.attachMotion();
      this.attachAuxiliarySensors();
    }
    return this.permissionGranted;
  }

  async start(): Promise<void> {
    if (this.running || typeof window === "undefined" || !this.enabled) return;
    this.running = true;
    activeFusionControllers.add(this);

    if (!this.permissionGranted) {
      if (Capacitor.isNativePlatform()) {
        this.permissionGranted = true;
      } else if (readAmbientMotionGrantedStorage()) {
        this.permissionGranted = deviceMotionRequiresGesture()
          ? await validateStoredMotionPermission()
          : true;
      } else if (!deviceMotionRequiresGesture()) {
        this.permissionGranted = await requestAmbientMotionPermission();
      }
    }

    window.addEventListener("touchstart", this.onTouch, { passive: true });
    window.addEventListener("pointerdown", this.onTouch, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    if (this.permissionGranted) {
      await this.attachMotion();
      this.attachAuxiliarySensors();
    }
  }

  async stop(): Promise<void> {
    activeFusionControllers.delete(this);
    if (!this.running && !this.accelListener) return;
    this.running = false;

    window.removeEventListener("touchstart", this.onTouch);
    window.removeEventListener("pointerdown", this.onTouch);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    if (this.accelListener) {
      await this.accelListener.remove();
      this.accelListener = null;
    }

    this.detachAuxiliarySensors();
    this.putDownHighSince = null;
    this.putDownSignaled = false;
  }

  private async pause(): Promise<void> {
    if (this.accelListener) {
      await this.accelListener.remove();
      this.accelListener = null;
    }
    this.detachAuxiliarySensors();
  }

  private async resume(): Promise<void> {
    if (!this.enabled || document.hidden) return;
    if (deviceMotionRequiresGesture() && (this.permissionGranted || readAmbientMotionGrantedStorage())) {
      const valid = await validateStoredMotionPermission();
      this.permissionGranted = valid;
      if (!valid) return;
    } else if (!this.permissionGranted) {
      return;
    }
    await this.attachMotion();
    this.attachAuxiliarySensors();
  }

  private async attachMotion(): Promise<void> {
    if (this.accelListener) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const { Motion } = await import("@capacitor/motion");
        this.accelListener = await Motion.addListener("accel", (event) => {
          const accel = event.accelerationIncludingGravity ?? event.acceleration;
          const rotation = event.rotationRate;
          if (!accel) return;
          this.handleMotionSample({
            accel: { x: accel.x ?? 0, y: accel.y ?? 0, z: accel.z ?? 0 },
            rotationRate: {
              x: rotation?.beta ?? 0,
              y: rotation?.gamma ?? 0,
              z: rotation?.alpha ?? 0,
            },
          });
        });
        return;
      } catch {
        // Fall through to DeviceMotion if the native plugin is unavailable.
      }
    }

    window.addEventListener("devicemotion", this.onDeviceMotion, { passive: true });
    this.accelListener = {
      remove: async () => {
        window.removeEventListener("devicemotion", this.onDeviceMotion);
      },
    };
  }

  private attachAuxiliarySensors(): void {
    if (typeof ProximitySensor !== "undefined" && !this.proximitySensor) {
      try {
        const sensor = new ProximitySensor();
        sensor.addEventListener("reading", this.onProximityReading);
        sensor.start();
        this.proximitySensor = sensor;
      } catch {
        this.proximitySensor = null;
      }
    }

    if (typeof AmbientLightSensor !== "undefined" && !this.lightSensor) {
      try {
        const sensor = new AmbientLightSensor();
        sensor.addEventListener("reading", this.onLightReading);
        sensor.start();
        this.lightSensor = sensor;
      } catch {
        this.lightSensor = null;
      }
    }
  }

  private detachAuxiliarySensors(): void {
    if (this.proximitySensor) {
      try {
        this.proximitySensor.removeEventListener("reading", this.onProximityReading);
        this.proximitySensor.stop();
      } catch {
        // sensor may already be stopped
      }
      this.proximitySensor = null;
      this.proximityNear = null;
    }

    if (this.lightSensor) {
      try {
        this.lightSensor.removeEventListener("reading", this.onLightReading);
        this.lightSensor.stop();
      } catch {
        // sensor may already be stopped
      }
      this.lightSensor = null;
    }
  }

  private sampleFromDeviceMotion(event: DeviceMotionEvent): MotionSample {
    const accel = event.accelerationIncludingGravity ?? event.acceleration;
    const rotation = event.rotationRate;
    return {
      accel: {
        x: accel?.x ?? 0,
        y: accel?.y ?? 0,
        z: accel?.z ?? 0,
      },
      rotationRate: {
        x: rotation?.beta ?? 0,
        y: rotation?.gamma ?? 0,
        z: rotation?.alpha ?? 0,
      },
    };
  }

  private handleMotionSample(sample: MotionSample): void {
    if (!this.enabled || document.hidden) return;

    const now = Date.now();
    const throttleMs = sampleThrottleMsForAmbientState(this.ambientState);
    if (now - this.lastSampleAt < throttleMs) return;
    this.lastSampleAt = now;

    const delta = vecDelta(sample.accel, this.baselineAccel);
    const gyroMag = vecMag(sample.rotationRate);
    const motionScore = scoreMotionDelta(delta);
    const gyroScore = scoreGyroMagnitude(gyroMag);
    const tilt = scoreProximityHeuristic(sample.accel);

    const proximityScore = this.scoreProximity(sample.accel);
    const lightScore = scoreLightPickup(
      this.lightLevel,
      this.lightBaseline,
      tilt,
    );
    const touchScore = scoreTouchDecay(this.lastTouchAt, now);

    this.updateBaseline(sample.accel, motionScore, gyroScore);

    const reading: SensorReading = {
      motion: motionScore,
      gyro: gyroScore,
      proximity: proximityScore,
      light: lightScore,
      touch: touchScore,
    };

    if (this.ambientState === "sleeping") {
      this.callbacks.onPickupConfidence(fusePickupConfidence(reading));
      return;
    }

    if (this.ambientState !== "active" && this.ambientState !== "miniOrb") return;

    const putDownScore = fusePutDownConfidence(reading);
    if (putDownScore >= PUT_DOWN_CONFIDENCE_THRESHOLD) {
      if (this.putDownHighSince === null) {
        this.putDownHighSince = now;
      } else if (
        !this.putDownSignaled &&
        now - this.putDownHighSince >= PUT_DOWN_SUSTAIN_MS
      ) {
        this.putDownSignaled = true;
        this.callbacks.onPutDown();
      }
    } else {
      this.putDownHighSince = null;
      this.putDownSignaled = false;
    }

    if (
      motionScore >= MOTION_RESUMED_THRESHOLD &&
      now - this.lastMotionResumedAt >= MOTION_RESUMED_DEBOUNCE_MS
    ) {
      this.lastMotionResumedAt = now;
      this.putDownHighSince = null;
      this.putDownSignaled = false;
      this.callbacks.onMotionResumed();
    }
  }

  private scoreProximity(accel: Vec3): number {
    const heuristic = scoreProximityHeuristic(accel);
    if (this.proximityNear === true) return Math.max(heuristic, 0.92);
    if (this.proximityNear === false) return Math.min(heuristic, 0.35);
    return heuristic;
  }

  private updateBaseline(accel: Vec3, motionScore: number, gyroScore: number): void {
    if (motionScore < 0.12 && gyroScore < 0.15) {
      const alpha = 0.08;
      this.baselineAccel = {
        x: this.baselineAccel.x * (1 - alpha) + accel.x * alpha,
        y: this.baselineAccel.y * (1 - alpha) + accel.y * alpha,
        z: this.baselineAccel.z * (1 - alpha) + accel.z * alpha,
      };
      if (this.lightLevel != null && this.lightBaseline != null) {
        this.lightBaseline =
          this.lightBaseline * 0.95 + this.lightLevel * 0.05;
      }
    }
  }
}
