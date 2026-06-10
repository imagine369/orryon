/**
 * Chat action-card link E2E — clickable tel / maps links in assistant bubbles.
 *
 * Usage:
 *   npm run dev -- -p 3456
 *   npm run test:chat:links:local
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";
const SESSION_ID = "test-session-links";

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

const ACTION_CARD_HISTORY = [
  { role: "user", content: "Book Nobu Malibu" },
  {
    role: "assistant",
    content: `**Nobu Malibu**
[4555 Ocean Ave, Malibu, CA](https://maps.google.com/?q=4555+Ocean+Ave+Malibu+CA)
[Call to Reserve](tel:+13103101511)`,
  },
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

function createApiRouter() {
  return async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/preferences")) {
      await route.fulfill({ status: 200, json: DEFAULT_PREFS });
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

    if (url.includes("/api/chat/sessions") && method === "GET" && !url.includes("/api/chat/sessions/")) {
      await route.fulfill({
        status: 200,
        json: [
          {
            id: SESSION_ID,
            title: "Nobu reservation",
            preview: "Nobu reservation",
            updated_at: new Date().toISOString(),
            message_count: ACTION_CARD_HISTORY.length,
          },
        ],
      });
      return;
    }

    if (url.includes("/api/chat/history")) {
      await route.fulfill({ status: 200, json: ACTION_CARD_HISTORY });
      return;
    }

    if (url.includes("/api/chat/sessions")) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    await route.continue();
  };
}

async function openHomeWithActionCard(page) {
  await page.addInitScript(() => {
    localStorage.setItem("orryon_demo", "true");
  });

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });

  await page.getByTitle("Chat history").click();
  await page.waitForSelector("text=Chat History", { timeout: 10_000 });
  await page.getByRole("button", { name: "Nobu reservation" }).click();
  await page.waitForSelector("text=Nobu Malibu", { timeout: 10_000 });
}

async function testActionCardLinksAreClickable() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/api/**", createApiRouter());
  const page = await context.newPage();
  try {
    await openHomeWithActionCard(page);

    const mapsLink = page.getByRole("link", { name: "4555 Ocean Ave, Malibu, CA" });
    const telLink = page.getByRole("link", { name: "Call to Reserve" });

    assert(await mapsLink.isVisible(), "maps link should be visible");
    assert(await telLink.isVisible(), "tel link should be visible");

    const mapsHref = await mapsLink.getAttribute("href");
    const telHref = await telLink.getAttribute("href");

    assert(mapsHref?.includes("maps.google.com"), `expected maps href, got ${mapsHref}`);
    assert(telHref?.startsWith("tel:+13103101511"), `expected tel href, got ${telHref}`);
  } finally {
    await browser.close();
  }
}

console.log(`\nChat link tests → ${BASE}\n`);
await run("action card renders clickable maps and tel links", testActionCardLinksAreClickable);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
