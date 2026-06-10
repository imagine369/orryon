/**
 * Performance & stability smoke tests — no console errors, no reload loops.
 *
 * Usage:
 *   npm run dev -- -p 3456
 *   npm run test:stability:local
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";

const MIGRATION_KEYS = [
  "orryon_floating_buddy_removed_v1",
  "orryon_single_chat_avatar_v1",
];

const IGNORED_CONSOLE_PATTERNS = [
  /favicon/i,
  /Failed to load resource.*404/i,
  /Download the React DevTools/i,
];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function isIgnoredConsoleMessage(text) {
  return IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text));
}

function attachConsoleCollector(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isIgnoredConsoleMessage(text)) errors.push(text);
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

async function primePwaStorage(page) {
  await page.addInitScript((keys) => {
    localStorage.setItem("orryon_demo", "true");
    for (const key of keys) localStorage.setItem(key, "1");
    sessionStorage.removeItem("orryon_cache_bust_in_progress");
    // Do not set orryon_build_canary here — it must match the bundle's CANARY or
    // SwBuildSync will reload in a loop when tests overwrite it each navigation.
  }, MIGRATION_KEYS);
}

async function testDownloadPageStable() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = attachConsoleCollector(page);
  try {
    await primePwaStorage(page);
    await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 20_000 });
    const urlBefore = page.url();
    await page.waitForTimeout(1500);
    assert(page.url() === urlBefore, "download page should not reload in a loop");
    assert(errors.length === 0, `console errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
  }
}

function demoApiRouter() {
  return async (route) => {
    const url = route.request().url();
    if (url.includes("/api/preferences")) {
      await route.fulfill({
        status: 200,
        json: {
          onboarding_complete: true,
          life_priorities_set: true,
          ambient_mode_enabled: false,
          voice_overlay_enabled: false,
        },
      });
      return;
    }
    if (url.includes("/api/subscription")) {
      await route.fulfill({ status: 200, json: { plan: "premium", is_active_pro: true } });
      return;
    }
    if (url.includes("/api/chat/usage")) {
      await route.fulfill({ status: 200, json: { messages_used: 0, limit: 100 } });
      return;
    }
    if (url.includes("/api/dashboard/stats")) {
      await route.fulfill({ status: 200, json: { open_tasks: [] } });
      return;
    }
    if (url.includes("/api/chat/sessions") || url.includes("/api/chat/history")) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    if (url.includes("/api/auth/me")) {
      await route.fulfill({
        status: 200,
        json: { id: "demo", email: "demo@orryon.app", display_name: "Alex" },
      });
      return;
    }
    if (url.includes("/api/")) {
      await route.fulfill({ status: 200, json: {} });
      return;
    }
    await route.continue();
  };
}

async function testHomePageStable() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = attachConsoleCollector(page);
  try {
    await primePwaStorage(page);
    await context.route("**/api/**", demoApiRouter());

    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    const urlBefore = page.url();
    await page.waitForTimeout(1500);
    assert(page.url() === urlBefore, "home page should not reload in a loop");
    assert(errors.length === 0, `console errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
  }
}

async function testAmbientOverlayHiddenIsLightweight() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await primePwaStorage(page);
    await context.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/preferences")) {
        await route.fulfill({
          status: 200,
          json: {
            onboarding_complete: true,
            life_priorities_set: true,
            ambient_mode_enabled: true,
            voice_overlay_enabled: false,
          },
        });
        return;
      }
      await demoApiRouter()(route);
    });

    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    const orbCount = await page.getByRole("button", { name: "Orryon ambient companion" }).count();
    assert(orbCount === 0, "mini-orb should not mount while ambient is idle/sleeping");
  } finally {
    await browser.close();
  }
}

console.log(`\nStability tests → ${BASE}\n`);

await run("download: no reload loop or console errors", testDownloadPageStable);
await run("home: no reload loop or console errors", testHomePageStable);
await run("ambient overlay hidden does not mount mini-orb", testAmbientOverlayHiddenIsLightweight);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
