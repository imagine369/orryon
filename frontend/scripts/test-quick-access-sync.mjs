/**
 * Quick Access sync E2E — chat mutates calendar while drawer closed → open → see event.
 *
 * Usage:
 *   npm run test:quick-access:e2e:local
 *   TEST_BASE_URL=http://localhost:3456 node scripts/test-quick-access-sync.mjs
 */
import {
  calendarPanel,
  createQuickAccessApiRouter,
  createTestHarness,
  launchE2eBrowser,
  localDateStr,
  openQuickAccess,
  primeAuth,
  sseBody,
  waitForHomeReady,
} from "./e2e/quick-access-helpers.mjs";

const SESSION_ID = "qa-quick-access-sync";
const EVENT_TITLE = "Dentist QA";
const EVENT_DATE = localDateStr();

const { assert, run, finish } = createTestHarness("Quick Access sync tests");

function createCalendarChatBeforeShell() {
  return async (route, state) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

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
      return true;
    }

    return false;
  };
}

async function runCalendarSyncFlow() {
  const state = { events: [], getLog: [], hits: 0 };
  const { browser, page } = await launchE2eBrowser();
  await page.route("**/api/**", createQuickAccessApiRouter(state, createCalendarChatBeforeShell()));

  try {
    await primeAuth(page);
    await waitForHomeReady(page, { waitForEvents: true });

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

    const eventCount = await calendarPanel(page).getByText(EVENT_TITLE, { exact: true }).count();
    assert(
      eventCount > 0,
      `calendar should show event after chat add (found ${eventCount}); fetches: ${JSON.stringify(state.getLog)}`,
    );
  } finally {
    await browser.close();
  }
}

await run("chat while drawer closed → Calendar shows new event", runCalendarSyncFlow);
finish();
