"""
core/tools.py — Grok function-calling tool schemas + Python implementations.

Two parts:
  1. TOOL_SCHEMAS   — list of OpenAI-compatible function definitions sent to Grok API
  2. execute_tool() — dispatcher that runs the matching Python function
  3. seed_sample_data() — seeds demo data on first login
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta

from db import delete_row, fetch_rows, get_connection, insert_row, update_row

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# TOOL SCHEMAS  (sent to Grok API as the `tools` parameter)
# ─────────────────────────────────────────────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "add_expense",
            "description": (
                "Add an expense or transaction. Use when the user mentions spending money, "
                "buying something, or logging a purchase."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "Amount in USD (positive number)"},
                    "merchant": {"type": "string", "description": "Merchant name or short description"},
                    "category": {
                        "type": "string",
                        "description": (
                            "Category. Use exactly one of: Food & Dining, Groceries, Transport, "
                            "Entertainment, Shopping, Health & Fitness, Utilities, Rent & Housing, "
                            "Travel, Subscriptions, Personal Care, Education, Other"
                        ),
                    },
                    "date": {"type": "string", "description": "Date as YYYY-MM-DD. Defaults to today if omitted."},
                    "notes": {"type": "string", "description": "Optional extra notes"},
                },
                "required": ["amount", "merchant", "category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_calendar_event",
            "description": (
                "Add an event, appointment, meeting, pickup, or reminder to the calendar. "
                "Use for anything that happens at a specific date/time."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short event title"},
                    "date": {"type": "string", "description": "Date as YYYY-MM-DD"},
                    "time": {"type": "string", "description": "Time as HH:MM (24h). Omit for all-day."},
                    "description": {"type": "string", "description": "Optional details"},
                    "event_type": {
                        "type": "string",
                        "enum": ["event", "reminder", "errand", "bill_due", "task"],
                        "description": "Type of event",
                    },
                },
                "required": ["title", "date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_grocery_items",
            "description": "Add one or more items to the grocery/shopping list.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "description": "List of grocery items to add",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "Item name"},
                                "quantity": {"type": "string", "description": "e.g. '2', '1 lb', '6 pack'"},
                                "estimated_price": {"type": "number", "description": "Estimated price in USD"},
                            },
                            "required": ["name"],
                        },
                    }
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_recurring_bill",
            "description": (
                "Add a recurring bill, subscription, or payment. "
                "Use when the user mentions something happening regularly (monthly, weekly, etc.)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Bill or subscription name"},
                    "amount": {"type": "number", "description": "Amount per cycle in USD"},
                    "frequency": {
                        "type": "string",
                        "enum": ["monthly", "weekly", "yearly", "bi-weekly"],
                        "description": "How often it recurs",
                    },
                    "due_day": {
                        "type": "integer",
                        "description": "Day of month (1–31) when bill is due. For monthly bills.",
                    },
                    "category": {"type": "string", "description": "Category (e.g. Utilities, Subscriptions)"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_task",
            "description": "Add a to-do item, task, or action item.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Task description"},
                    "due_date": {"type": "string", "description": "Due date as YYYY-MM-DD (optional)"},
                    "priority": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                        "description": "Priority level",
                    },
                    "category": {"type": "string", "description": "Category: work, personal, finance, health, etc."},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_note",
            "description": "Save a note, journal entry, idea, or memo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short note title"},
                    "content": {"type": "string", "description": "Note body / content"},
                    "tags": {"type": "string", "description": "Comma-separated tags (optional)"},
                },
                "required": ["title", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_budget",
            "description": "Set or update the monthly spending budget for a category.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Budget category name"},
                    "amount": {"type": "number", "description": "Monthly budget amount in USD"},
                    "month": {"type": "string", "description": "Month as YYYY-MM. Defaults to current month."},
                },
                "required": ["category", "amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_grocery_item",
            "description": "Mark a grocery list item as checked/bought.",
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string", "description": "Name of the item to mark as bought"},
                },
                "required": ["item_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "complete_task",
            "description": "Mark a task or to-do item as completed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_title": {"type": "string", "description": "Title or description of the task to complete"},
                },
                "required": ["task_title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_spending_summary",
            "description": "Get a spending summary for a time period, optionally filtered by category.",
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["today", "this_week", "this_month", "last_month", "last_7_days", "last_30_days"],
                        "description": "Time period for the summary",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional: filter by a specific category",
                    },
                },
                "required": ["period"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_net_worth",
            "description": "Get the user's current net worth — total assets minus liabilities.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_upcoming_schedule",
            "description": "Get upcoming events, bills, and tasks for the next N days.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Number of days to look ahead (default: 14)",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_budget_status",
            "description": "Get current spending vs budget for all categories this month.",
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "string", "description": "Month as YYYY-MM. Defaults to current month."},
                    "category": {"type": "string", "description": "Optional: specific category only"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_goal",
            "description": (
                "Create a new savings or financial goal. Use when the user wants to save for something "
                "specific (emergency fund, vacation, paying off debt, buying a car, etc.)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Clear goal name, e.g. 'Emergency Fund', 'Japan Vacation', 'Pay Off Credit Card'"},
                    "target_amount": {"type": "number", "description": "Total target amount in dollars"},
                    "current_amount": {"type": "number", "description": "How much has already been saved toward this goal (default 0)"},
                    "target_date": {"type": "string", "description": "Target completion date as YYYY-MM-DD (optional)"},
                    "category": {
                        "type": "string",
                        "enum": ["emergency", "vacation", "house", "retirement", "education", "investment", "debt_payoff", "vehicle", "gadget", "wedding", "other"],
                        "description": "Goal category type",
                    },
                    "linked_budget_category": {"type": "string", "description": "Optional budget category to link spending awareness (e.g. 'Dining', 'Savings')"},
                    "notes": {"type": "string", "description": "Optional motivation note or description"},
                },
                "required": ["name", "target_amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_goal_progress",
            "description": (
                "Add funds to a savings goal or set the current saved amount. "
                "Use when user says they saved money toward a goal, got a bonus, or transferred money to a goal account."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "goal_name": {"type": "string", "description": "Name of the goal to update (partial match ok)"},
                    "amount": {"type": "number", "description": "Amount to add (if action='add') or set (if action='set')"},
                    "action": {
                        "type": "string",
                        "enum": ["add", "set"],
                        "description": "'add' adds to current saved amount; 'set' replaces current saved amount entirely",
                    },
                },
                "required": ["goal_name", "amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_goals",
            "description": "Get all active savings goals with progress details, or look up a specific goal by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "goal_name": {"type": "string", "description": "Optional: name of a specific goal to look up"},
                    "include_completed": {"type": "boolean", "description": "Include already-completed goals (default false)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_spending_recap",
            "description": (
                "Generate a natural-language spending recap for a time period. "
                "Use when the user asks for a summary, recap, or review of their spending. "
                "Returns total spent, top categories, comparison to prior period, goal impact, and a positive insight."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["this_week", "last_week", "this_month", "last_month"],
                        "description": "Time period for the recap",
                    },
                },
                "required": ["period"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_custom_category",
            "description": (
                "Create a new custom budget category. Use when the user says 'create a category', "
                "'add a category called X', or mentions a spending area that doesn't fit existing categories."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Category name (e.g. 'Date Night', 'Pet Care', 'Side Hustle')"},
                    "icon": {"type": "string", "description": "Single emoji icon for the category (e.g. '🌹', '🐶', '💼')"},
                    "color": {"type": "string", "description": "Hex color for the category badge (e.g. '#f43f5e'). Optional."},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_money_left_after_goals",
            "description": (
                "Calculate and return how much money the user has left to spend freely this month "
                "after accounting for estimated income, recurring bills, and monthly goal contributions. "
                "Use when the user asks 'how much can I spend freely?', 'money left after goals', or similar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "string", "description": "Month as YYYY-MM. Defaults to current month."},
                },
            },
        },
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# TOOL IMPLEMENTATIONS
# ─────────────────────────────────────────────────────────────────────────────

def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _current_month() -> str:
    return datetime.now().strftime("%Y-%m")


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _uid() -> str:
    return str(uuid.uuid4())


# ── Write tools ───────────────────────────────────────────────────────────────

def _add_expense(args: dict, user_id: str) -> dict:
    date = args.get("date") or _today()
    import json as _json
    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": float(args["amount"]),
        "merchant": args.get("merchant", "Unknown"),
        "description": args.get("merchant", ""),
        "category": args.get("category", "Other"),
        "is_recurring": 0,
        "metadata": _json.dumps({"notes": args.get("notes", "")}),
    }
    insert_row("transactions", row)
    # Return budget context
    month = date[:7]
    spent = _get_category_spending(user_id, args.get("category", "Other"), month)
    budget = _get_category_budget(user_id, args.get("category", "Other"), month)
    return {
        "status": "ok",
        "id": row["id"],
        "amount": row["amount"],
        "merchant": row["merchant"],
        "category": row["category"],
        "date": date,
        "month_spent": spent,
        "month_budget": budget,
    }


def _add_calendar_event(args: dict, user_id: str) -> dict:
    title = args["title"]
    date = args.get("date") or _today()
    time = args.get("time", "")
    event_datetime = f"{date} {time}".strip()
    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": title,
        "description": args.get("description", ""),
        "event_date": event_datetime,
        "event_type": args.get("event_type", "event"),
        "amount": 0,
        "is_recurring": 0,
        "created_at": _now_iso(),
    }
    insert_row("events", row)
    return {"status": "ok", "id": row["id"], "title": title, "date": date, "time": time}


def _add_grocery_items(args: dict, user_id: str) -> dict:
    items_added = []
    for item in args.get("items", []):
        row = {
            "id": _uid(),
            "user_id": user_id,
            "name": item["name"],
            "quantity": item.get("quantity", "1"),
            "estimated_price": float(item.get("estimated_price", 0)),
            "is_checked": 0,
            "added_at": _now_iso(),
        }
        insert_row("grocery_items", row)
        items_added.append(item["name"])
    total_est = sum(
        float(i.get("estimated_price", 0)) for i in args.get("items", [])
    )
    all_items = fetch_rows("grocery_items", {"user_id": user_id, "is_checked": 0})
    return {
        "status": "ok",
        "added": items_added,
        "count_added": len(items_added),
        "total_list_count": len(all_items),
        "estimated_total_added": total_est,
    }


def _add_recurring_bill(args: dict, user_id: str) -> dict:
    name = args["name"]
    amount = float(args.get("amount", 0))
    frequency = args.get("frequency", "monthly")
    due_day = args.get("due_day")

    # Compute next due date
    now = datetime.now()
    if due_day and frequency == "monthly":
        try:
            due_day_int = int(due_day)
            if now.day < due_day_int:
                next_due = now.replace(day=due_day_int).strftime("%Y-%m-%d")
            else:
                if now.month == 12:
                    next_due = now.replace(year=now.year + 1, month=1, day=due_day_int).strftime("%Y-%m-%d")
                else:
                    next_due = now.replace(month=now.month + 1, day=due_day_int).strftime("%Y-%m-%d")
        except Exception:
            next_due = (now + timedelta(days=30)).strftime("%Y-%m-%d")
    else:
        next_due = (now + timedelta(days=30)).strftime("%Y-%m-%d")

    row = {
        "id": _uid(),
        "user_id": user_id,
        "name": name,
        "amount": amount,
        "frequency": frequency,
        "next_due": next_due,
        "category": args.get("category", "Utilities"),
        "is_active": 1,
        "detected_at": _now_iso(),
    }
    insert_row("subscriptions", row)
    return {"status": "ok", "id": row["id"], "name": name, "amount": amount, "next_due": next_due}


def _add_task(args: dict, user_id: str) -> dict:
    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": args["title"],
        "description": args.get("description", ""),
        "priority": args.get("priority", "medium"),
        "status": "open",
        "due_date": args.get("due_date", ""),
        "category": args.get("category", "personal"),
        "created_by": "orryon",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    insert_row("action_items", row)
    return {"status": "ok", "id": row["id"], "title": row["title"], "due_date": row["due_date"]}


def _add_note(args: dict, user_id: str) -> dict:
    now_iso = _now_iso()
    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": args["title"],
        "content": args["content"],
        "tags": args.get("tags", ""),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    insert_row("notes", row)
    return {"status": "ok", "id": row["id"], "title": row["title"]}


def _set_budget(args: dict, user_id: str) -> dict:
    month = args.get("month") or _current_month()
    category = args["category"]
    amount = float(args["amount"])
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM budget_categories WHERE user_id=? AND category=? AND month=?",
        (user_id, category, month),
    ).fetchone()
    conn.close()
    if existing:
        update_row("budget_categories", {"planned": amount}, {"id": existing["id"]})
    else:
        insert_row("budget_categories", {
            "id": _uid(),
            "user_id": user_id,
            "category": category,
            "planned": amount,
            "month": month,
            "created_at": _now_iso(),
        })
    spent = _get_category_spending(user_id, category, month)
    return {"status": "ok", "category": category, "planned": amount, "spent": spent, "month": month}


def _check_grocery_item(args: dict, user_id: str) -> dict:
    name = args["item_name"].lower()
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, name FROM grocery_items WHERE user_id=? AND is_checked=0",
        (user_id,),
    ).fetchall()
    conn.close()
    matched = next((r for r in rows if name in r["name"].lower()), None)
    if matched:
        update_row("grocery_items", {"is_checked": 1}, {"id": matched["id"]})
        return {"status": "ok", "checked": matched["name"]}
    return {"status": "not_found", "searched": args["item_name"]}


def _complete_task(args: dict, user_id: str) -> dict:
    title = args["task_title"].lower()
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, title FROM action_items WHERE user_id=? AND status='open'",
        (user_id,),
    ).fetchall()
    conn.close()
    matched = next((r for r in rows if title in r["title"].lower()), None)
    if matched:
        update_row("action_items", {"status": "done", "updated_at": _now_iso()}, {"id": matched["id"]})
        return {"status": "ok", "completed": matched["title"]}
    return {"status": "not_found", "searched": args["task_title"]}


# ── Read tools ────────────────────────────────────────────────────────────────

def _get_spending_summary(args: dict, user_id: str) -> dict:
    period = args.get("period", "this_month")
    category_filter = args.get("category", "")
    now = datetime.now()

    if period == "today":
        start = now.strftime("%Y-%m-%d")
        end = start
    elif period == "this_week":
        start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
    elif period == "this_month":
        start = now.strftime("%Y-%m-01")
        end = now.strftime("%Y-%m-%d")
    elif period == "last_month":
        first_this = now.replace(day=1)
        last_month_end = first_this - timedelta(days=1)
        start = last_month_end.replace(day=1).strftime("%Y-%m-%d")
        end = last_month_end.strftime("%Y-%m-%d")
    elif period == "last_7_days":
        start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
    else:  # last_30_days
        start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")

    conn = get_connection()
    if category_filter:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND date>=? AND date<=? AND category=? AND amount>0",
            (user_id, start, end, category_filter),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE user_id=? AND date>=? AND date<=? AND amount>0",
            (user_id, start, end),
        ).fetchall()
    conn.close()

    total = sum(r["amount"] for r in rows)
    by_category: dict[str, float] = {}
    for r in rows:
        cat = r["category"] or "Other"
        by_category[cat] = by_category.get(cat, 0) + r["amount"]

    breakdown = sorted(
        [{"category": k, "total": round(v, 2)} for k, v in by_category.items()],
        key=lambda x: x["total"], reverse=True
    )
    return {
        "period": period,
        "start": start,
        "end": end,
        "total": round(total, 2),
        "transaction_count": len(rows),
        "by_category": breakdown,
        "category_filter": category_filter or "all",
    }


def _get_net_worth(args: dict, user_id: str) -> dict:
    accounts = fetch_rows("accounts", {"user_id": user_id})
    assets = sum(a["balance"] for a in accounts if a["balance"] > 0)
    liabilities = abs(sum(a["balance"] for a in accounts if a["balance"] < 0))
    net_worth = assets - liabilities
    return {
        "net_worth": round(net_worth, 2),
        "total_assets": round(assets, 2),
        "total_liabilities": round(liabilities, 2),
        "account_count": len(accounts),
    }


def _get_upcoming_schedule(args: dict, user_id: str) -> dict:
    days = int(args.get("days", 14))
    now = datetime.now()
    end_date = (now + timedelta(days=days)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    conn = get_connection()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? AND event_date>=? ORDER BY event_date ASC LIMIT 20",
        (user_id, today),
    ).fetchall()
    tasks = conn.execute(
        "SELECT * FROM action_items WHERE user_id=? AND status='open' ORDER BY due_date ASC LIMIT 10",
        (user_id,),
    ).fetchall()
    bills = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND is_active=1 AND next_due>=? AND next_due<=? ORDER BY next_due ASC",
        (user_id, today, end_date),
    ).fetchall()
    conn.close()

    items = []
    for e in events:
        items.append({
            "type": "event",
            "title": e["title"],
            "date": e["event_date"][:10] if e["event_date"] else "",
            "time": e["event_date"][11:16] if len(e["event_date"] or "") > 10 else "",
        })
    for t in tasks:
        items.append({
            "type": "task",
            "title": t["title"],
            "date": t["due_date"] or "",
            "priority": t["priority"],
        })
    for b in bills:
        items.append({
            "type": "bill",
            "title": b["name"],
            "date": b["next_due"],
            "amount": b["amount"],
        })

    items.sort(key=lambda x: x.get("date") or "9999")
    return {"days_ahead": days, "items": items, "count": len(items)}


def _get_budget_status(args: dict, user_id: str) -> dict:
    month = args.get("month") or _current_month()
    category_filter = args.get("category", "")

    conn = get_connection()
    if category_filter:
        budgets = conn.execute(
            "SELECT * FROM budget_categories WHERE user_id=? AND month=? AND category=?",
            (user_id, month, category_filter),
        ).fetchall()
    else:
        budgets = conn.execute(
            "SELECT * FROM budget_categories WHERE user_id=? AND month=?",
            (user_id, month),
        ).fetchall()

    start = f"{month}-01"
    end = f"{month}-31"
    txns = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND date<=? AND amount>0 GROUP BY category",
        (user_id, start, end),
    ).fetchall()
    conn.close()

    spent_map = {r["category"]: round(r["total"], 2) for r in txns}
    result = []
    for b in budgets:
        cat = b["category"]
        spent = spent_map.get(cat, 0)
        planned = b["planned"]
        pct = round((spent / planned * 100) if planned else 0, 1)
        result.append({
            "category": cat,
            "planned": planned,
            "spent": spent,
            "remaining": round(planned - spent, 2),
            "pct_used": pct,
        })
    result.sort(key=lambda x: x["pct_used"], reverse=True)
    return {"month": month, "categories": result}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_category_spending(user_id: str, category: str, month: str) -> float:
    conn = get_connection()
    row = conn.execute(
        "SELECT SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND category=? AND date LIKE ? AND amount>0",
        (user_id, category, f"{month}%"),
    ).fetchone()
    conn.close()
    return round(float(row["total"] or 0), 2)


def _get_category_budget(user_id: str, category: str, month: str) -> float:
    conn = get_connection()
    row = conn.execute(
        "SELECT planned FROM budget_categories WHERE user_id=? AND category=? AND month=?",
        (user_id, category, month),
    ).fetchone()
    conn.close()
    return float(row["planned"]) if row else 0.0


# ── Goal tools ────────────────────────────────────────────────────────────────

def _add_goal(args: dict, user_id: str) -> dict:
    row = {
        "id": _uid(),
        "user_id": user_id,
        "name": args["name"],
        "target_amount": float(args["target_amount"]),
        "current_amount": float(args.get("current_amount", 0)),
        "target_date": args.get("target_date", ""),
        "category": args.get("category", "other"),
        "linked_budget_category": args.get("linked_budget_category", ""),
        "notes": args.get("notes", ""),
        "created_at": _now_iso(),
        "is_completed": 0,
    }
    insert_row("goals", row)
    pct = round((row["current_amount"] / row["target_amount"]) * 100, 1) if row["target_amount"] else 0
    remaining = round(row["target_amount"] - row["current_amount"], 2)
    # Days to target
    days_left = None
    if row["target_date"]:
        try:
            td = datetime.strptime(row["target_date"], "%Y-%m-%d") - datetime.now()
            days_left = max(0, td.days)
        except Exception:
            pass
    return {
        "status": "ok",
        "id": row["id"],
        "name": row["name"],
        "target_amount": row["target_amount"],
        "current_amount": row["current_amount"],
        "pct_complete": pct,
        "remaining": remaining,
        "target_date": row["target_date"],
        "days_left": days_left,
    }


def _update_goal_progress(args: dict, user_id: str) -> dict:
    goal_name = args["goal_name"].lower()
    amount = float(args["amount"])
    action = args.get("action", "add")

    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchall()
    conn.close()

    matched = next((r for r in rows if goal_name in r["name"].lower()), None)
    if not matched:
        return {"status": "not_found", "searched": args["goal_name"]}

    if action == "set":
        new_amount = amount
    else:
        new_amount = float(matched["current_amount"]) + amount

    new_amount = max(0, new_amount)
    target = float(matched["target_amount"])
    is_completed = 1 if new_amount >= target else 0
    new_amount = min(new_amount, target)

    update_row(
        "goals",
        {"current_amount": new_amount, "is_completed": is_completed},
        {"id": matched["id"]},
    )

    pct = round((new_amount / target) * 100, 1) if target else 0
    remaining = round(target - new_amount, 2)
    return {
        "status": "ok",
        "name": matched["name"],
        "current_amount": round(new_amount, 2),
        "target_amount": target,
        "pct_complete": pct,
        "remaining": remaining,
        "is_completed": bool(is_completed),
        "added": round(amount, 2) if action == "add" else None,
    }


def _get_goals(args: dict, user_id: str) -> dict:
    goal_name = (args.get("goal_name") or "").lower()
    include_completed = args.get("include_completed", False)

    conn = get_connection()
    if include_completed:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? AND is_completed=0 ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    conn.close()

    if goal_name:
        rows = [r for r in rows if goal_name in r["name"].lower()]

    goals = []
    for r in rows:
        target = float(r["target_amount"])
        current = float(r["current_amount"])
        pct = round((current / target) * 100, 1) if target else 0
        days_left = None
        if r["target_date"]:
            try:
                td = datetime.strptime(r["target_date"], "%Y-%m-%d") - datetime.now()
                days_left = max(0, td.days)
            except Exception:
                pass
        goals.append({
            "name": r["name"],
            "target_amount": target,
            "current_amount": round(current, 2),
            "remaining": round(target - current, 2),
            "pct_complete": pct,
            "target_date": r["target_date"] or "",
            "category": r["category"],
            "days_left": days_left,
            "is_completed": bool(r["is_completed"]),
            "notes": r["notes"] or "",
        })

    return {"goals": goals, "count": len(goals)}


# ── Spending Recap ────────────────────────────────────────────────────────────

def _get_spending_recap(args: dict, user_id: str) -> dict:
    period = args.get("period", "this_month")
    now = datetime.now()

    if period == "this_week":
        start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
        prev_start = (now - timedelta(days=now.weekday() + 7)).strftime("%Y-%m-%d")
        prev_end = (now - timedelta(days=now.weekday() + 1)).strftime("%Y-%m-%d")
        label = "This Week"
    elif period == "last_week":
        monday = now - timedelta(days=now.weekday() + 7)
        start = monday.strftime("%Y-%m-%d")
        end = (monday + timedelta(days=6)).strftime("%Y-%m-%d")
        prev_start = (monday - timedelta(days=7)).strftime("%Y-%m-%d")
        prev_end = (monday - timedelta(days=1)).strftime("%Y-%m-%d")
        label = "Last Week"
    elif period == "last_month":
        first_this = now.replace(day=1)
        last_mo_end = first_this - timedelta(days=1)
        start = last_mo_end.replace(day=1).strftime("%Y-%m-%d")
        end = last_mo_end.strftime("%Y-%m-%d")
        prev_first = last_mo_end.replace(day=1) - timedelta(days=1)
        prev_start = prev_first.replace(day=1).strftime("%Y-%m-%d")
        prev_end = prev_first.strftime("%Y-%m-%d")
        label = "Last Month"
    else:  # this_month
        start = now.strftime("%Y-%m-01")
        end = now.strftime("%Y-%m-%d")
        prev_mo = (now.replace(day=1) - timedelta(days=1))
        prev_start = prev_mo.replace(day=1).strftime("%Y-%m-%d")
        prev_end = prev_mo.strftime("%Y-%m-%d")
        label = "This Month"

    conn = get_connection()
    rows = conn.execute(
        "SELECT category, SUM(amount) as total, COUNT(*) as cnt "
        "FROM transactions WHERE user_id=? AND date>=? AND date<=? AND amount>0 GROUP BY category",
        (user_id, start, end),
    ).fetchall()
    prev_rows = conn.execute(
        "SELECT SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND date<=? AND amount>0",
        (user_id, prev_start, prev_end),
    ).fetchone()
    budgets = conn.execute(
        "SELECT category, planned FROM budget_categories WHERE user_id=? AND month=?",
        (user_id, start[:7]),
    ).fetchall()
    conn.close()

    total = sum(float(r["total"]) for r in rows)
    prev_total = float(prev_rows["total"] or 0) if prev_rows else 0
    by_cat = sorted([{"category": r["category"], "total": round(float(r["total"]), 2), "count": r["cnt"]} for r in rows], key=lambda x: -x["total"])
    top_cats = by_cat[:3]

    budget_map = {b["category"]: float(b["planned"]) for b in budgets}
    over_budget = [{"category": c["category"], "spent": c["total"], "budget": budget_map[c["category"]], "over_by": round(c["total"] - budget_map[c["category"]], 2)} for c in by_cat if c["category"] in budget_map and c["total"] > budget_map[c["category"]]]

    diff = round(total - prev_total, 2)
    diff_pct = round((diff / prev_total * 100) if prev_total > 0 else 0, 1)

    # Positive insight: find the category that improved most vs prior period
    insight = ""
    if total < prev_total and prev_total > 0:
        insight = f"Great job — you spent ${abs(diff):,.0f} less than the previous period ({abs(diff_pct):.0f}% reduction)! 🎉"
    elif top_cats:
        best_cat = min(by_cat, key=lambda x: x["total"]) if len(by_cat) > 1 else None
        if best_cat:
            insight = f"Your lowest spending category was {best_cat['category']} at ${best_cat['total']:,.0f} — nice restraint there!"
        else:
            insight = "Keep tracking your spending to build better habits over time!"

    return {
        "period": label,
        "start": start,
        "end": end,
        "total_spent": round(total, 2),
        "transaction_count": sum(r["cnt"] for r in rows),
        "top_categories": top_cats,
        "all_categories": by_cat,
        "prev_total": round(prev_total, 2),
        "change_vs_prev": diff,
        "change_pct": diff_pct,
        "over_budget_categories": over_budget,
        "positive_insight": insight,
    }


# ── Custom Categories ─────────────────────────────────────────────────────────

def _add_custom_category(args: dict, user_id: str) -> dict:
    name = args["name"].strip()
    icon = args.get("icon", "🏷️")
    color = args.get("color", "#6366f1")
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM custom_categories WHERE user_id=? AND name=?",
        (user_id, name),
    ).fetchone()
    conn.close()
    if existing:
        return {"status": "already_exists", "name": name, "message": f"Category '{name}' already exists."}
    insert_row("custom_categories", {
        "id": _uid(),
        "user_id": user_id,
        "name": name,
        "color": color,
        "icon": icon,
        "is_active": 1,
        "created_at": _now_iso(),
    })
    return {"status": "ok", "name": name, "icon": icon, "color": color}


def _get_custom_categories(user_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM custom_categories WHERE user_id=? AND is_active=1 ORDER BY name",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Money Left After Goals ────────────────────────────────────────────────────

def _get_money_left_after_goals(args: dict, user_id: str) -> dict:
    month = args.get("month") or _current_month()
    now = datetime.now()

    # Estimate monthly income from negative transactions (income = negative amount)
    conn = get_connection()
    income_rows = conn.execute(
        "SELECT SUM(amount) as total FROM transactions WHERE user_id=? AND date LIKE ? AND amount<0",
        (user_id, f"{month}%"),
    ).fetchone()
    # Total expenses this month
    expense_rows = conn.execute(
        "SELECT SUM(amount) as total FROM transactions WHERE user_id=? AND date LIKE ? AND amount>0",
        (user_id, f"{month}%"),
    ).fetchone()
    # Recurring monthly bills
    bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions WHERE user_id=? AND is_active=1 AND frequency='monthly'",
        (user_id,),
    ).fetchone()
    # Active goals - estimate monthly contribution needed
    goals = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchall()
    conn.close()

    monthly_income = abs(float(income_rows["total"] or 0))
    total_expenses = float(expense_rows["total"] or 0)
    monthly_bills = float(bills["total"] or 0)

    # If no income tracked, estimate from prior month average spending
    if monthly_income == 0:
        monthly_income = total_expenses * 1.2  # rough estimate: spend is ~83% of income

    # Calculate monthly goal contributions needed
    goal_monthly_needed = 0.0
    goal_details = []
    today = now.date()
    for g in goals:
        target = float(g["target_amount"])
        current = float(g["current_amount"])
        remaining = target - current
        if remaining <= 0:
            continue
        monthly_contrib = 0.0
        if g["target_date"]:
            try:
                target_dt = datetime.strptime(g["target_date"], "%Y-%m-%d").date()
                months_left = max(1, (target_dt - today).days / 30.44)
                monthly_contrib = round(remaining / months_left, 2)
            except Exception:
                monthly_contrib = round(remaining / 12, 2)
        else:
            monthly_contrib = round(remaining / 12, 2)
        goal_monthly_needed += monthly_contrib
        goal_details.append({"name": g["name"], "monthly_needed": monthly_contrib})

    free_spending = round(monthly_income - monthly_bills - goal_monthly_needed, 2)
    already_spent_this_month = total_expenses
    free_remaining = round(free_spending - already_spent_this_month + monthly_bills, 2)

    return {
        "month": month,
        "estimated_monthly_income": round(monthly_income, 2),
        "monthly_bills_total": round(monthly_bills, 2),
        "monthly_goal_contributions": round(goal_monthly_needed, 2),
        "free_spending_budget": free_spending,
        "spent_so_far": round(total_expenses, 2),
        "free_remaining": free_remaining,
        "goal_breakdown": goal_details,
        "income_note": "Income estimated from transactions" if float(income_rows["total"] or 0) < 0 else "Estimated from spending patterns",
    }


# ── Dispatcher ────────────────────────────────────────────────────────────────

_TOOL_MAP = {
    "add_expense": _add_expense,
    "add_calendar_event": _add_calendar_event,
    "add_grocery_items": _add_grocery_items,
    "add_recurring_bill": _add_recurring_bill,
    "add_task": _add_task,
    "add_note": _add_note,
    "set_budget": _set_budget,
    "check_grocery_item": _check_grocery_item,
    "complete_task": _complete_task,
    "get_spending_summary": _get_spending_summary,
    "get_net_worth": _get_net_worth,
    "get_upcoming_schedule": _get_upcoming_schedule,
    "get_budget_status": _get_budget_status,
    "add_goal": _add_goal,
    "update_goal_progress": _update_goal_progress,
    "get_goals": _get_goals,
    "get_spending_recap": _get_spending_recap,
    "add_custom_category": _add_custom_category,
    "get_money_left_after_goals": _get_money_left_after_goals,
}

# Which tools cause which tabs to refresh
_TAB_REFRESH_MAP = {
    "add_expense": ["dashboard", "budget"],
    "set_budget": ["dashboard", "budget"],
    "add_calendar_event": ["dashboard", "schedule"],
    "add_grocery_items": ["dashboard", "schedule"],
    "check_grocery_item": ["schedule"],
    "add_recurring_bill": ["schedule", "forecast"],
    "add_task": ["schedule"],
    "complete_task": ["schedule"],
    "add_note": ["notes"],
    "add_goal": ["dashboard", "goals"],
    "update_goal_progress": ["dashboard", "goals"],
    "get_spending_summary": [],
    "get_net_worth": [],
    "get_upcoming_schedule": [],
    "get_budget_status": [],
    "get_goals": [],
    "get_spending_recap": [],
    "add_custom_category": ["budget"],
    "get_money_left_after_goals": [],
}


def execute_tool(tool_name: str, args: dict, user_id: str) -> tuple[dict, list[str]]:
    """
    Execute a tool by name with the given args for user_id.
    Returns (result_dict, tabs_to_refresh).
    """
    fn = _TOOL_MAP.get(tool_name)
    if fn is None:
        return {"error": f"Unknown tool: {tool_name}"}, []
    try:
        result = fn(args, user_id)
        tabs = _TAB_REFRESH_MAP.get(tool_name, [])
        logger.info("Tool %s executed: %s", tool_name, result)
        return result, tabs
    except Exception as exc:
        logger.error("Tool %s error: %s", tool_name, exc)
        return {"error": str(exc)}, []


# ─────────────────────────────────────────────────────────────────────────────
# SAMPLE DATA SEEDER  (called on first login)
# ─────────────────────────────────────────────────────────────────────────────

def seed_sample_data(user_id: str) -> None:
    """Seed realistic demo data so new users see a populated dashboard."""
    now = datetime.now()
    month = now.strftime("%Y-%m")
    today = now.strftime("%Y-%m-%d")

    # ── Accounts ─────────────────────────────────────────────────────────────
    accounts = [
        {"id": _uid(), "user_id": user_id, "name": "Chase Checking", "type": "checking",
         "institution": "Chase", "balance": 4280.50, "currency": "USD", "last_updated": today},
        {"id": _uid(), "user_id": user_id, "name": "HYSA Savings", "type": "savings",
         "institution": "Marcus", "balance": 18500.00, "currency": "USD", "last_updated": today},
        {"id": _uid(), "user_id": user_id, "name": "Fidelity Brokerage", "type": "investment",
         "institution": "Fidelity", "balance": 34200.00, "currency": "USD", "last_updated": today},
        {"id": _uid(), "user_id": user_id, "name": "Roth IRA", "type": "investment",
         "institution": "Vanguard", "balance": 22000.00, "currency": "USD", "last_updated": today},
        {"id": _uid(), "user_id": user_id, "name": "Chase Sapphire", "type": "credit",
         "institution": "Chase", "balance": -1240.00, "currency": "USD", "last_updated": today},
        {"id": _uid(), "user_id": user_id, "name": "Student Loan", "type": "loan",
         "institution": "Navient", "balance": -12000.00, "currency": "USD", "last_updated": today},
    ]
    for a in accounts:
        insert_row("accounts", a)

    # ── Transactions (this month) ─────────────────────────────────────────────
    def txn(date, amount, merchant, category):
        insert_row("transactions", {
            "id": _uid(), "user_id": user_id, "date": date, "amount": amount,
            "merchant": merchant, "description": merchant, "category": category,
            "is_recurring": 0, "metadata": "{}",
        })

    d = lambda days_ago: (now - timedelta(days=days_ago)).strftime("%Y-%m-%d")
    txn(d(1),  18.50, "Blue Bottle Coffee",     "Food & Dining")
    txn(d(2), 312.00, "Sushi Agato",             "Food & Dining")
    txn(d(3),  94.20, "Whole Foods",              "Groceries")
    txn(d(4),  14.00, "Uber",                     "Transport")
    txn(d(5),  15.99, "Netflix",                  "Subscriptions")
    txn(d(5),   9.99, "Spotify",                  "Subscriptions")
    txn(d(6),  42.00, "CVS Pharmacy",             "Health & Fitness")
    txn(d(7),  78.30, "Trader Joe's",             "Groceries")
    txn(d(8), 2200.00, "Rent",                    "Rent & Housing")
    txn(d(9),  22.00, "Parking",                  "Transport")
    txn(d(10), 55.00, "Dinner with friends",      "Food & Dining")
    txn(d(11), 38.00, "Amazon",                   "Shopping")
    txn(d(12), 12.00, "Lyft",                     "Transport")
    txn(d(13), 110.00, "Gym — monthly",           "Health & Fitness")
    txn(d(14), 67.00, "Target",                   "Shopping")
    txn(d(15), 8.50, "Coffee shop",               "Food & Dining")
    txn(d(16), 200.00, "Internet + Phone",        "Utilities")
    txn(d(17), 24.00, "Drinks",                   "Food & Dining")
    txn(d(18), 88.00, "Grocery run",              "Groceries")
    # Income this month (negative = income)
    insert_row("transactions", {
        "id": _uid(), "user_id": user_id,
        "date": d(15), "amount": -5500.00,
        "merchant": "Salary", "description": "Paycheck", "category": "Income",
        "is_recurring": 1, "metadata": "{}",
    })

    # ── Budget categories ────────────────────────────────────────────────────
    budgets = [
        ("Food & Dining", 600),
        ("Groceries", 400),
        ("Transport", 200),
        ("Subscriptions", 80),
        ("Health & Fitness", 150),
        ("Shopping", 200),
        ("Rent & Housing", 2300),
        ("Utilities", 250),
        ("Entertainment", 100),
        ("Travel", 300),
    ]
    for cat, planned in budgets:
        insert_row("budget_categories", {
            "id": _uid(), "user_id": user_id,
            "category": cat, "planned": planned,
            "month": month, "created_at": _now_iso(),
        })

    # ── Calendar events ──────────────────────────────────────────────────────
    def evt(date, time, title, etype="event"):
        insert_row("events", {
            "id": _uid(), "user_id": user_id,
            "title": title, "description": "",
            "event_date": f"{date} {time}".strip(),
            "event_type": etype, "amount": 0,
            "is_recurring": 0, "created_at": _now_iso(),
        })

    fd = lambda days: (now + timedelta(days=days)).strftime("%Y-%m-%d")
    evt(fd(2),  "15:00", "Meeting with Kirk")
    evt(fd(4),  "09:00", "Dentist appointment")
    evt(fd(5),  "20:00", "Pick up Synthia at airport")
    evt(fd(7),  "19:00", "Dinner with family")
    evt(fd(10), "10:00", "Quarterly review — work")
    evt(fd(15), "",      "Electricity bill due", "bill_due")

    # ── Recurring bills ───────────────────────────────────────────────────────
    bills = [
        ("Netflix", 15.99, "monthly", 5, "Subscriptions"),
        ("Spotify", 9.99, "monthly", 5, "Subscriptions"),
        ("Gym membership", 110.00, "monthly", 1, "Health & Fitness"),
        ("Internet", 80.00, "monthly", 18, "Utilities"),
        ("Electricity", 120.00, "monthly", 15, "Utilities"),
        ("Rent", 2200.00, "monthly", 1, "Rent & Housing"),
    ]
    for name, amt, freq, day, cat in bills:
        if now.day < day:
            nd = now.replace(day=day).strftime("%Y-%m-%d")
        else:
            m = now.month + 1 if now.month < 12 else 1
            y = now.year if now.month < 12 else now.year + 1
            nd = now.replace(year=y, month=m, day=day).strftime("%Y-%m-%d")
        insert_row("subscriptions", {
            "id": _uid(), "user_id": user_id, "name": name,
            "amount": amt, "frequency": freq, "next_due": nd,
            "category": cat, "is_active": 1, "detected_at": _now_iso(),
        })

    # ── Tasks ────────────────────────────────────────────────────────────────
    tasks = [
        ("Review insurance renewal", "high", fd(7)),
        ("Call dentist for follow-up", "medium", fd(5)),
        ("Transfer $500 to savings", "high", fd(3)),
        ("Research best credit card rewards", "low", ""),
        ("File expense report", "medium", fd(2)),
    ]
    for title, priority, due in tasks:
        insert_row("action_items", {
            "id": _uid(), "user_id": user_id, "title": title,
            "description": "", "priority": priority, "status": "open",
            "due_date": due, "category": "personal",
            "created_by": "orryon", "created_at": _now_iso(), "updated_at": _now_iso(),
        })

    # ── Grocery list ─────────────────────────────────────────────────────────
    groceries = [
        ("Milk", "1 gallon", 4.50),
        ("Eggs", "1 dozen", 5.00),
        ("Bread", "1 loaf", 4.00),
        ("Chicken breast", "2 lbs", 9.00),
        ("Spinach", "1 bag", 3.50),
        ("Greek yogurt", "2 cups", 6.00),
    ]
    for name, qty, price in groceries:
        insert_row("grocery_items", {
            "id": _uid(), "user_id": user_id, "name": name,
            "quantity": qty, "estimated_price": price,
            "is_checked": 0, "added_at": _now_iso(),
        })

    # ── Notes ────────────────────────────────────────────────────────────────
    insert_row("notes", {
        "id": _uid(), "user_id": user_id,
        "title": "Switching to a HYSA",
        "content": "Thinking about moving more cash to Marcus HYSA. Currently at 4.5% APY — better than Chase's 0.01%. Need to keep $2k buffer in checking for bills.",
        "tags": "savings, banking",
        "created_at": _now_iso(), "updated_at": _now_iso(),
    })
    insert_row("notes", {
        "id": _uid(), "user_id": user_id,
        "title": "Side project ideas",
        "content": "1. App idea: grocery budget tracker\n2. Freelance design — reach out to 3 clients this month\n3. Sell old camera gear on eBay",
        "tags": "ideas, work",
        "created_at": _now_iso(), "updated_at": _now_iso(),
    })

    # ── Goals ─────────────────────────────────────────────────────────────────
    _six_months = (now + timedelta(days=180)).strftime("%Y-%m-%d")
    _one_year = (now + timedelta(days=365)).strftime("%Y-%m-%d")
    _two_years = (now + timedelta(days=730)).strftime("%Y-%m-%d")
    _sample_goals = [
        {
            "name": "Emergency Fund",
            "target_amount": 10000.00,
            "current_amount": 4200.00,
            "target_date": _one_year,
            "category": "emergency",
            "linked_budget_category": "Savings",
            "notes": "3–6 months of expenses. Keeping this in HYSA.",
        },
        {
            "name": "Japan Vacation",
            "target_amount": 5000.00,
            "current_amount": 1250.00,
            "target_date": _six_months,
            "category": "vacation",
            "linked_budget_category": "",
            "notes": "Tokyo + Kyoto + Osaka, 14 days. Need flights, hotels, spending money.",
        },
        {
            "name": "Pay Off Student Loan",
            "target_amount": 12000.00,
            "current_amount": 2400.00,
            "target_date": _two_years,
            "category": "debt_payoff",
            "linked_budget_category": "",
            "notes": "Navient loan at 5.8%. Extra $200/mo accelerated payments.",
        },
        {
            "name": "New MacBook",
            "target_amount": 2500.00,
            "current_amount": 800.00,
            "target_date": _six_months,
            "category": "gadget",
            "linked_budget_category": "Shopping",
            "notes": "M4 MacBook Pro when it drops. Saving $300/month.",
        },
    ]
    for g in _sample_goals:
        insert_row("goals", {
            "id": _uid(),
            "user_id": user_id,
            "name": g["name"],
            "target_amount": g["target_amount"],
            "current_amount": g["current_amount"],
            "target_date": g["target_date"],
            "category": g["category"],
            "linked_budget_category": g["linked_budget_category"],
            "notes": g["notes"],
            "created_at": _now_iso(),
            "is_completed": 0,
        })

    logger.info("Sample data seeded for user %s", user_id)
