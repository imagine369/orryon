/**
 * Ambient Pickup E2E smoke tests (Playwright).
 * Covers settings toggle, sensitivity slider, wake sound style, and home overlay.
 *
 * Usage:
 *   npx playwright install chromium   # first time
 *   npm run dev                       # in another terminal
 *   npm run test:ambient:local   # finds Orryon on localhost:3000 or :3001
 *
 * On-device sensor/haptics QA: npm run test:ambient:device-qa
 *
 * UI state override (`window.__ORRYON_AMBIENT_TEST_STATE__`) only applies when
 * NODE_ENV=development (npm run dev) or NEXT_PUBLIC_AMBIENT_TEST_HOOK=true.
 */
import { chromium } from "playwright";

const LOCAL_DEV_PORTS = [3000, 3001];

/** @param {string} base */
async function isOrryonDevServer(base) {
  try {
    const res = await fetch(`${base}/manifest.json`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return false;
    const manifest = await res.json();
    return manifest?.short_name === "Orryon";
  } catch {
    return false;
  }
}

/** @returns {Promise<string>} */
async function resolveBaseUrl() {
  if (process.env.TEST_BASE_URL) {
    return process.env.TEST_BASE_URL;
  }

  if (process.argv.includes("--local")) {
    for (const port of LOCAL_DEV_PORTS) {
      const base = `http://localhost:${port}`;
      if (await isOrryonDevServer(base)) {
        return base;
      }
    }
    throw new Error(
      `No Orryon dev server on ports ${LOCAL_DEV_PORTS.join(" or ")}. Run: npm run dev`,
    );
  }

  return "http://localhost:3000";
}

let BASE = "http://localhost:3000";

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

const PRO_SUBSCRIPTION = {
  plan: "premium",
  trial_ends_at: null,
  trial_days_remaining: 0,
  is_active_pro: true,
  is_free_tier: false,
  has_stripe_subscription: true,
};

const CHAT_USAGE = {
  messages_used: 0,
  limit: 100,
  unlimited: false,
  plan: "premium",
};

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

function createApiRouter(prefs) {
  return async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/preferences")) {
      if (method === "PATCH") {
        const patch = route.request().postDataJSON() ?? {};
        if (patch.ambient_mode_enabled !== undefined) {
          prefs.ambient_mode_enabled = Boolean(patch.ambient_mode_enabled);
        }
        if (patch.ambient_sensitivity !== undefined) {
          prefs.ambient_sensitivity = Number(patch.ambient_sensitivity);
        }
        if (patch.ambient_sound_style !== undefined) {
          prefs.ambient_sound_style = patch.ambient_sound_style;
        }
        const {
          ambient_mode_enabled: _ambientMode,
          ambient_sensitivity: _ambientSensitivity,
          ambient_sound_style: _ambientSoundStyle,
          ...rest
        } = patch;
        void _ambientMode;
        void _ambientSensitivity;
        void _ambientSoundStyle;
        Object.assign(prefs, rest);
        await route.fulfill({ status: 200, json: prefs });
        return;
      }
      await route.fulfill({ status: 200, json: prefs });
      return;
    }

    if (url.includes("/api/subscription")) {
      await route.fulfill({ status: 200, json: PRO_SUBSCRIPTION });
      return;
    }

    if (url.includes("/api/chat/usage")) {
      await route.fulfill({ status: 200, json: CHAT_USAGE });
      return;
    }

    if (url.includes("/api/dashboard/stats")) {
      await route.fulfill({ status: 200, json: { open_tasks: [] } });
      return;
    }

    if (url.includes("/api/chat/sessions")) {
      await route.fulfill({ status: 200, json: { sessions: [] } });
      return;
    }

    await route.continue();
  };
}

async function openHome(page, prefs, { ambientTestState } = {}) {
  await page.addInitScript((state) => {
    localStorage.setItem("orryon_demo", "true");
    if (state) {
      window.__ORRYON_AMBIENT_TEST_STATE__ = state;
    }
  }, ambientTestState ?? null);

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
}

async function openAmbientSettings(page) {
  const settingsButtons = page.locator("button").filter({
    has: page.locator("svg.lucide-settings"),
  });
  await settingsButtons.first().click();
  await page.getByRole("button", { name: "Ambient Pickup" }).click();
  await page.waitForSelector('[role="switch"]', { timeout: 10_000 });
}

async function withAmbientPage(prefs, fn) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/api/**", createApiRouter(prefs));
  const page = await context.newPage();
  try {
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function testAmbientSettingsToggle() {
  const prefs = { ...DEFAULT_PREFS };
  await withAmbientPage(prefs, async (page) => {
    await openHome(page, prefs);
    await openAmbientSettings(page);

    const toggle = page.getByRole("switch", { checked: false });
    assert(await toggle.isVisible(), "ambient switch should be visible");

    await toggle.click();
    await page.waitForFunction(
      () => document.querySelector('[role="switch"][aria-checked="true"]') !== null,
      { timeout: 10_000 },
    );

    assert(prefs.ambient_mode_enabled === true, "PATCH should enable ambient mode");
  });
}

async function testAmbientSensitivitySlider() {
  const prefs = { ...DEFAULT_PREFS, ambient_mode_enabled: true };
  await withAmbientPage(prefs, async (page) => {
    await openHome(page, prefs);
    await openAmbientSettings(page);

    const slider = page.getByRole("slider", { name: "Ambient pickup sensitivity" });
    await slider.waitFor({ state: "visible" });

    await slider.evaluate((el) => {
      el.value = "75";
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    await page.waitForFunction(
      () => {
        const label = document.querySelector('[aria-label="Ambient pickup sensitivity"]');
        return label && label.value === "75";
      },
      { timeout: 5_000 },
    );

    assert(
      Math.abs(prefs.ambient_sensitivity - 0.75) < 0.001,
      `PATCH should set sensitivity to 0.75, got ${prefs.ambient_sensitivity}`,
    );
  });
}

async function testAmbientSoundStylePatch() {
  const prefs = { ...DEFAULT_PREFS, ambient_mode_enabled: true };
  await withAmbientPage(prefs, async (page) => {
    await openHome(page, prefs);
    await openAmbientSettings(page);

    await page.getByRole("button", { name: "Crystal bloom" }).click();

    await page
      .getByRole("button", { name: "Crystal bloom", pressed: true })
      .waitFor({ state: "visible", timeout: 5_000 });

    assert(
      prefs.ambient_sound_style === "crystal_bloom",
      `PATCH should set crystal_bloom, got ${prefs.ambient_sound_style}`,
    );
  });
}

async function testHomeAmbientOverlayWhenMocked() {
  const prefs = { ...DEFAULT_PREFS, ambient_mode_enabled: true };
  await withAmbientPage(prefs, async (page) => {
    await openHome(page, prefs, { ambientTestState: "miniOrb" });
    const orb = page.getByRole("button", { name: "Orryon ambient companion" });
    await orb.waitFor({ state: "visible", timeout: 15_000 });
    assert(await orb.isVisible(), "mini-orb overlay should render when state is mocked");
  });
}

BASE = await resolveBaseUrl();

console.log(`\nAmbient E2E smoke tests → ${BASE}\n`);

await run("settings: ambient toggle enables preference", testAmbientSettingsToggle);
await run("settings: sensitivity slider PATCH", testAmbientSensitivitySlider);
await run("settings: wake sound style PATCH", testAmbientSoundStylePatch);
await run("home: mini-orb overlay renders with mocked state", testHomeAmbientOverlayWhenMocked);

console.log(`\n${passed} passed, ${failed} failed`);
console.log("On-device QA (sensors, haptics, Capacitor): npm run test:ambient:device-qa\n");
process.exit(failed > 0 ? 1 : 0);
