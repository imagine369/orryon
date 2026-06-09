import test from "node:test";
import assert from "node:assert/strict";
import { extractFulfillmentHandoffs } from "./extract-fulfillment-handoffs.ts";

test("extractFulfillmentHandoffs returns empty for missing actions", () => {
  assert.deepEqual(extractFulfillmentHandoffs(undefined), []);
  assert.deepEqual(extractFulfillmentHandoffs([]), []);
});

test("extractFulfillmentHandoffs pulls handoffs from tool result", () => {
  const actions = [
    {
      tool: "create_fulfillment_handoff",
      args: {},
      result: {
        status: "ok",
        handoffs: [
          {
            id: "h1",
            type: "ride",
            title: "Uber to dinner",
            subtitle: "Home → Restaurant",
            action_label: "Open Uber",
            action_url: "https://m.uber.com/ul/",
            status: "pending",
            created_at: "2026-06-09T00:00:00Z",
          },
        ],
      },
    },
  ];
  const out = extractFulfillmentHandoffs(actions);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Uber to dinner");
});

test("extractFulfillmentHandoffs ignores unrelated tools", () => {
  const actions = [{ tool: "log_expense", result: { status: "ok" } }];
  assert.deepEqual(extractFulfillmentHandoffs(actions), []);
});
