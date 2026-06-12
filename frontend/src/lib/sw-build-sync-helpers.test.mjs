import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  IDLE_BEFORE_RELOAD_MS,
  PWA_UI_MIGRATION_KEYS,
  isBundledBuildNewer,
  isRemoteBuildNewer,
  needsRemoteBuildUpdate,
  pendingPwaMigrations,
  shouldReloadForPendingUpdate,
} from "./sw-build-sync-helpers.ts";

describe("pendingPwaMigrations", () => {
  it("returns all keys when none are set", () => {
    const storage = { getItem: () => null };
    assert.deepEqual(pendingPwaMigrations(PWA_UI_MIGRATION_KEYS, storage), [
      ...PWA_UI_MIGRATION_KEYS,
    ]);
  });

  it("returns only keys that are not yet migrated", () => {
    const storage = {
      getItem: (key) =>
        key === "orryon_floating_buddy_removed_v1" ? "1" : null,
    };
    assert.deepEqual(pendingPwaMigrations(PWA_UI_MIGRATION_KEYS, storage), [
      "orryon_single_chat_avatar_v1",
    ]);
  });

  it("returns empty when all migrations are complete", () => {
    const storage = { getItem: () => "1" };
    assert.deepEqual(pendingPwaMigrations(PWA_UI_MIGRATION_KEYS, storage), []);
  });
});

describe("isRemoteBuildNewer", () => {
  it("returns false when canaries match", () => {
    assert.equal(isRemoteBuildNewer("orr-abc", "orr-abc"), false);
  });

  it("returns true when remote canary differs", () => {
    assert.equal(isRemoteBuildNewer("orr-abc", "orr-def"), true);
  });

  it("returns false when stored or remote is missing", () => {
    assert.equal(isRemoteBuildNewer(null, "orr-abc"), false);
    assert.equal(isRemoteBuildNewer("orr-abc", null), false);
  });
});

describe("needsRemoteBuildUpdate", () => {
  it("returns true when remote differs from the in-memory bundle", () => {
    assert.equal(needsRemoteBuildUpdate("orr-old", "orr-new", "orr-new"), true);
  });

  it("returns true when remote differs from stored canary", () => {
    assert.equal(needsRemoteBuildUpdate("orr-abc", "orr-old", "orr-new"), true);
  });

  it("returns false when bundle, stored, and remote all match", () => {
    assert.equal(needsRemoteBuildUpdate("orr-abc", "orr-abc", "orr-abc"), false);
  });

  it("returns false when remote is missing", () => {
    assert.equal(needsRemoteBuildUpdate("orr-abc", "orr-abc", null), false);
  });
});

describe("isBundledBuildNewer", () => {
  it("returns true when stored canary differs from bundle", () => {
    assert.equal(isBundledBuildNewer("orr-old", "orr-new"), true);
  });

  it("returns false when no stored canary yet", () => {
    assert.equal(isBundledBuildNewer(null, "orr-new"), false);
  });
});

describe("shouldReloadForPendingUpdate", () => {
  it("waits while the tab is hidden", () => {
    assert.equal(
      shouldReloadForPendingUpdate({
        documentHidden: true,
        lastActivityAt: 0,
        now: IDLE_BEFORE_RELOAD_MS + 1,
      }),
      false,
    );
  });

  it("reloads after idle threshold when tab is visible", () => {
    const now = 100_000;
    assert.equal(
      shouldReloadForPendingUpdate({
        documentHidden: false,
        lastActivityAt: now - IDLE_BEFORE_RELOAD_MS,
        now,
      }),
      true,
    );
  });

  it("does not reload while user is active", () => {
    const now = 100_000;
    assert.equal(
      shouldReloadForPendingUpdate({
        documentHidden: false,
        lastActivityAt: now - 1_000,
        now,
      }),
      false,
    );
  });
});
