/**
 * Automated coverage for manual QA checklist (Playwright).
 *
 * Usage:
 *   npm run dev -- -p 3456
 *   npm run test:qa:local
 */
import { chromium, webkit, devices } from "playwright";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";
const SESSION_ID = "qa-session-chat";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MIGRATION_KEYS = [
  "orryon_floating_buddy_removed_v1",
  "orryon_single_chat_avatar_v1",
];

const DEFAULT_PREFS = {
  voice_overlay_enabled: false,
  golden_mode_enabled: false,
  briefing_time: "07:00",
  briefing_includes: "finance,health,calendar,goals",
  onboarding_complete: true,
  life_priorities: [],
  life_priorities_set: true,
  ambient_mode_enabled: false,
  ambient_sensitivity: 0.5,
  ambient_sound_style: "soft_glow_rise",
};

const MULTI_TURN_HISTORY = [
  { role: "user", content: "What's my budget?" },
  { role: "assistant", content: "You have $420 left in dining this month." },
  { role: "user", content: "Any bills due?" },
  { role: "assistant", content: "Rent is due Friday — $1,850." },
  { role: "user", content: "Thanks" },
  { role: "assistant", content: "Happy to help — want a reminder for rent?" },
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

async function primeStorage(page) {
  await page.addInitScript((keys) => {
    localStorage.setItem("orryon_demo", "true");
    for (const key of keys) localStorage.setItem(key, "1");
    sessionStorage.removeItem("orryon_cache_bust_in_progress");
  }, MIGRATION_KEYS);
}

function demoApiRouter(prefs = DEFAULT_PREFS) {
  return async (route) => {
    const url = route.request().url();
    if (url.includes("/api/preferences")) {
      if (route.request().method() === "PATCH") {
        const patch = route.request().postDataJSON() ?? {};
        Object.assign(prefs, patch);
      }
      await route.fulfill({ status: 200, json: prefs });
      return;
    }
    if (url.includes("/api/subscription")) {
      await route.fulfill({
        status: 200,
        json: { plan: "premium", is_active_pro: true, is_free_tier: false },
      });
      return;
    }
    if (url.includes("/api/chat/usage")) {
      await route.fulfill({ status: 200, json: { messages_used: 0, limit: 100, plan: "premium" } });
      return;
    }
    if (url.includes("/api/dashboard/stats")) {
      await route.fulfill({ status: 200, json: { open_tasks: [] } });
      return;
    }
    if (url.includes("/api/chat/history")) {
      await route.fulfill({ status: 200, json: MULTI_TURN_HISTORY });
      return;
    }
    if (url.includes("/api/chat/sessions")) {
      await route.fulfill({
        status: 200,
        json: [
          {
            id: SESSION_ID,
            title: "Budget help",
            preview: "Budget help",
            updated_at: new Date().toISOString(),
            message_count: MULTI_TURN_HISTORY.length,
          },
        ],
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

async function fixLocalHttpsUpgrade(context) {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("https://localhost") || url.startsWith("https://127.0.0.1")) {
      const httpUrl = url.replace(/^https:/, "http:");
      const response = await route.fetch({ url: httpUrl });
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
}

async function openHomeWithChatHistory(page, prefs, { ambientTestState } = {}) {
  await page.addInitScript((state) => {
    localStorage.setItem("orryon_demo", "true");
    if (state) window.__ORRYON_AMBIENT_TEST_STATE__ = state;
  }, ambientTestState ?? null);

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.getByTitle("Chat history").click();
  await page.getByRole("button", { name: "Budget help" }).click();
  await page.waitForSelector("text=Happy to help", { timeout: 10_000 });
}

async function testIphoneSafariInstallModal() {
  const browser = await webkit.launch();
  const context = await browser.newContext({ ...devices["iPhone 14"] });
  await fixLocalHttpsUpgrade(context);
  const page = await context.newPage();
  try {
    await primeStorage(page);
    await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 20_000 });
    const cta = page.getByRole("button", { name: /Add to Home Screen/i });
    assert(await cta.isVisible(), "Safari should show Add to Home Screen CTA");
    await cta.click();
    await page.waitForSelector("text=bottom of Safari", { timeout: 5_000 });
    assert(await page.getByRole("dialog").isVisible(), "Safari install should show Safari toolbar instructions");
  } finally {
    await browser.close();
  }
}

async function testAndroidInstallPromptCta() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  try {
    await primeStorage(page);
    await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 20_000 });
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(e, {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      e.preventDefault();
      window.dispatchEvent(e);
    });
    const installCta = page.getByRole("button", { name: /Install Orryon/i });
    await installCta.waitFor({ state: "visible", timeout: 5_000 });
    assert(await installCta.isEnabled(), "Android install prompt should enable CTA");
  } finally {
    await browser.close();
  }
}

async function testAndroidManualInstallModal() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  try {
    await primeStorage(page);
    await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Install for Android/i }).click();
    await page.waitForSelector("text=Install Orryon", { timeout: 5_000 });
  } finally {
    await browser.close();
  }
}

async function testChatSingleAvatarMultiTurn() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/api/**", demoApiRouter());
  const page = await context.newPage();
  try {
    await openHomeWithChatHistory(page, DEFAULT_PREFS);
    const avatars = await page.locator('main img[alt="Orryon"]').count();
    assert(avatars === 1, `expected 1 in-thread avatar for 3 assistant replies, got ${avatars}`);
    assert(
      await page.getByText("You have $420 left in dining this month.").isVisible(),
      "older assistant bubbles should render without avatars",
    );
  } finally {
    await browser.close();
  }
}

async function testMiniOrbDuringActiveChat() {
  const prefs = { ...DEFAULT_PREFS, ambient_mode_enabled: true };
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/api/**", demoApiRouter(prefs));
  const page = await context.newPage();
  try {
    await openHomeWithChatHistory(page, prefs, { ambientTestState: "miniOrb" });
    const threadAvatars = await page
      .locator(".group.flex.items-start img[alt='Orryon']")
      .count();
    assert(threadAvatars === 1, `thread should keep one avatar, got ${threadAvatars}`);
    const miniOrb = page.getByRole("button", { name: "Orryon ambient companion" });
    await miniOrb.waitFor({ state: "visible", timeout: 15_000 });
    assert(await miniOrb.isVisible(), "mini-orb should appear during voice put-down in active chat");
  } finally {
    await browser.close();
  }
}

async function testDesktopSettingsInstallNavigatesDownload() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: MAC_UA,
  });
  await context.route("**/api/**", demoApiRouter());
  const page = await context.newPage();
  try {
    await primeStorage(page);
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });

    const settingsButtons = page.locator("button").filter({
      has: page.locator("svg.lucide-settings"),
    });
    await settingsButtons.first().click();
    await page.getByRole("button", { name: /Install Orryon on your device/i }).click();
    await page.getByRole("button", { name: /Download for/i }).click();
    await page.waitForURL(/\/download/, { timeout: 10_000 });
    assert(page.url().includes("/download"), "Settings Install should navigate to /download on desktop");
  } finally {
    await browser.close();
  }
}

console.log(`\nManual QA automation → ${BASE}\n`);

await run("iPhone Safari: Add to Home Screen shows Safari instructions", testIphoneSafariInstallModal);
await run("Android Chrome: install prompt enables CTA", testAndroidInstallPromptCta);
await run("Android Chrome: manual install modal", testAndroidManualInstallModal);
await run("Chat: 3+ assistant replies → one avatar", testChatSingleAvatarMultiTurn);
await run("Premium voice hold: mini-orb during active chat", testMiniOrbDuringActiveChat);
await run("Desktop Settings → Install → /download", testDesktopSettingsInstallNavigatesDownload);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
