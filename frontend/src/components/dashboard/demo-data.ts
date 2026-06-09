/**
 * Centralized demo data for the Orryon dashboard.
 *
 * When isDemo() is true, components show this sample data instead of
 * fetching from the API — used for the "Preview the app" mode (localhost only).
 */

export { isDemoMode as isDemo } from "@/lib/demo-mode";

// ── Private helpers ───────────────────────────────────────────────────────────

function nowMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// ── Overview ──────────────────────────────────────────────────────────────────

export const DEMO_TRANSACTIONS = [
  { id: "1", merchant: "Rent",        amount: 2200,  date: "2026-04-01", category: "Rent & Housing" },
  { id: "2", merchant: "Whole Foods", amount: 87.40, date: "2026-04-05", category: "Groceries" },
  { id: "3", merchant: "Chipotle",    amount: 14.50, date: "2026-04-06", category: "Food & Dining" },
  { id: "4", merchant: "Shell",       amount: 62.40, date: "2026-04-08", category: "Transport" },
  { id: "5", merchant: "Netflix",     amount: 15.99, date: "2026-04-10", category: "Entertainment" },
];

export const DEMO_TOP_CATS = [
  { category: "Rent & Housing", total: 2200 },
  { category: "Food & Dining",  total: 386 },
  { category: "Groceries",      total: 173 },
  { category: "Transport",      total: 103 },
];

export const DEMO_TASKS_OV = [
  { id: "1", title: "Pay credit card bill", priority: "high",   due_date: "2026-04-12" },
  { id: "2", title: "Call dentist",         priority: "medium", due_date: "2026-04-15" },
];

// ── Budget ────────────────────────────────────────────────────────────────────

export const DEMO_BUDGET = {
  month: nowMonth(),
  categories: [
    { id: "1", category: "Rent & Housing",   planned: 2300, spent: 2200, remaining: 100,  pct_used: 96 },
    { id: "2", category: "Food & Dining",    planned: 600,  spent: 386,  remaining: 214,  pct_used: 64 },
    { id: "3", category: "Groceries",        planned: 400,  spent: 173,  remaining: 227,  pct_used: 43 },
    { id: "4", category: "Health & Fitness", planned: 150,  spent: 42,   remaining: 108,  pct_used: 28 },
    { id: "5", category: "Entertainment",    planned: 100,  spent: 0,    remaining: 100,  pct_used: 0 },
    { id: "6", category: "Transport",        planned: 200,  spent: 103,  remaining: 97,   pct_used: 52 },
  ],
};

// ── Goals ─────────────────────────────────────────────────────────────────────

export const DEMO_GOALS = [
  { id: "1", name: "Vacation Fund",   target_amount: 4000, current_amount: 2720, target_date: "2026-12-01", category: "travel",  notes: "", is_completed: 0 },
  { id: "2", name: "Emergency Fund",  target_amount: 5000, current_amount: 1600, target_date: "",           category: "savings", notes: "", is_completed: 0 },
  { id: "3", name: "New Laptop",      target_amount: 1200, current_amount: 750,  target_date: "2026-06-01", category: "tech",    notes: "", is_completed: 0 },
  { id: "4", name: "Costa Rica Trip", target_amount: 3000, current_amount: 3000, target_date: "2025-12-01", category: "travel",  notes: "", is_completed: 1 },
];

// ── Schedule & Calendar ───────────────────────────────────────────────────────

export const DEMO_EVENTS = [
  { id: "1", title: "Doctor appointment", event_date: "2026-04-14", event_type: "event",    description: "Annual checkup",         reminder_minutes: 60 },
  { id: "2", title: "Lunch with team",    event_date: "2026-04-16", event_type: "event",    description: "Noon at the usual spot",  reminder_minutes: 30 },
  { id: "3", title: "Pay rent",           event_date: "2026-04-20", event_type: "bill_due", description: "",                        reminder_minutes: 1440 },
  { id: "4", title: "Birthday party",     event_date: "2026-04-25", event_type: "event",    description: "Sarah's birthday",        reminder_minutes: 60 },
];

export const DEMO_TASKS = [
  { id: "1", title: "Pay credit card bill", priority: "high",   status: "open", due_date: "2026-04-12", category: "finance" },
  { id: "2", title: "Call dentist",         priority: "medium", status: "open", due_date: "2026-04-15", category: "health" },
  { id: "3", title: "Review budget",        priority: "low",    status: "open", due_date: "2026-04-30", category: "finance" },
];

// ── Bills ─────────────────────────────────────────────────────────────────────

export const DEMO_BILLS = [
  { id: "1", name: "Rent",          amount: 2200,  frequency: "monthly",   next_due: "2026-05-01", category: "housing",       is_active: 1 },
  { id: "2", name: "Netflix",       amount: 15.99, frequency: "monthly",   next_due: "2026-04-24", category: "subscriptions", is_active: 1 },
  { id: "3", name: "Spotify",       amount: 9.99,  frequency: "monthly",   next_due: "2026-04-14", category: "subscriptions", is_active: 1 },
  { id: "4", name: "iCloud+",       amount: 2.99,  frequency: "monthly",   next_due: "2026-04-12", category: "subscriptions", is_active: 1 },
  { id: "5", name: "Gym",           amount: 29.99, frequency: "monthly",   next_due: "2026-04-28", category: "health",        is_active: 1 },
  { id: "6", name: "Car Insurance", amount: 180,   frequency: "quarterly", next_due: "2026-06-01", category: "insurance",     is_active: 1 },
];

// ── Notes ─────────────────────────────────────────────────────────────────────

export const DEMO_NOTES = [
  { id: "1", title: "Q2 Financial Goals",   content: "Review investment portfolio and rebalance. Increase 401k contributions by 2%. Look into index funds.", tags: "finance", mood: "", is_pinned: 1, linked_goal: "", created_at: "2026-04-08T10:00:00Z", updated_at: "2026-04-08T10:00:00Z" },
  { id: "2", title: "Meal prep ideas",      content: "Chicken, rice, vegetables for the week. Try the new Mediterranean bowl recipe.", tags: "", mood: "", is_pinned: 0, linked_goal: "", created_at: "2026-04-06T09:00:00Z", updated_at: "2026-04-06T09:00:00Z" },
  { id: "3", title: "Book recommendations", content: "The Psychology of Money, Die with Zero, The Almanack of Naval Ravikant, Atomic Habits.", tags: "books", mood: "", is_pinned: 0, linked_goal: "", created_at: "2026-04-03T14:00:00Z", updated_at: "2026-04-03T14:00:00Z" },
];

// ── Lists ─────────────────────────────────────────────────────────────────────

export const DEMO_LISTS = [
  { id: "d1", name: "Grocery",       icon: "🛒", color: "#f97316", sort_order: 0, item_count: 5 },
  { id: "d2", name: "Goals",         icon: "🎯", color: "#3b82f6", sort_order: 1, item_count: 3 },
  { id: "d3", name: "Books to Read", icon: "📚", color: "#a855f7", sort_order: 2, item_count: 4 },
  { id: "d4", name: "Travel Pack",   icon: "✈️", color: "#22c55e", sort_order: 3, item_count: 2 },
];

export const DEMO_ITEMS: Record<string, { id: string; list_id: string; name: string; notes: string; is_checked: number; sort_order: number; added_at: string }[]> = {
  d1: [
    { id: "i1",  list_id: "d1", name: "Almond milk",     notes: "", is_checked: 0, sort_order: 0, added_at: "" },
    { id: "i2",  list_id: "d1", name: "Eggs",            notes: "", is_checked: 0, sort_order: 1, added_at: "" },
    { id: "i3",  list_id: "d1", name: "Greek yogurt",    notes: "", is_checked: 0, sort_order: 2, added_at: "" },
    { id: "i4",  list_id: "d1", name: "Sourdough bread", notes: "", is_checked: 0, sort_order: 3, added_at: "" },
    { id: "i5",  list_id: "d1", name: "Avocados",        notes: "", is_checked: 0, sort_order: 4, added_at: "" },
    { id: "i6",  list_id: "d1", name: "Olive oil",       notes: "", is_checked: 1, sort_order: 5, added_at: "" },
    { id: "i7",  list_id: "d1", name: "Coffee beans",    notes: "", is_checked: 1, sort_order: 6, added_at: "" },
  ],
  d2: [
    { id: "i8",  list_id: "d2", name: "Max out Roth IRA",          notes: "", is_checked: 0, sort_order: 0, added_at: "" },
    { id: "i9",  list_id: "d2", name: "Run a 5K under 25 minutes", notes: "", is_checked: 0, sort_order: 1, added_at: "" },
    { id: "i10", list_id: "d2", name: "Read 12 books this year",   notes: "", is_checked: 0, sort_order: 2, added_at: "" },
    { id: "i11", list_id: "d2", name: "Build emergency fund",      notes: "", is_checked: 1, sort_order: 3, added_at: "" },
  ],
  d3: [
    { id: "i12", list_id: "d3", name: "The Psychology of Money",        notes: "", is_checked: 0, sort_order: 0, added_at: "" },
    { id: "i13", list_id: "d3", name: "Atomic Habits",                  notes: "", is_checked: 0, sort_order: 1, added_at: "" },
    { id: "i14", list_id: "d3", name: "Die with Zero",                  notes: "", is_checked: 0, sort_order: 2, added_at: "" },
    { id: "i15", list_id: "d3", name: "The Almanack of Naval Ravikant", notes: "", is_checked: 1, sort_order: 3, added_at: "" },
  ],
  d4: [
    { id: "i16", list_id: "d4", name: "Noise-cancelling headphones", notes: "", is_checked: 0, sort_order: 0, added_at: "" },
    { id: "i17", list_id: "d4", name: "Travel adapter",              notes: "", is_checked: 0, sort_order: 1, added_at: "" },
    { id: "i18", list_id: "d4", name: "Passport",                    notes: "", is_checked: 1, sort_order: 2, added_at: "" },
  ],
};

// ── Insights ──────────────────────────────────────────────────────────────────

export function buildDemoData() {
  const months = getMonths(12);
  const current = months[months.length - 1];
  const prev = months[months.length - 2];
  const cats = [
    { category: "Rent & Housing", total: 2200 },
    { category: "Food & Dining",  total: 386 },
    { category: "Groceries",      total: 173 },
    { category: "Transport",      total: 103 },
  ];
  const prevCats = [
    { category: "Rent & Housing", total: 2200 },
    { category: "Food & Dining",  total: 344 },
    { category: "Groceries",      total: 180 },
    { category: "Transport",      total: 100 },
  ];
  return {
    [current]: { month: current, categories: cats, total: cats.reduce((s, c) => s + c.total, 0) },
    [prev]:    { month: prev,    categories: prevCats, total: prevCats.reduce((s, c) => s + c.total, 0) },
  };
}

// ── Yearly ────────────────────────────────────────────────────────────────────

export function buildDemoYearly(year: number) {
  const totals = [0, 0, 2950, 3100, 2862, 0, 0, 0, 0, 0, 0, 0];
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, "0")}`,
    label: new Date(year, i).toLocaleDateString("en-US", { month: "short" }),
    total: totals[i] || 0,
  }));
  return {
    months,
    topCategories: [
      { category: "Rent & Housing", total: 6600 },
      { category: "Food & Dining",  total: 1158 },
      { category: "Groceries",      total: 519 },
      { category: "Transport",      total: 309 },
    ],
  };
}

// ── Forecast ──────────────────────────────────────────────────────────────────

export const DEMO_FORECAST = {
  income: 6500,
  balance: 5500,
  month_spent: 2862,
  total_monthly_bills: 2258,
  bills: [
    { name: "Rent",    amount: 2200,  next_due: "2026-05-01", frequency: "monthly" },
    { name: "Netflix", amount: 15.99, next_due: "2026-04-24", frequency: "monthly" },
    { name: "Gym",     amount: 29.99, next_due: "2026-04-28", frequency: "monthly" },
  ],
  total_goal_remaining: 4680,
  goals_summary: [
    { name: "Vacation Fund",  target_amount: 4000, current_amount: 2720, target_date: "2026-12-01" },
    { name: "Emergency Fund", target_amount: 5000, current_amount: 1600, target_date: "" },
  ],
  projected_remaining: 1560,
  free_after_goals: 880,
};
