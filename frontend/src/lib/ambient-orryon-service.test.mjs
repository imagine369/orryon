import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { canTransitionAmbientState } from "./ambient-avatar-state.ts";
import { planAllowsAmbientSpokenGreeting } from "./ambient-plan.ts";
import {
  effectivePickupThreshold,
  shouldAmbientSleepOnPutDown,
} from "./ambient-orryon-service.ts";

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

describe("shouldAmbientSleepOnPutDown", () => {
  it("stays awake in miniOrb while user is speaking", () => {
    assert.equal(shouldAmbientSleepOnPutDown("miniOrb", true, true), false);
  });

  it("sleeps from miniOrb when conversation ended", () => {
    assert.equal(shouldAmbientSleepOnPutDown("miniOrb", true, false), true);
  });
});

describe("planAllowsAmbientSpokenGreeting", () => {
  it("allows premium tiers only", () => {
    assert.equal(planAllowsAmbientSpokenGreeting("premium"), true);
    assert.equal(planAllowsAmbientSpokenGreeting("premium_plus"), true);
    assert.equal(planAllowsAmbientSpokenGreeting("free"), false);
    assert.equal(planAllowsAmbientSpokenGreeting("pro"), false);
  });
});
