/**
 * Mobile PWA smoke tests (Playwright device emulation).
 * Requires: local server on TEST_BASE_URL (default http://127.0.0.1:3456).
 *
 * Usage:
 *   npx playwright install chromium webkit   # first time
 *   TEST_BASE_URL=http://127.0.0.1:3456 node scripts/test-mobile-pwa.mjs
 */
import { chromium, webkit, devices } from "playwright";

// WebKit on macOS may upgrade localhost to https (HSTS); use localhost + route fix.
const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";

let passed = 0;
let failed = 0;

/** WebKit may upgrade localhost to https (HSTS) — proxy those requests over http. */
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

async function waitForDownloadPage(page) {
  await page.goto(`${BASE}/download`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 20_000 });
}

function platformNav(page) {
  return page.locator('nav[aria-label="Other platforms"]');
}

async function testIphoneSafari() {
  const browser = await webkit.launch();
  const context = await browser.newContext({ ...devices["iPhone 14"] });
  await fixLocalHttpsUpgrade(context);
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    const h1 = await page.locator("h1").innerText();
    assert(h1.includes("iPhone"), `expected iPhone headline, got: ${h1}`);
    const copy = await page.locator("main p").first().innerText();
    assert(copy.includes("home screen"), "expected PWA install copy");
    const cta = page.getByRole("button", { name: /Install for iPhone/i });
    assert(await cta.isEnabled(), "iOS CTA should be enabled in Safari");
    await cta.click();
    await page.waitForSelector("text=Install on iPhone & iPad", { timeout: 5_000 });
    assert(
      (await page.locator("text=Add to Home Screen").count()) >= 1,
      "modal should show Add to Home Screen steps",
    );
    const manifestHref = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]');
      return link?.getAttribute("href") ?? "";
    });
    assert(manifestHref.includes("manifest"), "manifest link should be present");
  } finally {
    await browser.close();
  }
}

async function testIpadSafari() {
  const browser = await webkit.launch();
  const context = await browser.newContext({ ...devices["iPad Pro 11"] });
  await fixLocalHttpsUpgrade(context);
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    const h1 = await page.locator("h1").innerText();
    assert(h1.includes("iPhone"), `expected iPad → iOS headline, got: ${h1}`);
    const iosTab = platformNav(page).getByRole("button", { name: "iPhone & iPad" });
    assert((await iosTab.getAttribute("class"))?.includes("text-white"), "iOS tab should be selected");
  } finally {
    await browser.close();
  }
}

async function testIphoneChromeShowsSafariHint() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices["iPhone 14"],
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    const hint = page.getByText(/Open this page in/i);
    assert(await hint.isVisible(), "Chrome on iOS should show Safari hint");
  } finally {
    await browser.close();
  }
}

async function testAndroidPixel() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    const h1 = await page.locator("h1").innerText();
    assert(h1.includes("Android"), `expected Android headline, got: ${h1}`);
    const copy = await page.locator("main p").first().innerText();
    assert(copy.includes("home screen"), "expected PWA install copy");
    const androidTab = platformNav(page).getByRole("button", { name: "Android" });
    assert((await androidTab.getAttribute("class"))?.includes("text-white"), "Android tab selected");
  } finally {
    await browser.close();
  }
}

async function testAndroidInstallPrompt() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(e, {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      e.preventDefault();
      window.dispatchEvent(e);
    });
    const cta = page.getByRole("button", { name: /Install Orryon/i });
    await page.waitForTimeout(300);
    assert(await cta.isEnabled(), "Android CTA should enable when install prompt is available");
    await cta.click();
  } finally {
    await browser.close();
  }
}

async function testStandaloneShowsOpenOrryon() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query === "(display-mode: standalone)") {
          return { matches: true, media: query, addListener: () => {}, removeListener: () => {} };
        }
        return orig(query);
      };
    });
    await waitForDownloadPage(page);
    const h1 = await page.locator("h1").innerText();
    assert(h1.includes("Open Orryon"), `standalone should show Open Orryon, got: ${h1}`);
    const signIn = page.getByRole("main").getByRole("link", { name: /Sign in/i });
    assert(await signIn.isVisible(), "Sign in link should show when installed");
  } finally {
    await browser.close();
  }
}

async function testPlatformSwitcher() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    await page.getByRole("button", { name: "iPhone & iPad" }).click();
    let h1 = await page.locator("h1").innerText();
    assert(h1.includes("iPhone"), "switching to iOS tab updates headline");
    await page.getByRole("button", { name: "macOS" }).click();
    h1 = await page.locator("h1").innerText();
    assert(h1.includes("macOS"), "switching to macOS tab updates headline");
  } finally {
    await browser.close();
  }
}

console.log(`\nMobile PWA tests → ${BASE}\n`);

await run("iPhone Safari: auto-detect, copy, install modal", testIphoneSafari);
await run("iPad Safari: auto-detect iOS tab", testIpadSafari);
await run("iPhone Chrome: Safari hint", testIphoneChromeShowsSafariHint);
await run("Android Pixel: auto-detect, copy", testAndroidPixel);
await run("Android: install prompt enables CTA", testAndroidInstallPrompt);
await run("Installed (standalone): Open Orryon + Sign in", testStandaloneShowsOpenOrryon);
await run("Platform switcher updates headline", testPlatformSwitcher);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
