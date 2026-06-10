/**
 * Quick Access grocery E2E — chat mutates list → open drawer → see item.
 *
 * Usage:
 *   npm run dev -- -p 3456
 *   npm run test:quick-access:local
 */
import { chromium } from "playwright";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3456";
const SESSION_ID = "qa-quick-access-grocery";
const GROCERY_LIST_ID = "grocery-list-id";

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
    const url = route.request().url();
    const method = route.request().method();
    const path = new URL(url).pathname;

    if (path === "/api/chat" && method === "POST") {
      state.groceryItems.push({
        id: `item-${Date.now()}`,
        list_id: GROCERY_LIST_ID,
        name: "milk",
        notes: "",
        is_checked: 0,
        sort_order: 0,
        added_at: new Date().toISOString(),
      });
      state.lists[0].item_count = state.groceryItems.filter((i) => !i.is_checked).length;

      const body = sseBody([
        { type: "session", session_id: SESSION_ID },
        { type: "tool", name: "add_grocery_items", label: "Adding to grocery list" },
        {
          type: "done",
          message: "Added milk to your grocery list.",
          actions: [{ tool: "add_grocery_items" }],
          tabs: ["lists"],
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

    if (url.includes("/api/lists") && !url.includes("/items")) {
      await route.fulfill({ status: 200, json: state.lists });
      return;
    }

    if (url.includes("/api/grocery/items")) {
      await route.fulfill({ status: 200, json: state.groceryItems });
      return;
    }

    if (url.includes("/api/tasks") || url.includes("/api/events") || url.includes("/api/bills")) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    if (url.includes("/api/fulfillment/handoffs")) {
      await route.fulfill({ status: 200, json: { handoffs: [] } });
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
  await page.addInitScript(() => {
    localStorage.removeItem("orryon_demo");
    document.cookie = "orryon_auth=1; path=/";
    document.cookie = "orryon_csrf=e2e-csrf; path=/";
  });
}

async function openQuickAccess(page) {
  await page.locator("button:has(svg.lucide-bell)").click();
  await page.getByRole("heading", { name: "Quick Access" }).waitFor({ timeout: 10_000 });
}

async function testChatThenQuickAccessShowsGroceryItem() {
  const state = {
    groceryItems: [],
    lists: [
      {
        id: GROCERY_LIST_ID,
        name: "Grocery",
        icon: "",
        color: "#22c55e",
        sort_order: 0,
        item_count: 0,
        is_builtin: true,
      },
    ],
  };

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/api/**", createApiRouter(state));
  const page = await context.newPage();

  try {
    await primeAuth(page);
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });

    const input = page.getByPlaceholder("Ask me anything…");
    await input.fill("Add milk to my grocery list");
    await page.getByRole("button", { name: "Send message" }).click();

    await page.getByText("Added milk to your grocery list.").waitFor({ timeout: 15_000 });

    await openQuickAccess(page);
    await page.getByRole("button", { name: "Lists" }).click();
    await page.getByRole("button", { name: "Grocery" }).click();

    assert(
      await page.getByText("milk", { exact: true }).isVisible(),
      "grocery list should show milk after chat add",
    );
  } finally {
    await browser.close();
  }
}

console.log(`\nQuick Access grocery tests → ${BASE}\n`);
await run("chat add → Quick Access Lists → Grocery shows milk", testChatThenQuickAccessShowsGroceryItem);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
