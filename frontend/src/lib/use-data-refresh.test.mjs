import { strict as assert } from "node:assert";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  DATA_CHANGED_EVENT,
  QUICK_ACCESS_TAB_KEYS,
  dispatchDataChanged,
  expandDataChangeTabs,
  isMutatingTool,
  notifyChatDataChanged,
  scheduleDataChanged,
} from "./use-data-refresh.ts";

describe("expandDataChangeTabs", () => {
  it("maps schedule to today and calendar", () => {
    const tabs = expandDataChangeTabs(["schedule"]);
    assert.ok(tabs.includes("schedule"));
    assert.ok(tabs.includes("today"));
    assert.ok(tabs.includes("calendar"));
  });

  it("maps lists and errands unchanged", () => {
    assert.deepEqual(expandDataChangeTabs(["lists", "errands"]).sort(), ["errands", "lists"]);
  });
});

describe("isMutatingTool", () => {
  it("treats write tools as mutating", () => {
    assert.equal(isMutatingTool("add_grocery_items"), true);
    assert.equal(isMutatingTool("delete_task"), true);
    assert.equal(isMutatingTool("create_fulfillment_handoff"), true);
  });

  it("treats read/search tools as non-mutating", () => {
    assert.equal(isMutatingTool("get_grocery_list"), false);
    assert.equal(isMutatingTool("search_notes"), false);
    assert.equal(isMutatingTool("get_weather"), false);
  });
});

describe("notifyChatDataChanged", () => {
  let received;

  beforeEach(() => {
    received = null;
    globalThis.window = {
      dispatchEvent(e) {
        received = e;
        return true;
      },
    };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("refreshes all Quick Access tabs when actions were taken", async () => {
    notifyChatDataChanged([{ tool: "add_grocery_items" }], ["lists"]);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(received?.type, DATA_CHANGED_EVENT);
    const tabs = received?.detail?.tabs ?? [];
    assert.ok(tabs.includes("*"));
    for (const key of QUICK_ACCESS_TAB_KEYS) {
      assert.ok(tabs.includes(key), `missing ${key}`);
    }
  });

  it("expands server tabs when no actions", async () => {
    notifyChatDataChanged([], ["schedule"]);
    await new Promise((r) => setTimeout(r, 80));
    const tabs = received?.detail?.tabs ?? [];
    assert.ok(tabs.includes("today"));
    assert.ok(tabs.includes("calendar"));
  });
});

describe("dispatchDataChanged", () => {
  it("no-ops without window", () => {
    const prev = globalThis.window;
    delete globalThis.window;
    assert.doesNotThrow(() => dispatchDataChanged(["lists"]));
    globalThis.window = prev;
  });
});

describe("scheduleDataChanged", () => {
  it("coalesces tab keys into one event", async () => {
    let received = null;
    globalThis.window = {
      dispatchEvent(e) {
        received = e;
        return true;
      },
    };
    scheduleDataChanged(["lists"]);
    scheduleDataChanged(["today"]);
    await new Promise((r) => setTimeout(r, 80));
    const tabs = received?.detail?.tabs ?? [];
    assert.ok(tabs.includes("lists"));
    assert.ok(tabs.includes("today"));
    delete globalThis.window;
  });
});
