import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// Inline pure helpers (mirrors ambient-plan.ts + ambient-avatar-state.ts + ambient-orryon-service.ts)
const PICKUP_CONFIDENCE_BASE = 0.75;

function clampAmbientSensitivity(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function effectivePickupThreshold(sensitivity) {
  const clamped = clampAmbientSensitivity(sensitivity);
  const offset = (clamped - 0.5) * 0.2;
  return Math.min(0.95, Math.max(0.55, PICKUP_CONFIDENCE_BASE - offset));
}

function canTransitionAmbientState(from, to) {
  if (from === to) return true;
  switch (from) {
    case "sleeping":
      return to === "awakening";
    case "awakening":
      return to === "active" || to === "sleeping";
    case "active":
      return to === "miniOrb" || to === "sleeping";
    case "miniOrb":
      return to === "active" || to === "sleeping";
    default:
      return false;
  }
}

describe("effectivePickupThreshold", () => {
  it("returns base threshold at mid sensitivity", () => {
    assert.equal(effectivePickupThreshold(0.5), 0.75);
  });

  it("lowers threshold when sensitivity is high", () => {
    assert.equal(effectivePickupThreshold(1), 0.65);
  });

  it("raises threshold when sensitivity is low", () => {
    assert.equal(effectivePickupThreshold(0), 0.85);
  });
});

describe("canTransitionAmbientState", () => {
  it("allows sleeping → awakening only", () => {
    assert.equal(canTransitionAmbientState("sleeping", "awakening"), true);
    assert.equal(canTransitionAmbientState("sleeping", "active"), false);
  });

  it("allows active → miniOrb or sleeping", () => {
    assert.equal(canTransitionAmbientState("active", "miniOrb"), true);
    assert.equal(canTransitionAmbientState("active", "sleeping"), true);
    assert.equal(canTransitionAmbientState("active", "awakening"), false);
  });

  it("allows miniOrb → active or sleeping", () => {
    assert.equal(canTransitionAmbientState("miniOrb", "active"), true);
    assert.equal(canTransitionAmbientState("miniOrb", "sleeping"), true);
  });
});

describe("putDownHoldInMiniOrb (inline)", () => {
  function shouldSleepOnPutDown(state, premiumVoiceHold, conversationActive) {
    if (premiumVoiceHold && state === "active" && conversationActive) {
      return false;
    }
    if (state === "miniOrb" && premiumVoiceHold && conversationActive) {
      return false;
    }
    return state === "active" || state === "miniOrb";
  }

  it("stays awake in miniOrb while user is speaking", () => {
    assert.equal(shouldSleepOnPutDown("miniOrb", true, true), false);
  });

  it("sleeps from miniOrb when conversation ended", () => {
    assert.equal(shouldSleepOnPutDown("miniOrb", true, false), true);
  });
});

describe("planAllowsAmbientSpokenGreeting (inline)", () => {
  function planAllowsAmbientSpokenGreeting(plan) {
    return plan === "premium" || plan === "premium_plus";
  }

  it("allows premium tiers only", () => {
    assert.equal(planAllowsAmbientSpokenGreeting("premium"), true);
    assert.equal(planAllowsAmbientSpokenGreeting("premium_plus"), true);
    assert.equal(planAllowsAmbientSpokenGreeting("free"), false);
    assert.equal(planAllowsAmbientSpokenGreeting("pro"), false);
  });
});
