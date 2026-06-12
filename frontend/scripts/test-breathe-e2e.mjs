/**
 * Breathe / Reset Anchors E2E (Playwright + demo mode).
 *
 * Usage:
 *   npm run dev -- -p 3456 -H 127.0.0.1
 *   npm run test:breathe:local
 *
 * Requires Chromium: npx playwright install chromium
 */
import { chromium, devices } from "playwright";

const LOCAL_PORTS = [3456, 3000, 3001];
const FAST_LOOP = {
  inSecs: 1,
  holdInSecs: 0,
  outSecs: 1,
  holdOutSecs: 0,
  cycles: 1,
};

let passed = 0;
let failed = 0;
let BASE = process.env.TEST_BASE_URL || "";

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

/** @returns {Promise<string>} */
async function resolveBaseUrl() {
  if (process.env.TEST_BASE_URL) return process.env.TEST_BASE_URL;

  for (const port of LOCAL_PORTS) {
    const base = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${base}/manifest.json`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (!res.ok) continue;
      const manifest = await res.json();
      if (manifest?.short_name === "Orryon") return base;
    } catch {
      /* try next port */
    }
  }

  throw new Error(
    `No Orryon dev server found on ports ${LOCAL_PORTS.join(", ")}. Run: npm run dev -- -p 3456 -H 127.0.0.1`,
  );
}

async function primeDemoStorage(page, { customLoop, forHome } = {}) {
  await page.addInitScript(({ loop, home }) => {
    localStorage.setItem("orryon_demo", "true");
    localStorage.setItem("orryon_reset_completions", "[]");
    localStorage.setItem("orryon_reset_last_used", "");
    localStorage.removeItem("orryon_breathe_prefs");
    if (home) {
      localStorage.setItem("orryon_life_onboarding_dismissed", "1");
    }
    if (loop) {
      localStorage.setItem("orryon_custom_breath_loop", JSON.stringify(loop));
    }
  }, { loop: customLoop ?? null, home: forHome ?? false });
}

function attachConsoleGuard(page, label) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/AudioContext|autoplay|NotAllowedError|Haptics not available/i.test(text)) return;
    errors.push(text);
  });
  return {
    assertClean() {
      assert(errors.length === 0, `${label}: console errors:\n${errors.join("\n")}`);
    },
  };
}

async function openBreathe(page, path = "/breathe") {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Reset Anchors", { timeout: 20_000 });
}

async function withBreathePage(fn, { customLoop, viewport, useClock = true, apiRouter, forHome = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext(viewport ? { ...viewport } : {});
  if (apiRouter) {
    await context.route("**/api/**", apiRouter);
  }
  if (useClock) {
    await context.clock.install({ time: new Date("2026-06-11T12:00:00Z") });
  }
  const page = await context.newPage();
  const guard = attachConsoleGuard(page, "breathe");
  try {
    await primeDemoStorage(page, { customLoop, forHome });
    await fn(page, guard);
  } finally {
    await browser.close();
  }
}

async function testBrowseCatalog() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    assert(await page.getByText("Instant reset").isVisible(), "Instant reset section");
    assert(await page.getByText("Sessions").isVisible(), "Sessions section");
    assert(await page.getByText("Your loop", { exact: true }).isVisible(), "Custom loop section");
    assert(await page.getByText("Your Loop", { exact: true }).isVisible(), "Custom loop card");
    assert(await page.getByText("Double Inhale Destress").isVisible(), "Featured instant anchor");
    assert(await page.getByText("Recommended").isVisible(), "Recommended card");
    guard.assertClean();
  });
}

async function testIntentPickerFiltersRecommendation() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    await page.getByRole("button", { name: "Stressed" }).click();
    await page.waitForSelector("text=Double Inhale Destress", { timeout: 5_000 });
    const recommended = page.locator("text=Recommended").locator("..");
    assert(
      (await recommended.getByText("Double Inhale Destress").count()) > 0,
      "Stressed intent should recommend Double Inhale",
    );
    guard.assertClean();
  });
}

async function testDeepLinkOpensPreMood() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page, "/breathe?start=double-inhale-destress");
    await page.waitForSelector("text=How are you feeling?", { timeout: 15_000 });
    assert(await page.getByText(/Double Inhale/i).first().isVisible(), "Anchor label on pre-mood");
    assert(await page.getByRole("button", { name: "Begin" }).isVisible(), "Begin button");
    assert(await page.getByRole("button", { name: "Skip" }).isVisible(), "Skip button");
    guard.assertClean();
  });
}

async function testDurationPickerBeforeSession() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    const row = page.locator("text=Quick Box Reset").first().locator("xpath=ancestor::div[contains(@style,'padding')][1]");
    await row.getByRole("button").click();
    await page.waitForSelector("text=How are you feeling?", { timeout: 10_000 });
    assert(await page.getByText("Duration", { exact: true }).isVisible(), "Duration picker visible");
    await page.getByRole("button", { name: "6 min" }).click();
    await page.getByRole("button", { name: "Begin" }).click();
    await page.waitForSelector("text=Quick Box Reset", { timeout: 10_000 });
    guard.assertClean();
  });
}

async function testSessionControlsAndExit() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    await page.getByRole("button", { name: "Start" }).first().click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForSelector("text=Double Inhale Destress", { timeout: 10_000 });
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForSelector("text=Reset Anchors", { timeout: 10_000 });
    guard.assertClean();
  });
}

async function testFullHappyPathCustomLoop() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    await page.getByRole("button", { name: "Practice loop" }).click();
    await page.waitForSelector("text=How are you feeling?", { timeout: 10_000 });
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForSelector("text=Your Loop", { timeout: 10_000 });

    await page.getByRole("button", { name: "Pink" }).click();
    await page.getByTitle("Mute").click();

    await page.waitForSelector("text=How do you feel now?", { timeout: 20_000 });

    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForSelector("text=Your system has reset.", { timeout: 10_000 });

    await page.locator("button").filter({ hasText: /^Close$/ }).click();
    await page.waitForSelector("text=Recent sessions", { timeout: 10_000 });

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("orryon_reset_completions") || "[]"));
    assert(
      stored.some((c) => c.anchorId === "custom-loop"),
      "Completion persisted for custom loop",
    );
    assert(await page.getByText("Recent sessions").isVisible(), "Recent sessions section visible");

    guard.assertClean();
  }, { customLoop: FAST_LOOP, useClock: false });
}

async function testMobileViewportBrowse() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    assert(await page.getByText("Breathing and meditation are always free").isVisible());
    guard.assertClean();
  }, { viewport: devices["iPhone 14"] });
}

async function testInvalidDeepLink() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page, "/breathe?start=not-a-real-anchor");
    assert(
      await page.getByText(/isn't a reset we recognize/i).isVisible(),
      "Unknown deep link shows message",
    );
    assert(
      (await page.getByText("How are you feeling?").count()) === 0,
      "No session overlay for invalid deep link",
    );
    guard.assertClean();
  });
}

async function testCustomLoopDeepLink() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page, "/breathe?start=custom-loop");
    await page.waitForSelector("text=How are you feeling?", { timeout: 10_000 });
    assert(await page.getByText(/Your Loop/i).first().isVisible(), "Custom loop pre-mood");
    guard.assertClean();
  }, { customLoop: FAST_LOOP });
}

async function testCloseMidSession() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    await page.getByRole("button", { name: "Start" }).first().click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForSelector("text=Double Inhale Destress", { timeout: 10_000 });
    await page.getByRole("button", { name: "Close session" }).click();
    await page.waitForSelector("text=Reset Anchors", { timeout: 10_000 });
    guard.assertClean();
  });
}

async function testZenTapReveal() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    await page.getByRole("button", { name: "Start" }).first().click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForSelector("text=Double Inhale Destress", { timeout: 10_000 });
    await page.clock.runFor(11_000);
    await page.locator("div").filter({ has: page.getByRole("button", { name: "Back" }) }).first().click({ force: true });
    assert(await page.getByRole("button", { name: "Back" }).isVisible(), "Back visible after zen tap");
    guard.assertClean();
  });
}

async function testMuteAndSoundscapePersist() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    await page.getByRole("button", { name: "Practice loop" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForSelector("text=Your Loop", { timeout: 10_000 });
    await page.getByRole("button", { name: "Pink" }).click();
    await page.getByTitle("Mute").click();
    assert(await page.getByTitle("Unmute").isVisible(), "Mute toggled");

    const prefs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("orryon_breathe_prefs") || "{}"));
    assert(prefs.muted === true, "Mute preference saved");

    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForSelector("text=Reset Anchors", { timeout: 10_000 });
    guard.assertClean();
  }, { customLoop: FAST_LOOP });
}

async function testMoodTrackingFlow() {
  await withBreathePage(async (page, guard) => {
    await openBreathe(page);
    await page.getByRole("button", { name: "Practice loop" }).click();
    await page.getByRole("button", { name: "Tense" }).click();
    await page.getByRole("button", { name: "Begin" }).click();
    await page.waitForSelector("text=Your Loop", { timeout: 10_000 });
    await page.waitForSelector("text=How do you feel now?", { timeout: 20_000 });
    await page.getByRole("button", { name: "Clear" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForSelector("text=Tense → Clear", { timeout: 10_000 });
    await page.locator("button").filter({ hasText: /^Close$/ }).click();
    guard.assertClean();
  }, { customLoop: FAST_LOOP, useClock: false });
}

function proApiRouter() {
  return async (route) => {
    const url = route.request().url();
    if (url.includes("/api/preferences")) {
      await route.fulfill({
        status: 200,
        json: {
          life_priorities_set: true,
          life_priorities: [],
          onboarding_complete: true,
        },
      });
      return;
    }
    if (url.includes("/api/subscription")) {
      await route.fulfill({
        status: 200,
        json: { plan: "premium", is_active_pro: true, is_free_tier: false },
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

function starterApiRouter() {
  return async (route) => {
    const url = route.request().url();
    if (url.includes("/api/preferences")) {
      await route.fulfill({
        status: 200,
        json: {
          life_priorities_set: true,
          life_priorities: [],
          onboarding_complete: true,
        },
      });
      return;
    }
    if (url.includes("/api/subscription")) {
      await route.fulfill({
        status: 200,
        json: { plan: "starter", is_active_pro: false, is_free_tier: true },
      });
      return;
    }
    if (url.includes("/api/chat/sessions")) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    if (url.includes("/api/")) {
      await route.fulfill({ status: 200, json: {} });
      return;
    }
    await route.continue();
  };
}

async function testProNavResetPanel() {
  await withBreathePage(async (page, guard) => {
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    await page.getByRole("button", { name: "Reset Anchors" }).click();
    await page.waitForSelector("text=Instant reset", { timeout: 10_000 });
    assert(await page.getByText("Double Inhale Destress").isVisible(), "Panel browse visible");
    guard.assertClean();
  }, { apiRouter: proApiRouter(), forHome: true, useClock: false });
}

async function testChatPromoLink() {
  await withBreathePage(async (page, guard) => {
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    const promo = page.getByRole("link").filter({ hasText: /Breathe, reset|Wind down|Bridge morning/i });
    await promo.first().waitFor({ state: "visible", timeout: 15_000 });
    const href = await promo.first().getAttribute("href");
    assert(href?.includes("/breathe?start="), `Promo links to breathe deep link (${href})`);
    guard.assertClean();
  }, { apiRouter: starterApiRouter(), forHome: true, useClock: false });
}

BASE = await resolveBaseUrl();

console.log(`\nBreathe E2E → ${BASE}\n`);

await run("browse: catalog sections render", testBrowseCatalog);
await run("browse: intent picker updates recommendation", testIntentPickerFiltersRecommendation);
await run("deep link: ?start= opens pre-mood", testDeepLinkOpensPreMood);
await run("pre-mood: duration picker before session", testDurationPickerBeforeSession);
await run("session: controls and back exits", testSessionControlsAndExit);
await run("happy path: custom loop completes end-to-end", testFullHappyPathCustomLoop);
await run("mobile: browse layout on iPhone 14", testMobileViewportBrowse);
await run("deep link: invalid id shows message", testInvalidDeepLink);
await run("deep link: custom-loop opens pre-mood", testCustomLoopDeepLink);
await run("session: close mid-session via header X", testCloseMidSession);
await run("session: zen tap reveals controls", testZenTapReveal);
await run("session: mute preference persists", testMuteAndSoundscapePersist);
await run("flow: pre/post mood delta on completion", testMoodTrackingFlow);
await run("integration: Pro nav opens reset panel", testProNavResetPanel);
await run("integration: chat promo links to /breathe", testChatPromoLink);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
