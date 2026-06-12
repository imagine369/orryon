/**
 * Integration smoke tests for SwBuildSync auto-update.
 * Usage: npm run test:sw-build-sync:local
 */
import { strict as assert } from "node:assert";
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";
const LS_CANARY_KEY = "orryon_build_canary";
const MIGRATION_KEYS = [
  "orryon_floating_buddy_removed_v1",
  "orryon_single_chat_avatar_v1",
];

let passed = 0;
let failed = 0;

async function run(name, fn) {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function testBuildApi() {
  const res = await fetch(`${BASE}/api/build`, { cache: "no-store" });
  assert.equal(res.status, 200, "GET /api/build should return 200");
  assert.match(
    res.headers.get("cache-control") || "",
    /no-store/i,
    "Cache-Control should include no-store",
  );
  const body = await res.json();
  assert.equal(typeof body.canary, "string", "Response should include canary string");
  assert.ok(body.canary.length > 0, "canary should be non-empty");
}

function primeStorageScript() {
  return (keys) => {
    for (const key of keys) localStorage.setItem(key, "1");
    sessionStorage.removeItem("orryon_cache_bust_in_progress");
  };
}

async function testNoReloadLoopOnStableLoad() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(primeStorageScript(), MIGRATION_KEYS);
  const page = await context.newPage();
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  try {
    await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const navAfterLoad = navigations;
    assert.ok(navAfterLoad >= 1 && navAfterLoad <= 2, `Expected 1–2 navigations on load, got ${navAfterLoad}`);
    await page.waitForTimeout(1500);
    assert.equal(navigations, navAfterLoad, "Stable load should not trigger reload loops");
    const stored = await page.evaluate((key) => localStorage.getItem(key), LS_CANARY_KEY);
    assert.equal(typeof stored, "string", "Canary should be stored after initial sync");
    assert.ok(stored.length > 0, "Stored canary should be non-empty");
    assert.equal(stored, "orr-dev", "Stored canary should match dev bundle");
  } finally {
    await browser.close();
  }
}

async function testOnOpenStaleCanaryReloadsOnce() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(
    (keys, canaryKey) => {
      for (const key of keys) localStorage.setItem(key, "1");
      sessionStorage.removeItem("orryon_cache_bust_in_progress");
      localStorage.setItem(canaryKey, "orr-stale-on-open");
    },
    MIGRATION_KEYS,
    LS_CANARY_KEY,
  );
  const page = await context.newPage();
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  try {
    await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    assert.ok(navigations >= 1 && navigations <= 2, `Expected 1–2 navigations, got ${navigations}`);
    const stored = await page.evaluate((key) => localStorage.getItem(key), LS_CANARY_KEY);
    assert.notEqual(stored, "orr-stale-on-open", "Stale canary should be updated after reload");
    assert.equal(stored, "orr-dev", "Stored canary should match dev bundle after reload");
    await page.waitForTimeout(1500);
    const navigationsAfter = navigations;
    await page.waitForTimeout(1500);
    assert.equal(navigationsAfter, navigations, "Should not reload again after canary sync");
  } finally {
    await browser.close();
  }
}

async function testRemoteBuildFetchOnLoad() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(primeStorageScript(), MIGRATION_KEYS);
  const page = await context.newPage();
  const buildRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/build")) buildRequests.push(req.url());
  });
  try {
    await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    assert.ok(buildRequests.length >= 1, "SwBuildSync should fetch /api/build on load");
  } finally {
    await browser.close();
  }
}

/** Mock remote deploy + visibilitychange while pending → reload without waiting for idle. */
async function testVisibilityReturnTriggersReload() {
  const REMOTE_CANARY = "orr-remote-mock";
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(primeStorageScript(), MIGRATION_KEYS);
  await context.route("**/api/build", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ canary: REMOTE_CANARY }),
    });
  });
  const page = await context.newPage();
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  try {
    await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
    await page.waitForResponse((res) => res.url().includes("/api/build") && res.status() === 200);
    await page.waitForTimeout(500);
    const navAfterLoad = navigations;
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(3000);
    assert.ok(navigations > navAfterLoad, "visibilitychange should reload pending remote deploy");
  } finally {
    await browser.close();
  }
}

console.log(`\nSwBuildSync tests → ${BASE}\n`);
await run("GET /api/build returns canary with no-store", testBuildApi);
await run("stable load: no reload loop", testNoReloadLoopOnStableLoad);
await run("on-open stale canary: reloads once and updates storage", testOnOpenStaleCanaryReloadsOnce);
await run("initial sync fetches /api/build", testRemoteBuildFetchOnLoad);
await run("visibility return reloads pending remote deploy", testVisibilityReturnTriggersReload);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
