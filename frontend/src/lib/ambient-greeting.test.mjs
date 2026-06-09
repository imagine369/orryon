import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

const PRIMARY = "There you are. What can I do?";
const VARIANT = "There you are… What can I do for you?";

function pickAmbientGreeting(random) {
  return random < 0.25 ? VARIANT : PRIMARY;
}

describe("pickAmbientGreeting", () => {
  it("returns primary when random >= 0.25", () => {
    assert.equal(pickAmbientGreeting(0.5), PRIMARY);
    assert.equal(pickAmbientGreeting(0.25), PRIMARY);
    assert.equal(pickAmbientGreeting(0.99), PRIMARY);
  });

  it("returns variant when random < 0.25", () => {
    assert.equal(pickAmbientGreeting(0.0), VARIANT);
    assert.equal(pickAmbientGreeting(0.24), VARIANT);
  });
});
