/**
 * Quick Access sync E2E — chat mutates calendar while drawer closed → open → see event.
 *
 * Usage:
 *   npm run dev -- -p 3456
 *   TEST_BASE_URL=http://localhost:3456 node scripts/test-quick-access-sync.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";
const SESSION_ID = "qa-quick-access-sync";
const EVENT_TITLE = "Dentist QA";

/** Match calendar-tab `localDateStr` — do not use UTC `toISOString().slice(0, 10)`. */
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const EVENT_DATE = localDateStr();

const PWA_MIGRATION_KEYS = [
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

function sseBody(events) {
  return `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`;
}

function createApiRouter(state) {
  return async (route) => {
    state.hits = (state.hits || 0) + 1;
    const url = route.request().url();
    const method = route.request().method();
    const path = new URL(url).pathname;

    if (path === "/api/chat" && method === "POST") {
      state.events.push({
        id: `evt-${Date.now()}`,
        title: EVENT_TITLE,
        event_date: EVENT_DATE,
        event_type: "event",
        description: "",
      });

      const body = sseBody([
        { type: "session", session_id: SESSION_ID },
        { type: "tool", name: "add_calendar_event", label: "Adding calendar event" },
        {
          type: "done",
          message: `Added ${EVENT_TITLE} to your calendar.`,
          actions: [{ tool: "add_calendar_event" }],
          tabs: ["calendar", "today", "schedule"],
        },
      ]);
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body,
      });
      return;
    }

    if (url.includes("/api/preferences")) {
      await route.fulfill({ status: 200, json: DEFAULT_PREFS });
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

    if (url.includes("/api/auth/me")) {
      await route.fulfill({
        status: 200,
        json: { id: "e2e", email: "e2e@orryon.app", display_name: "E2E" },
      });
      return;
    }

    if (url.includes("/api/auth/sign-key")) {
      await route.fulfill({
        status: 200,
        json: { key: "a".repeat(64), kid: "test", iat: 1 },
      });
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

    if (url.includes("/api/events")) {
      const params = new URL(url).searchParams;
      const from = params.get("from_date");
      const to = params.get("to_date");
      let rows = state.events;
      if (from && to) {
        rows = state.events.filter((e) => {
          const ds = e.event_date.slice(0, 10);
          return ds >= from && ds <= to;
        });
      }
      state.getLog.push({
        from,
        to,
        stored: state.events.length,
        returned: rows.length,
        titles: rows.map((r) => r.title),
      });
      await route.fulfill({ status: 200, json: rows });
      return;
    }

    if (url.includes("/api/tasks") || url.includes("/api/bills")) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    if (url.includes("/api/lists") && !url.includes("/items")) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    if (url.includes("/api/grocery/items")) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    if (url.includes("/api/fulfillment/handoffs")) {
      await route.fulfill({ status: 200, json: { enabled: true, handoffs: [] } });
      return;
    }

    if (url.includes("/api/")) {
      await route.fulfill({ status: 200, json: {} });
      return;
    }

    await route.continue();
  };
}

async function primeAuth(page) {
  await page.addInitScript((migrationKeys) => {
    localStorage.removeItem("orryon_demo");
    localStorage.setItem("orryon_life_onboarding_dismissed", "1");
    for (const key of migrationKeys) localStorage.setItem(key, "1");
    sessionStorage.removeItem("orryon_cache_bust_in_progress");
    document.cookie = "orryon_auth=1; path=/";
    document.cookie = "orryon_csrf=e2e-csrf; path=/";
  }, PWA_MIGRATION_KEYS);
}

async function openQuickAccess(page) {
  await page.locator("button:has(svg.lucide-bell)").first().click();
  await page.getByRole("heading", { name: "Quick Access" }).waitFor({ timeout: 10_000 });
}

async function runCalendarSyncFlow() {
  const state = { events: [], getLog: [], hits: 0 };
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.route("**/api/**", createApiRouter(state));

  try {
    await primeAuth(page);
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    await page.waitForResponse(
      (r) => r.url().includes("/api/events") && r.status() === 200,
      { timeout: 20_000 },
    ).catch(() => {});

    const eventsAfterReload = page.waitForResponse(
      (r) => r.url().includes("/api/events") && r.status() === 200,
    );

    const input = page.getByPlaceholder("Ask me anything…");
    await input.fill(`Add ${EVENT_TITLE} to my calendar today`);
    await page.getByRole("button", { name: "Send message" }).click();

    await page.getByText(`Added ${EVENT_TITLE} to your calendar.`).waitFor({ timeout: 15_000 });
    assert(state.events.length === 1, `chat mock should add event (got ${state.events.length})`);
    await eventsAfterReload.catch(() => {});
    await page.waitForTimeout(500);

    await openQuickAccess(page);
    await page.getByRole("button", { name: "Calendar" }).click();
    await page.getByRole("button", { name: "Add event" }).waitFor({ state: "attached", timeout: 15_000 });
    await page.waitForResponse(
      (r) => r.url().includes("/api/events") && r.status() === 200,
      { timeout: 10_000 },
    ).catch(() => {});

    const eventCount = await page.locator("[data-scroll-container] > div:not(.hidden)").getByText(EVENT_TITLE, { exact: true }).count();
    assert(
      eventCount > 0,
      `calendar should show event after chat add (found ${eventCount}); hits: ${state.hits}; fetches: ${JSON.stringify(state.getLog)}`,
    );
  } finally {
    await browser.close();
  }
}

console.log(`\nQuick Access sync tests → ${BASE}\n`);
await run("chat while drawer closed → Calendar shows new event", runCalendarSyncFlow);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
