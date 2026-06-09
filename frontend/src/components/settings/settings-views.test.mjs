import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { SETTINGS_SUB_PANEL_VIEWS } from "./settings-views.ts";

describe("settings sub-panels after split", () => {
  it("includes every leaf view used by SettingsViewContent", () => {
    const expected = [
      "security-access",
      "security",
      "sessions",
      "connected",
      "privacy-safety",
      "data",
      "notifications",
      "financial",
      "subscription",
      "account",
      "app",
      "memory",
      "health",
      "location",
      "briefing",
      "accessibility",
      "ambient",
    ];
    assert.deepEqual([...SETTINGS_SUB_PANEL_VIEWS], expected);
  });

  it("has no duplicate panel ids", () => {
    const unique = new Set(SETTINGS_SUB_PANEL_VIEWS);
    assert.equal(unique.size, SETTINGS_SUB_PANEL_VIEWS.length);
  });
});
