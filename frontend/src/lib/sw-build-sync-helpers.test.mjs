import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  PWA_UI_MIGRATION_KEYS,
  pendingPwaMigrations,
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
