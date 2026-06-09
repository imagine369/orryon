import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  AMBIENT_GREETING_PRIMARY,
  AMBIENT_GREETING_VARIANT,
  pickAmbientGreeting,
} from "./ambient-greeting.ts";

describe("pickAmbientGreeting", () => {
  it("returns primary when random >= 0.25", () => {
    assert.equal(pickAmbientGreeting(0.5), AMBIENT_GREETING_PRIMARY);
    assert.equal(pickAmbientGreeting(0.25), AMBIENT_GREETING_PRIMARY);
    assert.equal(pickAmbientGreeting(0.99), AMBIENT_GREETING_PRIMARY);
  });

  it("returns variant when random < 0.25", () => {
    assert.equal(pickAmbientGreeting(0.0), AMBIENT_GREETING_VARIANT);
    assert.equal(pickAmbientGreeting(0.24), AMBIENT_GREETING_VARIANT);
  });
});
