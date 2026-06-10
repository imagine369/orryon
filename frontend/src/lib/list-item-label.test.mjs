import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { listItemLabel, listItemMatchesQuery } from "./list-item-label.ts";

describe("listItemLabel", () => {
  it("returns name when notes are empty", () => {
    assert.equal(listItemLabel("milk"), "milk");
    assert.equal(listItemLabel("milk", ""), "milk");
    assert.equal(listItemLabel("milk", "   "), "milk");
  });

  it("appends trimmed notes in parentheses", () => {
    assert.equal(listItemLabel("milk", "2 gallons"), "milk (2 gallons)");
  });
});

describe("listItemMatchesQuery", () => {
  const item = { name: "milk", notes: "2 gallons" };

  it("matches empty query", () => {
    assert.equal(listItemMatchesQuery(item, ""), true);
  });

  it("matches name substring", () => {
    assert.equal(listItemMatchesQuery(item, "mil"), true);
  });

  it("matches notes substring", () => {
    assert.equal(listItemMatchesQuery(item, "gallon"), true);
  });

  it("rejects unrelated query", () => {
    assert.equal(listItemMatchesQuery(item, "bread"), false);
  });
});
