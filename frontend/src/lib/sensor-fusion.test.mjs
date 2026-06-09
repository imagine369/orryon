import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  fusePickupConfidence,
  fusePutDownConfidence,
  sampleThrottleMsForAmbientState,
  scoreProximityHeuristic,
} from "./sensor-fusion.ts";

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
