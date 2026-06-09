import assert from "node:assert/strict";
import test from "node:test";

import {
  clearDemoFlagIfRemote,
  isDemoMode,
  isLocalHostClient,
} from "./demo-mode.ts";

test("isLocalHostClient is false without window", () => {
  assert.equal(isLocalHostClient(), false);
});

test("isDemoMode is false without window", () => {
  assert.equal(isDemoMode(), false);
});

test("clearDemoFlagIfRemote is a no-op without window", () => {
  assert.doesNotThrow(() => clearDemoFlagIfRemote());
});
