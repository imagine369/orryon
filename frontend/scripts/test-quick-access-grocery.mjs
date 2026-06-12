/**
 * Quick Access grocery E2E — chat mutates list → open drawer → see item.
 *
 * Usage:
 *   npm run test:quick-access:e2e:local
 *   TEST_BASE_URL=http://localhost:3456 node scripts/test-quick-access-grocery.mjs
 */
import { devices } from "playwright";
import {
  createQuickAccessApiRouter,
  createTestHarness,
  launchE2eBrowser,
  openQuickAccess,
  primeAuth,
  sseBody,
  waitForHomeReady,
} from "./e2e/quick-access-helpers.mjs";

const SESSION_ID = "qa-quick-access-grocery";
const GROCERY_LIST_ID = "grocery-list-id";

const { assert, run, finish } = createTestHarness("Quick Access grocery tests");

function createGroceryBeforeShell() {
  return async (route, state) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

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
      return true;
    }

    return false;
  };
}

async function runChatToGroceryFlow(contextOptions) {
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

  const { browser, page } = await launchE2eBrowser(contextOptions);
  await page.route("**/api/**", createQuickAccessApiRouter(state, createGroceryBeforeShell()));

  try {
    await primeAuth(page);
    await waitForHomeReady(page);

    const input = page.getByPlaceholder("Ask me anything…");
    await input.fill("Add milk to my grocery list");
    await page.getByRole("button", { name: "Send message" }).click();

    await page.getByText("Added milk to your grocery list.").waitFor({ timeout: 15_000 });

    await openQuickAccess(page);
    await page.getByRole("button", { name: "Lists" }).click();
    await page.getByRole("button", { name: "Grocery" }).click();

    const milk = page.getByText("milk", { exact: true });
    await milk.waitFor({ state: "visible", timeout: 10_000 });
    assert(await milk.isVisible(), "grocery list should show milk after chat add");
  } finally {
    await browser.close();
  }
}

await run("desktop: chat → Quick Access → Grocery shows milk", () =>
  runChatToGroceryFlow({ viewport: { width: 1280, height: 800 } }),
);
await run("mobile: chat → Quick Access → Grocery shows milk", () =>
  runChatToGroceryFlow({ ...devices["iPhone 14"] }),
);
finish();
