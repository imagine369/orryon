import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveAmbientAliveState,
  shouldShowAmbientCenterAvatar,
  shouldShowAmbientMiniOrb,
} from "./ambient-alive-state.ts";

describe("shouldShowAmbientCenterAvatar", () => {
  it("shows center avatar when awakening on empty chat", () => {
    assert.equal(shouldShowAmbientCenterAvatar(true, "awakening", false), true);
  });

  it("shows center avatar when active on empty chat", () => {
    assert.equal(shouldShowAmbientCenterAvatar(true, "active", false), true);
  });

  it("hides center avatar when miniOrb even without messages", () => {
    assert.equal(shouldShowAmbientCenterAvatar(true, "miniOrb", false), false);
  });

  it("hides center avatar when chat has messages", () => {
    assert.equal(shouldShowAmbientCenterAvatar(true, "active", true), false);
  });

  it("hides when ambient is disabled or sleeping", () => {
    assert.equal(shouldShowAmbientCenterAvatar(false, "active", false), false);
    assert.equal(shouldShowAmbientCenterAvatar(true, "sleeping", false), false);
  });
});

describe("resolveAmbientAliveState", () => {
  it("passes through chat state when ambient is sleeping", () => {
    assert.equal(resolveAmbientAliveState("sleeping", "thinking"), "thinking");
  });

  it("keeps active chat/voice states while ambient is awake", () => {
    assert.equal(resolveAmbientAliveState("active", "listening"), "listening");
    assert.equal(resolveAmbientAliveState("miniOrb", "speaking"), "speaking");
  });

  it("normalizes to idle when ambient is awake and chat is idle", () => {
    assert.equal(resolveAmbientAliveState("active", "idle"), "idle");
    assert.equal(resolveAmbientAliveState("miniOrb", "idle"), "idle");
  });
});

describe("shouldShowAmbientMiniOrb", () => {
  it("shows mini orb in miniOrb state (including during active voice hold)", () => {
    assert.equal(shouldShowAmbientMiniOrb(true, "miniOrb", false), true);
    assert.equal(shouldShowAmbientMiniOrb(true, "miniOrb", true), true);
  });

  it("hides mini orb during active chat — thread avatar is the single Orryon", () => {
    assert.equal(shouldShowAmbientMiniOrb(true, "active", true), false);
    assert.equal(shouldShowAmbientMiniOrb(true, "awakening", true), false);
  });

  it("hides mini orb when active on empty chat", () => {
    assert.equal(shouldShowAmbientMiniOrb(true, "active", false), false);
  });

  it("hides when disabled or sleeping", () => {
    assert.equal(shouldShowAmbientMiniOrb(false, "miniOrb", true), false);
    assert.equal(shouldShowAmbientMiniOrb(true, "sleeping", true), false);
  });
});
