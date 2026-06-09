import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const AMBIENT_AWAKE_STATES = new Set(["awakening", "active", "miniOrb"]);

function isAmbientAwake(state) {
  return AMBIENT_AWAKE_STATES.has(state);
}

function shouldShowAmbientMiniOrb(ambientEnabled, ambientState, hasMessages) {
  if (!ambientEnabled || !isAmbientAwake(ambientState)) return false;
  if (ambientState === "miniOrb") return true;
  if (hasMessages && (ambientState === "active" || ambientState === "awakening")) {
    return true;
  }
  return false;
}

function shouldShowAmbientCenterAvatar(ambientEnabled, ambientState, hasMessages) {
  if (!ambientEnabled || !isAmbientAwake(ambientState) || hasMessages) return false;
  if (ambientState === "miniOrb") return false;
  return ambientState === "awakening" || ambientState === "active";
}

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

function resolveAmbientAliveState(ambientState, chatAlive) {
  const awake = isAmbientAwake(ambientState);
  const priority = new Set(["listening", "thinking", "streaming", "speaking"]);
  if (!awake) return chatAlive;
  if (priority.has(chatAlive)) return chatAlive;
  return "idle";
}

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
  it("shows mini orb in miniOrb state", () => {
    assert.equal(shouldShowAmbientMiniOrb(true, "miniOrb", false), true);
    assert.equal(shouldShowAmbientMiniOrb(true, "miniOrb", true), true);
  });

  it("shows mini orb when active with messages", () => {
    assert.equal(shouldShowAmbientMiniOrb(true, "active", true), true);
  });

  it("hides mini orb when active on empty chat", () => {
    assert.equal(shouldShowAmbientMiniOrb(true, "active", false), false);
  });

  it("hides when disabled or sleeping", () => {
    assert.equal(shouldShowAmbientMiniOrb(false, "miniOrb", true), false);
    assert.equal(shouldShowAmbientMiniOrb(true, "sleeping", true), false);
  });
});
