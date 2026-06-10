/**
 * Download page UX tests — mobile + desktop viewports (Playwright).
 * Requires: local server on TEST_BASE_URL (default http://127.0.0.1:3456).
 *
 * Usage:
 *   npx playwright install chromium webkit   # first time
 *   npm run test:download:ux:local
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
    const cta = page.getByRole("button", { name: /Download for iPhone/i });
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
    const hint = page.getByText(/iPhone install requires/i);
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

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function testDesktopMacLayout() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: MAC_UA,
  });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    const h1 = await page.locator("h1").innerText();
    assert(h1.includes("macOS"), `expected macOS headline on desktop, got: ${h1}`);
    const copy = await page.locator("main p").first().innerText();
    assert(copy.includes("dock"), "desktop copy should mention dock install");
    const cta = page.getByRole("button", { name: /Download for Mac/i });
    assert(await cta.isEnabled(), "macOS CTA should be enabled");
    const macTab = platformNav(page).getByRole("button", { name: "macOS" });
    assert((await macTab.getAttribute("class"))?.includes("text-white"), "macOS tab should be selected");
    assert(await page.getByText("macOS 12+").isVisible(), "macOS footnote should show");
  } finally {
    await browser.close();
  }
}

async function testDesktopPlatformSwitcher() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: MAC_UA,
  });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    await page.getByRole("button", { name: "Windows" }).click();
    let h1 = await page.locator("h1").innerText();
    assert(h1.includes("Windows"), "desktop switcher should update to Windows");
    await page.getByRole("button", { name: "Linux" }).click();
    h1 = await page.locator("h1").innerText();
    assert(h1.includes("Linux"), "desktop switcher should update to Linux");
  } finally {
    await browser.close();
  }
}

async function testPillFillDoesNotCapturePointer() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: MAC_UA,
  });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    await page.getByRole("button", { name: "iPhone & iPad" }).click();
    const pointerEvents = await page.evaluate(() => {
      const fill = document.querySelector("main button span[aria-hidden]");
      return fill ? getComputedStyle(fill).pointerEvents : null;
    });
    assert(pointerEvents === "none", `pill hover fill should ignore pointer events, got ${pointerEvents}`);
  } finally {
    await browser.close();
  }
}

async function testPillButtonClickAfterHover() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: MAC_UA,
  });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    await page.getByRole("button", { name: "iPhone & iPad" }).click();
    const cta = page.getByRole("button", { name: /Download for iPhone/i });
    await cta.hover();
    await cta.click();
    await page.waitForSelector("text=Install on iPhone & iPad", { timeout: 5_000 });
    assert(await page.getByRole("button", { name: "Got it" }).isVisible(), "hover should not block CTA click");
  } finally {
    await browser.close();
  }
}

async function testIosModalGotItCloses() {
  const browser = await webkit.launch();
  const context = await browser.newContext({ ...devices["iPhone 14"] });
  await fixLocalHttpsUpgrade(context);
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    await page.getByRole("button", { name: /Download for iPhone/i }).click();
    await page.waitForSelector("text=Install on iPhone & iPad", { timeout: 5_000 });
    await page.getByRole("button", { name: "Got it" }).click();
    await page.waitForSelector("text=Install on iPhone & iPad", {
      state: "hidden",
      timeout: 5_000,
    });
    assert(!(await page.getByRole("dialog").isVisible().catch(() => false)), "modal should close");
  } finally {
    await browser.close();
  }
}

async function testAndroidManualInstallModal() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  try {
    await waitForDownloadPage(page);
    const cta = page.getByRole("button", { name: /Install for Android/i });
    assert(await cta.isEnabled(), "Android manual install CTA should be enabled");
    await cta.click();
    await page.waitForSelector("text=Install on Android", { timeout: 5_000 });
    assert(
      (await page.locator("text=Add to Home screen").count()) >= 1,
      "Android modal should show install steps",
    );
    await page.getByRole("button", { name: "Got it" }).click();
    await page.waitForSelector("text=Install on Android", { state: "hidden", timeout: 5_000 });
  } finally {
    await browser.close();
  }
}

console.log(`\nDownload UX tests → ${BASE}\n`);

await run("iPhone Safari: auto-detect, copy, install modal", testIphoneSafari);
await run("iPad Safari: auto-detect iOS tab", testIpadSafari);
await run("iPhone Chrome: Safari hint", testIphoneChromeShowsSafariHint);
await run("Android Pixel: auto-detect, copy", testAndroidPixel);
await run("Android: install prompt enables CTA", testAndroidInstallPrompt);
await run("Installed (standalone): Open Orryon + Sign in", testStandaloneShowsOpenOrryon);
await run("Platform switcher updates headline", testPlatformSwitcher);
await run("Desktop macOS: layout, copy, CTA, tab", testDesktopMacLayout);
await run("Desktop: platform switcher updates headline", testDesktopPlatformSwitcher);
await run("Pill CTA: hover fill ignores pointer events", testPillFillDoesNotCapturePointer);
await run("Pill CTA: click works after hover (desktop)", testPillButtonClickAfterHover);
await run("iOS modal: Got it closes dialog", testIosModalGotItCloses);
await run("Android: manual install modal opens and closes", testAndroidManualInstallModal);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
