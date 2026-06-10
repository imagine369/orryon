/**
 * Chat avatar E2E — only the latest assistant turn should render OrryonAliveAvatar.
 *
 * Usage:
 *   npm run dev -- -p 3456
 *   npm run test:chat:local
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";
const SESSION_ID = "test-session-avatar";

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
            title: "Budget help",
            preview: "Budget help",
            updated_at: new Date().toISOString(),
            message_count: MULTI_TURN_HISTORY.length,
          },
        ],
      });
      return;
    }

    if (url.includes("/api/chat/history")) {
      await route.fulfill({ status: 200, json: MULTI_TURN_HISTORY });
      return;
    }

    if (url.includes("/api/chat/sessions")) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    await route.continue();
  };
}

async function openHomeWithHistory(page) {
  await page.addInitScript(() => {
    localStorage.setItem("orryon_demo", "true");
  });

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });

  await page.getByTitle("Chat history").click();
  await page.waitForSelector("text=Chat History", { timeout: 10_000 });
  await page.getByRole("button", { name: "Budget help" }).click();
  await page.waitForSelector("text=Happy to help", { timeout: 10_000 });
}

async function testSingleAvatarInMultiTurnThread() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/api/**", createApiRouter());
  const page = await context.newPage();
  try {
    await openHomeWithHistory(page);

    const avatars = page.locator('main img[alt="Orryon"]');
    const count = await avatars.count();
    assert(count === 1, `expected 1 Orryon avatar in thread, found ${count}`);

    assert(
      await page.getByText("You have $420 left in dining this month.").isVisible(),
      "older assistant replies should still render",
    );
    assert(
      await page.getByText("Happy to help — want a reminder for rent?").isVisible(),
      "latest assistant reply should be visible",
    );
  } finally {
    await browser.close();
  }
}

console.log(`\nChat avatar tests → ${BASE}\n`);
await run("multi-turn thread renders exactly one Orryon avatar", testSingleAvatarInMultiTurnThread);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
