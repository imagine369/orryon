/**
 * Shared Playwright helpers for Quick Access drawer E2E tests.
 * Keeps auth mocks, API stubs, and navigation consistent across suites.
 */
import { chromium } from "playwright";

export const E2E_BASE = process.env.TEST_BASE_URL || "http://localhost:3456";

export const PWA_MIGRATION_KEYS = [
  "orryon_floating_buddy_removed_v1",
  "orryon_single_chat_avatar_v1",
];

export const DEFAULT_PREFS = {
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

/** Match calendar-tab `localDateStr` — do not use UTC `toISOString().slice(0, 10)`. */
export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function sseBody(events) {
  return `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`;
}

export function filterEventsByRange(events, from, to) {
  return events.filter((e) => {
    const ds = e.event_date.slice(0, 10);
    return ds >= from && ds <= to;
  });
}

export function monthBounds(isoDate) {
  const [y, m] = isoDate.split("-");
  const year = Number(y);
  const month = Number(m);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function createTestHarness(title) {
  console.log(`\n${title} → ${E2E_BASE}\n`);
  let passed = 0;
  let failed = 0;

  return {
    assert(condition, message) {
      if (!condition) throw new Error(message);
    },
    async run(name, fn) {
      try {
        await fn();
        console.log(`  ✔ ${name}`);
        passed++;
      } catch (err) {
        console.error(`  ✖ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
      }
    },
    finish() {
      console.log(`\n${passed} passed, ${failed} failed\n`);
      process.exit(failed > 0 ? 1 : 0);
    },
  };
}

export async function primeAuth(page) {
  await page.addInitScript((migrationKeys) => {
    localStorage.removeItem("orryon_demo");
    localStorage.setItem("orryon_life_onboarding_dismissed", "1");
    for (const key of migrationKeys) localStorage.setItem(key, "1");
    sessionStorage.removeItem("orryon_cache_bust_in_progress");
    document.cookie = "orryon_auth=1; path=/";
    document.cookie = "orryon_csrf=e2e-csrf; path=/";
  }, PWA_MIGRATION_KEYS);
}

export async function openQuickAccess(page) {
  await page.locator("button:has(svg.lucide-bell)").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("button:has(svg.lucide-bell)").first().click();
  await page.getByRole("heading", { name: "Quick Access" }).waitFor({ timeout: 10_000 });
}

export async function waitForHomeReady(page, { waitForEvents = false } = {}) {
  await page.goto(`${E2E_BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
  if (waitForEvents) {
    await page.waitForResponse(
      (r) => r.url().includes("/api/events") && r.status() === 200,
      { timeout: 20_000 },
    ).catch(() => {});
  }
}

export function calendarPanel(page) {
  return page.locator("[data-scroll-container] > div:not(.hidden)");
}

export async function openCalendarTab(page) {
  await openQuickAccess(page);
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

/** Standard browser context: block SW so Playwright route mocks are not bypassed. */
export async function launchE2eBrowser(contextOptions = { viewport: { width: 1280, height: 800 } }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    serviceWorkers: "block",
    ...contextOptions,
  });
  const page = await context.newPage();
  return { browser, page };
}

/**
 * API stubs for every tab mounted inside Quick Access (Today, Errands, Calendar, Lists).
 * Pass `beforeShell` to handle test-specific routes first (chat POST, event CRUD, etc.).
 */
export function createQuickAccessApiRouter(state, beforeShell) {
  return async (route) => {
    if (beforeShell && (await beforeShell(route, state))) return;
    await fulfillQuickAccessShell(route, state);
  };
}

async function fulfillQuickAccessShell(route, state) {
  const url = route.request().url();
  const method = route.request().method();
  const path = new URL(url).pathname;
  const params = new URL(url).searchParams;

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

  if (path === "/api/events" && method === "GET") {
    const from = params.get("from_date");
    const to = params.get("to_date");
    const events = state.events ?? [];
    const rows = from && to ? filterEventsByRange(events, from, to) : events;
    if (state.getLog) {
      state.getLog.push({
        from,
        to,
        stored: events.length,
        returned: rows.length,
        titles: rows.map((r) => r.title),
      });
    }
    await route.fulfill({ status: 200, json: rows });
    return;
  }

  if (url.includes("/api/lists") && !url.includes("/items")) {
    await route.fulfill({ status: 200, json: state.lists ?? [] });
    return;
  }

  if (url.includes("/api/grocery/items") || (url.includes("/api/lists") && url.includes("/items"))) {
    await route.fulfill({ status: 200, json: state.groceryItems ?? [] });
    return;
  }

  if (url.includes("/api/tasks") || url.includes("/api/bills")) {
    await route.fulfill({ status: 200, json: [] });
    return;
  }

  if (url.includes("/api/fulfillment/handoffs")) {
    await route.fulfill({
      status: 200,
      json: state.fulfillment ?? { enabled: true, handoffs: [] },
    });
    return;
  }

  if (url.includes("/api/")) {
    await route.fulfill({ status: 200, json: {} });
    return;
  }

  await route.continue();
}

/** In-memory events API for calendar CRUD tests (runs before Quick Access shell). */
export function createEventsCrudBeforeShell() {
  return async (route, state) => {
    const url = route.request().url();
    const method = route.request().method();
    const path = new URL(url).pathname;

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
      return true;
    }

    if (path.startsWith("/api/events/") && method === "PATCH") {
      const id = path.split("/").pop();
      const body = route.request().postDataJSON();
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) {
        await route.fulfill({ status: 404, json: { detail: "Event not found" } });
        return true;
      }
      const row = state.events[idx];
      if ("title" in body) {
        if (!String(body.title || "").trim()) {
          await route.fulfill({ status: 422, json: { detail: "Title cannot be empty" } });
          return true;
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
      return true;
    }

    if (path.startsWith("/api/events/") && method === "DELETE") {
      const id = path.split("/").pop();
      state.events = state.events.filter((e) => e.id !== id);
      await route.fulfill({ status: 200, json: { deleted: true } });
      return true;
    }

    return false;
  };
}
