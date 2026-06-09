import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const FUSION_WEIGHTS = {
  motion: 0.35,
  proximity: 0.3,
  light: 0.15,
  gyro: 0.1,
  touch: 0.1,
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function fusePickupConfidence(reading) {
  const w = FUSION_WEIGHTS;
  return clamp01(
    reading.motion * w.motion +
      reading.proximity * w.proximity +
      reading.light * w.light +
      reading.gyro * w.gyro +
      reading.touch * w.touch,
  );
}

function fusePutDownConfidence(reading) {
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

function scoreProximityHeuristic(accel) {
  const g = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2) || 1;
  const nz = Math.abs(accel.z) / g;
  const tilt = 1 - nz;
  return clamp01(tilt * 1.4);
}

describe("fusePickupConfidence", () => {
  it("weights sum to a strong pickup when all signals high", () => {
    const score = fusePickupConfidence({
      motion: 1,
      proximity: 1,
      light: 1,
      gyro: 1,
      touch: 1,
    });
    assert.ok(score >= 0.99);
  });

  it("stays below threshold for idle flat device", () => {
    const score = fusePickupConfidence({
      motion: 0.05,
      proximity: 0.1,
      light: 0.1,
      gyro: 0.05,
      touch: 0,
    });
    assert.ok(score < 0.75);
  });
});

describe("fusePutDownConfidence", () => {
  it("is high when device is still on a surface", () => {
    const score = fusePutDownConfidence({
      motion: 0.05,
      proximity: 0.1,
      light: 0.2,
      gyro: 0.05,
      touch: 0,
    });
    assert.ok(score >= 0.75);
  });

  it("is low during active lift", () => {
    const score = fusePutDownConfidence({
      motion: 0.9,
      proximity: 0.85,
      light: 0.7,
      gyro: 0.8,
      touch: 0.6,
    });
    assert.ok(score < 0.5);
  });
});

describe("scoreProximityHeuristic", () => {
  it("scores higher when device is tilted upright", () => {
    const flat = scoreProximityHeuristic({ x: 0, y: 0, z: 9.8 });
    const upright = scoreProximityHeuristic({ x: 0, y: 9.8, z: 0 });
    assert.ok(upright > flat);
  });
});

const SAMPLE_THROTTLE_SLEEPING_MS = 100;
const SAMPLE_THROTTLE_AWAKE_MS = 150;
const SAMPLE_THROTTLE_MINIORB_MS = 300;

function sampleThrottleMsForAmbientState(state) {
  if (state === "sleeping") return SAMPLE_THROTTLE_SLEEPING_MS;
  if (state === "miniOrb") return SAMPLE_THROTTLE_MINIORB_MS;
  return SAMPLE_THROTTLE_AWAKE_MS;
}

describe("sampleThrottleMsForAmbientState", () => {
  it("uses the slowest interval in miniOrb for battery savings", () => {
    assert.equal(sampleThrottleMsForAmbientState("miniOrb"), 300);
    assert.ok(
      sampleThrottleMsForAmbientState("miniOrb") >
        sampleThrottleMsForAmbientState("active"),
    );
  });

  it("keeps pickup responsiveness while sleeping", () => {
    assert.equal(sampleThrottleMsForAmbientState("sleeping"), 100);
    assert.equal(sampleThrottleMsForAmbientState("awakening"), 150);
  });
});
