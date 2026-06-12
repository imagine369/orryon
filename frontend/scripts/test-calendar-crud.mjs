/**
 * Calendar CRUD E2E — Quick Access Calendar tab create / edit / delete.
 *
 * Usage:
 *   npm run test:quick-access:e2e:local
 *   TEST_BASE_URL=http://localhost:3456 node scripts/test-calendar-crud.mjs
 */
import {
  calendarPanel,
  createEventsCrudBeforeShell,
  createQuickAccessApiRouter,
  createTestHarness,
  launchE2eBrowser,
  localDateStr,
  monthBounds,
  openCalendarTab,
  filterEventsByRange,
  primeAuth,
  waitForHomeReady,
} from "./e2e/quick-access-helpers.mjs";

const PAST_DATE = localDateStr((() => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d;
})());

const { assert, run, finish } = createTestHarness("Calendar CRUD tests");
const eventsBeforeShell = createEventsCrudBeforeShell();

async function selectDateInGrid(page, isoDate) {
  const day = String(Number(isoDate.split("-")[2]));
  const monthGrid = page.locator(".grid.grid-cols-7.gap-y-1.mb-5");
  await monthGrid.locator("button").filter({ hasText: new RegExp(`^${day}$`) }).first().click();
}

async function runCalendarCrudFlow() {
  const state = { events: [] };
  const { browser, page } = await launchE2eBrowser();
  await page.route("**/api/**", createQuickAccessApiRouter(state, eventsBeforeShell));

  try {
    await primeAuth(page);
    await waitForHomeReady(page, { waitForEvents: true });
    await openCalendarTab(page);

    const addBtn = calendarPanel(page).getByRole("button", { name: "Add event" });
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();
    await page.getByPlaceholder("Event title").fill("QA Calendar Event");
    await page.getByRole("button", { name: "Save" }).click();
    await calendarPanel(page).getByText("QA Calendar Event").waitFor({ timeout: 10_000 });
    assert(state.events.some((e) => e.title === "QA Calendar Event"), "POST should persist event");

    await calendarPanel(page).getByRole("button", { name: "Edit QA Calendar Event" }).click();
    await page.getByText("Edit event").waitFor();
    await page.getByPlaceholder("Event title").fill("QA Calendar Updated");
    await page.getByRole("button", { name: "Save" }).click();
    await calendarPanel(page).getByText("QA Calendar Updated").waitFor({ timeout: 10_000 });
    assert(state.events[0]?.title === "QA Calendar Updated", "PATCH should update title");

    await calendarPanel(page).getByRole("button", { name: "Edit QA Calendar Updated" }).click();
    await page.getByRole("button", { name: "Delete event" }).click();
    await page.getByRole("button", { name: "Confirm delete event" }).click();
    await page.waitForTimeout(300);
    assert(state.events.length === 0, "DELETE should remove event");
    assert(await calendarPanel(page).getByText("QA Calendar Updated").count() === 0, "UI should remove deleted event");
  } finally {
    await browser.close();
  }
}

async function runPastDateCreateFlow() {
  const state = { events: [] };
  const { browser, page } = await launchE2eBrowser({ viewport: { width: 390, height: 844 } });
  await page.route("**/api/**", createQuickAccessApiRouter(state, eventsBeforeShell));

  try {
    await primeAuth(page);
    await waitForHomeReady(page, { waitForEvents: true });
    await openCalendarTab(page);
    await selectDateInGrid(page, PAST_DATE);
    await page.waitForTimeout(400);

    const addBtn = calendarPanel(page).getByRole("button", { name: "Add event" });
    await addBtn.waitFor({ state: "attached", timeout: 10_000 });
    await addBtn.click({ force: true });
    await page.getByPlaceholder("Event title").fill("Past Day Event");
    await page.getByRole("button", { name: "Save" }).click();
    await calendarPanel(page).getByText("Past Day Event").waitFor({ timeout: 10_000 });

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

await run("create → edit → delete event in Calendar tab", runCalendarCrudFlow);
await run("create event on past date stays visible (mobile viewport)", runPastDateCreateFlow);
finish();
