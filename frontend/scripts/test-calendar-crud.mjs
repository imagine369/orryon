/**
 * Calendar CRUD E2E — Quick Access Calendar tab create / edit / delete.
 *
 * Usage:
 *   npm run dev -- -p 3456
 *   TEST_BASE_URL=http://localhost:3456 node scripts/test-calendar-crud.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";

/** Match calendar-tab `localDateStr` — do not use UTC `toISOString().slice(0, 10)`. */
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PAST_DATE = localDateStr((() => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d;
})());

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

function monthBounds(isoDate) {
  const [y, m] = isoDate.split("-");
  const year = Number(y);
  const month = Number(m);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

function filterEventsByRange(events, from, to) {
  return events.filter((e) => {
    const ds = e.event_date.slice(0, 10);
    return ds >= from && ds <= to;
  });
}

function createApiRouter(state) {
  return async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const path = new URL(url).pathname;
    const params = new URL(url).searchParams;

    if (path === "/api/events" && method === "GET") {
      const from = params.get("from_date");
      const to = params.get("to_date");
      const rows = from && to
        ? filterEventsByRange(state.events, from, to)
        : state.events;
      await route.fulfill({ status: 200, json: rows });
      return;
    }

    if (path === "/api/events" && method === "POST") {
      const body = route.request().postDataJSON();
      const eventDate = body.time ? `${body.date} ${body.time}` : body.date;
      const row = {
        id: `evt-${Date.now()}`,
        title: body.title,
        event_date: eventDate,
        event_type: body.event_type || "event",
        description: body.description || "",
      };
      state.events.push(row);
      await route.fulfill({ status: 200, json: { id: row.id } });
      return;
    }

    if (path.startsWith("/api/events/") && method === "PATCH") {
      const id = path.split("/").pop();
      const body = route.request().postDataJSON();
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) {
        await route.fulfill({ status: 404, json: { detail: "Event not found" } });
        return;
      }
      const row = state.events[idx];
      if ("title" in body) {
        if (!String(body.title || "").trim()) {
          await route.fulfill({ status: 422, json: { detail: "Title cannot be empty" } });
          return;
        }
        row.title = body.title.trim();
      }
      if ("description" in body) row.description = body.description ?? "";
      if ("date" in body || "time" in body) {
        const oldDate = row.event_date.slice(0, 10);
        const oldTime = row.event_date.length > 10 ? row.event_date.slice(11, 16) : "";
        const d = body.date ?? oldDate;
        const t = "time" in body ? (body.time || "") : oldTime;
        row.event_date = t ? `${d} ${t}` : d;
      }
      await route.fulfill({ status: 200, json: { updated: true } });
      return;
    }

    if (path.startsWith("/api/events/") && method === "DELETE") {
      const id = path.split("/").pop();
      state.events = state.events.filter((e) => e.id !== id);
      await route.fulfill({ status: 200, json: { deleted: true } });
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

    if (url.includes("/api/dashboard/stats") || url.includes("/api/chat")) {
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

function calendarPanel(page) {
  return page.locator("[data-scroll-container] > div:not(.hidden)");
}

async function openCalendarTab(page) {
  await page.locator("button:has(svg.lucide-bell)").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("button:has(svg.lucide-bell)").first().click();
  await page.getByRole("heading", { name: "Quick Access" }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Calendar" }).click();
  await page.waitForResponse(
    (r) => r.url().includes("/api/events") && r.status() === 200,
    { timeout: 10_000 },
  ).catch(() => {});
  await calendarPanel(page).getByRole("button", { name: "Add event" }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
}

async function selectDateInGrid(page, isoDate) {
  const day = String(Number(isoDate.split("-")[2]));
  const monthGrid = page.locator(".grid.grid-cols-7.gap-y-1.mb-5");
  await monthGrid.locator("button").filter({ hasText: new RegExp(`^${day}$`) }).first().click();
}

async function runCalendarCrudFlow() {
  const state = { events: [] };
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.route("**/api/**", createApiRouter(state));
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await primeAuth(page);
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    await page.waitForResponse(
      (r) => r.url().includes("/api/events") && r.status() === 200,
      { timeout: 20_000 },
    ).catch(() => {});
    await openCalendarTab(page);

    const addBtn = calendarPanel(page).getByRole("button", { name: "Add event" });
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();
    await page.getByPlaceholder("Event title").fill("QA Calendar Event");
    await page.getByRole("button", { name: "Save" }).click();
    await calendarPanel(page).getByText("QA Calendar Event").waitFor({ timeout: 10_000 });
    assert(state.events.some((e) => e.title === "QA Calendar Event"), "POST should persist event");

    // Edit event
    await calendarPanel(page).getByText("QA Calendar Event").click();
    await page.getByText("Edit event").waitFor();
    const titleInput = page.getByPlaceholder("Event title");
    await titleInput.fill("QA Calendar Updated");
    await page.getByRole("button", { name: "Save" }).click();
    await calendarPanel(page).getByText("QA Calendar Updated").waitFor({ timeout: 10_000 });
    assert(state.events[0]?.title === "QA Calendar Updated", "PATCH should update title");

    // Delete via sheet (scope to edit panel, not swipe-to-delete)
    await calendarPanel(page).getByText("QA Calendar Updated").click();
    const sheet = page.locator(".rounded-xl.border.border-white\\/10.bg-white\\/\\[0\\.03\\]");
    await sheet.getByRole("button", { name: "Delete event" }).click();
    await sheet.getByRole("button", { name: "Confirm delete event" }).click();
    await page.waitForTimeout(300);
    assert(state.events.length === 0, "DELETE should remove event");
    assert(await calendarPanel(page).getByText("QA Calendar Updated").count() === 0, "UI should remove deleted event");
  } finally {
    await browser.close();
  }
}

async function runPastDateCreateFlow() {
  const state = { events: [] };
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
    await openCalendarTab(page);
    await selectDateInGrid(page, PAST_DATE);
    await page.waitForTimeout(400);

    const addBtn = calendarPanel(page).getByRole("button", { name: "Add event" });
    await addBtn.waitFor({ state: "attached", timeout: 10_000 });
    await addBtn.click({ force: true });
    await page.getByPlaceholder("Event title").fill("Past Day Event");
    await page.getByRole("button", { name: "Save" }).click();
    await calendarPanel(page).getByText("Past Day Event").waitFor({ timeout: 10_000 });

    // Simulate refresh after scheduleDataChanged
    await page.waitForTimeout(200);
    assert(
      await calendarPanel(page).getByText("Past Day Event").isVisible(),
      "past-date event should remain visible after month-range reload",
    );
    const { from, to } = monthBounds(PAST_DATE);
    const visible = filterEventsByRange(state.events, from, to);
    assert(visible.some((e) => e.title === "Past Day Event"), "past event should be in month-range API result");
  } finally {
    await browser.close();
  }
}

console.log(`\nCalendar CRUD tests → ${BASE}\n`);
await run("create → edit → delete event in Calendar tab", runCalendarCrudFlow);
await run("create event on past date stays visible (mobile viewport)", runPastDateCreateFlow);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
