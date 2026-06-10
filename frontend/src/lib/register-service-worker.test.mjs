import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  hasOrryonServiceWorker,
  serviceWorkerScriptUrl,
} from "./register-service-worker.ts";

function reg(scriptURL) {
  return {
    active: scriptURL ? { scriptURL } : null,
    waiting: null,
    installing: null,
  };
}

describe("serviceWorkerScriptUrl", () => {
  it("prefers the active worker script", () => {
    assert.equal(
      serviceWorkerScriptUrl({
        active: { scriptURL: "https://x/sw.js" },
        waiting: { scriptURL: "https://x/old.js" },
        installing: null,
      }),
      "https://x/sw.js",
    );
  });
});

describe("hasOrryonServiceWorker", () => {
  it("detects an existing Orryon worker", () => {
    assert.equal(
      hasOrryonServiceWorker(reg("https://orryon.vercel.app/sw.js")),
      true,
    );
  });

  it("returns false when unregistered", () => {
    assert.equal(hasOrryonServiceWorker(undefined), false);
    assert.equal(hasOrryonServiceWorker(reg(null)), false);
  });

  it("returns false for unrelated workers", () => {
    assert.equal(
      hasOrryonServiceWorker(reg("https://example.com/other-sw.js")),
      false,
    );
  });
});
