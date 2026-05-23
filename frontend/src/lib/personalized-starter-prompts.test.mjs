import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  pickPersonalizedStarterPrompts,
  DEFAULT_STARTER_PROMPTS,
} from "./personalized-starter-prompts.ts";

describe("pickPersonalizedStarterPrompts", () => {
  it("returns defaults with no history", () => {
    const prompts = pickPersonalizedStarterPrompts([]);
    assert.deepEqual(prompts, DEFAULT_STARTER_PROMPTS);
  });

  it("surfaces finance chips when user talks about spending", () => {
    const prompts = pickPersonalizedStarterPrompts([
      "I spent $40 on groceries yesterday",
      "log my coffee purchase",
      "how much did I spend this month",
    ]);
    const labels = prompts.map((p) => p.label).join(" ");
    assert.match(labels, /Log spending|This month|Recent purchases/i);
    assert.doesNotMatch(labels, /Log lunch/i);
  });

  it("surfaces calendar chips when user asks about schedule", () => {
    const prompts = pickPersonalizedStarterPrompts([
      "What's on my calendar tomorrow?",
      "move my meeting to Friday",
    ]);
    const labels = prompts.map((p) => p.label).join(" ");
    assert.match(labels, /This week|Tomorrow|Find time/i);
  });

  it("uses memory facts as signal", () => {
    const prompts = pickPersonalizedStarterPrompts(
      [],
      ["User tracks meditation daily", "Prefers calm weekend planning"],
    );
    const labels = prompts.map((p) => p.label).join(" ");
    assert.match(labels, /breath|weekend|Plan/i);
  });

  it("seeds chips from onboarding priorities before chat history exists", () => {
    const prompts = pickPersonalizedStarterPrompts([], [], 4, ["health", "calendar"]);
    const labels = prompts.map((p) => p.label).join(" ");
    assert.match(labels, /medication|week|tomorrow|Health visit/i);
  });

  it("lets heavy usage outweigh declared priorities", () => {
    const prompts = pickPersonalizedStarterPrompts(
      [
        "I spent $50 on groceries",
        "log another expense",
        "budget this month",
        "transaction history",
      ],
      [],
      4,
      ["calendar"],
    );
    const labels = prompts.map((p) => p.label).join(" ");
    assert.match(labels, /spending|month|purchase/i);
  });
});
