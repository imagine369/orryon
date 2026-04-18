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
import re
import uuid
from datetime import datetime, timedelta, timezone
from difflib import get_close_matches

try:  # optional; if missing we fall back to regex-only ISO detection
    import dateparser as _dateparser  # type: ignore
except Exception:  # pragma: no cover
    _dateparser = None

from db import (
    delete_row, fetch_rows, get_connection, insert_row, update_row,
    get_balance, adjust_balance, update_balance, get_or_create_balance_account,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# TOOL SCHEMAS  (sent to Grok API as the `tools` parameter)
# ─────────────────────────────────────────────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "log_expense",
            "description": (
                "Log a past or today spending event (EXPENSES section). Use when the user "
                "mentions having spent, bought, paid for, grabbed, or picked up something. "
                "Do NOT use for future recurring charges — use log_bill for those."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "Amount in USD (positive number)"},
                    "merchant": {"type": "string", "description": "Merchant name or short description"},
                    "description": {"type": "string", "description": "Short description of the purchase (alias: notes)"},
                    "category": {
                        "type": "string",
                        "description": (
                            "Canonical category. One of: Food & Dining, Groceries, Transport, "
                            "Subscriptions, Health & Fitness, Shopping, Rent & Housing, Travel, Other."
                        ),
                    },
                    "date": {"type": "string", "description": "ISO date YYYY-MM-DD. Defaults to today."},
                    "notes": {"type": "string", "description": "Optional extra notes"},
                },
                "required": ["amount", "category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_calendar_event",
            "description": (
                "Add a time-bound event to the calendar (CALENDAR section). Use for meetings, "
                "appointments, dinners, errands at a specific time. If only a deadline (no "
                "time) was given, ask the user whether they want it on the calendar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short event title"},
                    "start": {"type": "string", "description": "ISO start datetime YYYY-MM-DDTHH:MM:SS (preferred)."},
                    "end": {"type": "string", "description": "ISO end datetime YYYY-MM-DDTHH:MM:SS (optional)."},
                    "date": {"type": "string", "description": "Legacy alternative: date only YYYY-MM-DD."},
                    "time": {"type": "string", "description": "Legacy alternative: HH:MM 24h. Omit for all-day."},
                    "all_day": {"type": "boolean", "description": "Set true for all-day events (default false)."},
                    "description": {"type": "string", "description": "Optional details"},
                    "event_type": {
                        "type": "string",
                        "enum": ["event", "reminder", "errand", "bill_due", "task"],
                        "description": "Type of event",
                    },
                    "reminder_minutes": {
                        "type": "integer",
                        "enum": [0, 10, 30, 60, 360, 1440],
                        "description": "Email reminder: 0=none, 10=10min, 30=30min (default), 60=1hr, 360=6hr, 1440=1day before",
                    },
                },
                "required": ["title"],
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
            "name": "log_bill",
            "description": (
                "Log a recurring or scheduled FUTURE bill with a due date (BILLS section). "
                "Use for rent, utilities, subscriptions, mortgage, etc. Never use for past "
                "payments — a past payment is an expense (log_expense)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Bill or subscription name"},
                    "amount": {"type": "number", "description": "Amount per cycle in USD"},
                    "frequency": {
                        "type": "string",
                        "enum": ["weekly", "bi-weekly", "monthly", "yearly"],
                        "description": "How often it recurs",
                    },
                    "due_date": {
                        "type": "string",
                        "description": "Next due date as ISO YYYY-MM-DD (preferred).",
                    },
                    "due_day": {
                        "type": "integer",
                        "description": "Alternative: day of month 1–31 (monthly bills only).",
                    },
                    "category": {"type": "string", "description": "Category (e.g. Rent & Housing, Subscriptions)"},
                },
                "required": ["name", "amount", "frequency"],
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
            "description": "Save a note, journal entry, idea, or memo. Supports Markdown content, mood tracking, pinning, and linking to goals.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short note title"},
                    "content": {"type": "string", "description": "Note body / content (Markdown supported)"},
                    "tags": {"type": "string", "description": "Comma-separated tags (optional)"},
                    "mood": {"type": "string", "description": "Mood for this entry: happy, grateful, motivated, neutral, stressed, anxious, reflective (optional)"},
                    "is_pinned": {"type": "boolean", "description": "Pin the note to the top (optional, default false)"},
                    "linked_goal": {"type": "string", "description": "Goal name to link this note to (optional)"},
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
                    "rollover": {"type": "boolean", "description": "If true, unspent budget carries over to next month. Default false."},
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
            "name": "set_balance",
            "description": (
                "Set the user's balance to a specific amount. Use when the user says "
                "'I have $3000', 'my balance is $3000', or 'set my balance to $3000'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "The exact balance amount in USD"},
                },
                "required": ["amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_money",
            "description": (
                "Add money to the user's balance. Use when the user says they got paid, received money, "
                "want to deposit, or add funds. This logs an income transaction AND increases the balance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "Amount to add in USD"},
                    "description": {"type": "string", "description": "Source description (e.g. 'Paycheck', 'Freelance payment', 'Gift')"},
                    "date": {"type": "string", "description": "Date as YYYY-MM-DD. Defaults to today."},
                },
                "required": ["amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_balance",
            "description": "Get the user's current balance — how much money they have.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_grocery_list",
            "description": "Retrieve the user's current grocery/shopping list — all unchecked items.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_calendar",
            "description": (
                "Get upcoming events, bills, and tasks (CALENDAR section). Use for any "
                "'what's on my calendar / schedule / coming up' question."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Days ahead from today (default: 14). Ignored if date_range provided.",
                    },
                    "date_range": {
                        "type": "object",
                        "description": "Explicit ISO date range. Preferred over `days`.",
                        "properties": {
                            "from": {"type": "string", "description": "ISO YYYY-MM-DD start"},
                            "to": {"type": "string", "description": "ISO YYYY-MM-DD end"},
                        },
                    },
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
            "name": "create_goal",
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
            "name": "update_goal",
            "description": (
                "Update an existing goal's progress or fields (GOALS section). Use when the "
                "user says they saved toward a goal, added a contribution, or wants to change "
                "a goal's target/deadline. Pass the goal by `name` (fuzzy-matched)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Goal name (partial match ok). Preferred."},
                    "goal_name": {"type": "string", "description": "Alias for name (legacy)."},
                    "progress_amount": {"type": "number", "description": "Amount to add, subtract, or set."},
                    "amount": {"type": "number", "description": "Alias for progress_amount (legacy)."},
                    "action": {
                        "type": "string",
                        "enum": ["add", "subtract", "set"],
                        "description": "'add' (default) increments, 'subtract' decrements, 'set' replaces.",
                    },
                    "target_amount": {"type": "number", "description": "Optional: update the goal's total target."},
                    "deadline": {"type": "string", "description": "Optional: update target_date as ISO YYYY-MM-DD."},
                    "status": {
                        "type": "string",
                        "enum": ["active", "paused", "achieved", "abandoned"],
                        "description": "Optional: update goal status.",
                    },
                },
                "required": [],
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
    {
        "type": "function",
        "function": {
            "name": "set_notification_preferences",
            "description": (
                "Update the user's notification settings: default reminder time for new events, "
                "daily digest on/off, or daily digest time. Use when the user says things like "
                "'set my default reminder to 1 hour', 'turn off daily digest', 'send my morning "
                "summary at 7am', etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "default_reminder_minutes": {
                        "type": "integer",
                        "enum": [0, 10, 30, 60, 360, 1440],
                        "description": "Default reminder for new events: 0=none, 10/30/60/360/1440 minutes before",
                    },
                    "daily_digest_enabled": {
                        "type": "boolean",
                        "description": "Enable or disable the daily morning digest email",
                    },
                    "daily_digest_time": {
                        "type": "string",
                        "description": "Time to send daily digest as HH:MM (24h), e.g. '08:00', '07:30'",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_expense",
            "description": "Edit/update an existing expense. Use when user says 'change that to $55', 'recategorise that expense', 'fix that transaction'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expense_id": {"type": "string", "description": "The ID of the expense to edit"},
                    "amount": {"type": "number", "description": "New amount (optional)"},
                    "merchant": {"type": "string", "description": "New merchant name (optional)"},
                    "category": {"type": "string", "description": "New category (optional)"},
                    "date": {"type": "string", "description": "New date as YYYY-MM-DD (optional)"},
                },
                "required": ["expense_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_recurring_income",
            "description": "Track a recurring income source (salary, freelance, dividends, etc). Use when user mentions their income, salary, or earnings.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Income source name (e.g. 'Salary', 'Freelance Design')"},
                    "amount": {"type": "number", "description": "Amount per period in USD"},
                    "frequency": {
                        "type": "string",
                        "enum": ["monthly", "weekly", "biweekly", "yearly"],
                        "description": "How often this income is received",
                    },
                    "source": {"type": "string", "description": "Source description (e.g. 'Employer', 'Side gig')"},
                },
                "required": ["name", "amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_event",
            "description": "Edit/update a calendar event. Use when user says 'move that to 3pm', 'rename that event', 'change the meeting time'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string", "description": "The ID of the event to edit"},
                    "title": {"type": "string", "description": "New title (optional)"},
                    "date": {"type": "string", "description": "New date as YYYY-MM-DD (optional)"},
                    "time": {"type": "string", "description": "New time as HH:MM (optional)"},
                    "description": {"type": "string", "description": "New description (optional)"},
                },
                "required": ["event_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_task",
            "description": "Edit/update a task. Use when user says 'change that task', 'move the due date', 'make that high priority'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string", "description": "The ID of the task to edit"},
                    "title": {"type": "string", "description": "New title (optional)"},
                    "due_date": {"type": "string", "description": "New due date as YYYY-MM-DD (optional)"},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"], "description": "New priority (optional)"},
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_note",
            "description": "Delete a note by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {"type": "string", "description": "The ID of the note to delete"},
                },
                "required": ["note_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "Search through user's notes by keyword, tag, or mood. Returns matching notes with previews.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search keyword to match in title, content, or tags"},
                    "tag": {"type": "string", "description": "Filter by specific tag"},
                    "mood": {"type": "string", "description": "Filter by mood (happy, grateful, motivated, neutral, stressed, anxious, reflective)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_note",
            "description": "Edit an existing note — update title, content, tags, mood, or link it to a goal.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {"type": "string", "description": "The ID of the note to edit"},
                    "title": {"type": "string", "description": "New title"},
                    "content": {"type": "string", "description": "New content (Markdown supported)"},
                    "tags": {"type": "string", "description": "New comma-separated tags"},
                    "mood": {"type": "string", "description": "Mood (happy, grateful, motivated, neutral, stressed, anxious, reflective)"},
                    "linked_goal": {"type": "string", "description": "Goal name to link this note to"},
                    "is_pinned": {"type": "boolean", "description": "Pin or unpin the note"},
                },
                "required": ["note_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "pin_note",
            "description": "Pin or unpin a note so it stays at the top.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {"type": "string", "description": "The ID of the note to pin/unpin"},
                    "pin": {"type": "boolean", "description": "True to pin, false to unpin. Defaults to true."},
                },
                "required": ["note_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_bill",
            "description": "Cancel/delete a recurring bill or subscription by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bill_id": {"type": "string", "description": "The ID of the bill to cancel"},
                },
                "required": ["bill_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "split_expense",
            "description": "Split an expense with other people and log the user's share. Use when user says 'split dinner with Kirk', 'split the $100 with 3 people'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "Full amount before split"},
                    "merchant": {"type": "string", "description": "Merchant or description"},
                    "category": {"type": "string", "description": "Expense category"},
                    "split_with": {"type": "string", "description": "Name(s) of people splitting with"},
                    "split_count": {"type": "integer", "description": "Total number of people including user (default 2)"},
                    "date": {"type": "string", "description": "Date as YYYY-MM-DD (optional)"},
                },
                "required": ["amount", "merchant", "category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_spending_patterns",
            "description": "Analyse spending patterns and trends. Use when user asks about habits, trends, weekday vs weekend spending, month-over-month changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "months": {"type": "integer", "description": "Number of months to analyse (default 3)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_transactions",
            "description": "Search past transactions by keyword, date range, or category. Use when user asks 'find my Sushi Agato expense', 'show all uber rides', etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search keyword (matches merchant, description)"},
                    "date_from": {"type": "string", "description": "Start date as YYYY-MM-DD (optional)"},
                    "date_to": {"type": "string", "description": "End date as YYYY-MM-DD (optional)"},
                    "category": {"type": "string", "description": "Filter by category (optional)"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_expense",
            "description": "Delete/remove an expense by its ID. Use when user says 'undo that expense', 'remove that', or 'delete the expense I just added'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expense_id": {"type": "string", "description": "The ID of the expense to delete"},
                },
                "required": ["expense_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_event",
            "description": "Delete/remove a calendar event by its ID. Use when user says 'remove that event' or 'cancel that appointment'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string", "description": "The ID of the event to delete"},
                },
                "required": ["event_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Delete/remove a task by its ID. Use when user says 'remove that task' or 'delete the task I just added'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string", "description": "The ID of the task to delete"},
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_subscription_health",
            "description": (
                "Check which subscriptions may be unused — finds active recurring bills with no matching "
                "transaction in the last 90 days. Use when the user asks 'am I paying for anything I don't use?', "
                "'which subscriptions should I cancel?', 'find unused subscriptions', or similar."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mood_spending_report",
            "description": (
                "Analyse how spending varies by mood — correlates notes mood entries with transaction amounts "
                "on the same day. Use when the user asks 'does my mood affect my spending?', "
                "'do I spend more when stressed?', 'show me mood spending patterns', or similar."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_list",
            "description": (
                "Create a new named list, optionally pre-populated with items. "
                "Use when the user wants to create any kind of list "
                "(grocery list, packing list, to-do list, bucket list, shopping list, etc). "
                "ALWAYS include initial items here if the user mentions them — "
                "do NOT call add_list_items separately in the same turn."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name for the list (e.g. 'Grocery', 'Packing List', 'Books to Read')",
                    },
                    "color": {
                        "type": "string",
                        "description": (
                            "Hex color for the list. Pick one that fits the theme: "
                            "#ef4444 red, #f97316 orange, #eab308 yellow, #22c55e green, "
                            "#3b82f6 blue, #a855f7 purple, #ec4899 pink, #ffffff white"
                        ),
                    },
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional initial items to add to the list right away",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_list_items",
            "description": (
                "Add one or more items to an existing user list. Requires the list_id "
                "from create_list or get_user_lists."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "list_id": {
                        "type": "string",
                        "description": "ID of the list to add items to",
                    },
                    "items": {
                        "type": "array",
                        "description": "Item names to add to the list",
                        "items": {"type": "string"},
                    },
                },
                "required": ["list_id", "items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_lists",
            "description": (
                "Get all of the user's lists with their IDs, names, and item counts. "
                "Use to find a list_id before adding items to an existing list."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },

    # ─── Canonical 9-section READ/ANALYSIS tools (added in v3 rename) ────────
    {
        "type": "function",
        "function": {
            "name": "get_bills",
            "description": (
                "Retrieve recurring bills / subscriptions, optionally filtered by ISO "
                "date range. Use for any 'what bills are coming up / this month / next "
                "2 weeks' question."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_range": {
                        "type": "object",
                        "description": "ISO date range filter on next due date.",
                        "properties": {
                            "from": {"type": "string", "description": "ISO YYYY-MM-DD"},
                            "to": {"type": "string", "description": "ISO YYYY-MM-DD"},
                        },
                    },
                    "category": {"type": "string", "description": "Optional category filter."},
                    "status": {
                        "type": "string",
                        "enum": ["active", "inactive", "all"],
                        "description": "Default: active.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_expenses",
            "description": (
                "Retrieve logged expenses, optionally filtered by ISO date range, "
                "category, or merchant/text search."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_range": {
                        "type": "object",
                        "description": "ISO date range filter.",
                        "properties": {
                            "from": {"type": "string"},
                            "to": {"type": "string"},
                        },
                    },
                    "category": {"type": "string", "description": "Optional canonical category."},
                    "search": {"type": "string", "description": "Optional merchant/description text."},
                    "limit": {"type": "integer", "description": "Max rows (default 50)."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_notes",
            "description": (
                "Retrieve plain notes (NOT journal entries — those use get_journal). "
                "Supports text and tag filters."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "Optional free-text query."},
                    "tag": {"type": "string", "description": "Optional tag filter."},
                    "limit": {"type": "integer", "description": "Max rows (default 20)."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "log_journal_entry",
            "description": (
                "Log a dated JOURNAL entry with mood. Use for feelings / reflections / "
                "mood-tagged content. For neutral reference notes, use add_note instead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "ISO YYYY-MM-DD. Defaults to today."},
                    "content": {"type": "string", "description": "The journal body."},
                    "title": {"type": "string", "description": "Optional short title."},
                    "mood": {
                        "type": "string",
                        "enum": ["happy", "grateful", "motivated", "neutral",
                                 "stressed", "anxious", "reflective"],
                        "description": "Canonical mood (required).",
                    },
                    "tags": {"type": "string", "description": "Optional comma-separated tags."},
                },
                "required": ["content", "mood"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_journal",
            "description": (
                "Retrieve journal entries (mood-tagged notes), optionally filtered by "
                "ISO date range or specific mood."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_range": {
                        "type": "object",
                        "properties": {
                            "from": {"type": "string"},
                            "to": {"type": "string"},
                        },
                    },
                    "mood": {
                        "type": "string",
                        "enum": ["happy", "grateful", "motivated", "neutral",
                                 "stressed", "anxious", "reflective"],
                    },
                    "limit": {"type": "integer", "description": "Max rows (default 20)."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_insights",
            "description": (
                "Generate INSIGHTS — analytical summary of the user's real data across "
                "the specified sections and date range. Returns spending totals, top "
                "categories, budget status, and pattern observations. Never fabricate "
                "numbers; the tool pulls live data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "array",
                        "description": "Sections to analyse.",
                        "items": {
                            "type": "string",
                            "enum": ["expenses", "bills", "goals", "journal", "calendar"],
                        },
                    },
                    "date_range": {
                        "type": "object",
                        "properties": {
                            "from": {"type": "string"},
                            "to": {"type": "string"},
                        },
                    },
                    "focus": {
                        "type": "string",
                        "enum": ["spending", "saving", "trends", "anomalies",
                                 "progress", "mood", "general"],
                        "description": "Analysis angle (default: general).",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_forecast",
            "description": (
                "Generate a FORECAST — projected future financial state combining "
                "balance, recurring bills, active goals, and any assumptions. Use for "
                "'can I afford X next month' / 'how much will I have left' questions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "horizon_days": {"type": "integer", "description": "Days ahead (default 30)."},
                    "scope": {
                        "type": "array",
                        "description": "Sections to include in projection.",
                        "items": {
                            "type": "string",
                            "enum": ["expenses", "bills", "goals", "income"],
                        },
                    },
                    "scenario": {
                        "type": "string",
                        "enum": ["baseline", "optimistic", "pessimistic", "custom"],
                        "description": "Default: baseline.",
                    },
                    "assumptions": {
                        "type": "array",
                        "description": "One-line strings describing any one-off purchases or income events.",
                        "items": {"type": "string"},
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_yearly_summary",
            "description": (
                "Generate a YEARLY summary / year-in-review across spending, goals, "
                "and optionally journal/calendar for a specific calendar year."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer", "description": "4-digit year (required)."},
                    "sections": {
                        "type": "array",
                        "description": "Sections to include (default: expenses, bills, goals).",
                        "items": {
                            "type": "string",
                            "enum": ["expenses", "bills", "goals", "journal", "calendar"],
                        },
                    },
                },
                "required": ["year"],
            },
        },
    },

    # ─── Full-CRUD additions (v3.1) ──────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "edit_bill",
            "description": (
                "Edit an existing bill / subscription's fields. Resolve the bill_id "
                "first via get_bills if you only have a name. Only send the fields "
                "that actually change."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "bill_id": {"type": "string", "description": "ID of the bill (required)."},
                    "name": {"type": "string"},
                    "amount": {"type": "number"},
                    "frequency": {
                        "type": "string",
                        "enum": ["weekly", "bi-weekly", "monthly", "yearly"],
                    },
                    "due_date": {"type": "string", "description": "ISO YYYY-MM-DD for the next due date."},
                    "category": {"type": "string"},
                    "is_active": {"type": "boolean", "description": "Set false to pause the bill."},
                },
                "required": ["bill_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_goal",
            "description": (
                "Delete a goal. Prefer goal_id (resolve via get_goals). If only the "
                "name is known, pass it — the tool returns 'ambiguous' if multiple "
                "goals match so you can ask the user which one."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "goal_id": {"type": "string", "description": "Preferred: exact goal ID."},
                    "name": {"type": "string", "description": "Alternative: goal name (partial match ok)."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_journal_entry",
            "description": (
                "Edit an existing JOURNAL entry (mood-tagged). Resolve entry_id via "
                "get_journal first. Use edit_note for plain notes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "entry_id": {"type": "string", "description": "ID of the journal entry (required)."},
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "mood": {
                        "type": "string",
                        "enum": ["happy", "grateful", "motivated", "neutral",
                                 "stressed", "anxious", "reflective"],
                    },
                    "tags": {"type": "string"},
                },
                "required": ["entry_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_journal_entry",
            "description": (
                "Delete a journal entry by ID. Resolve the ID via get_journal first. "
                "Use delete_note for plain notes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "entry_id": {"type": "string", "description": "ID of the journal entry (required)."},
                },
                "required": ["entry_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_list",
            "description": (
                "Delete an entire user list AND all of its items. Resolve list_id via "
                "get_user_lists first. Irreversible — confirm in prose."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "list_id": {"type": "string", "description": "ID of the list (required)."},
                },
                "required": ["list_id"],
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
    return datetime.now(timezone.utc).isoformat()


def _uid() -> str:
    return str(uuid.uuid4())


# ── Write tools ───────────────────────────────────────────────────────────────

def _get_goal_impact_for_category(user_id: str, category: str, month: str) -> dict | None:
    """Return goal impact data if any active goal is linked to this expense category."""
    conn = get_connection()
    goals = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0 AND linked_budget_category=?",
        (user_id, category),
    ).fetchall()
    conn.close()
    if not goals:
        return None
    g = dict(goals[0])
    target = float(g["target_amount"])
    current = float(g["current_amount"])
    remaining = round(target - current, 2)
    pct = round((current / target * 100), 1) if target else 0
    monthly_needed = None
    months_left = None
    if g.get("target_date"):
        try:
            target_dt = datetime.strptime(g["target_date"], "%Y-%m-%d")
            months_left = max(1, round((target_dt - datetime.now()).days / 30))
            monthly_needed = round(remaining / months_left, 2)
        except Exception:
            pass
    return {
        "goal_name": g["name"],
        "pct_complete": pct,
        "remaining": round(remaining, 2),
        "monthly_needed": monthly_needed,
        "months_left": months_left,
        "target_date": g.get("target_date", ""),
    }


def _add_expense(args: dict, user_id: str) -> dict:
    date = args.get("date") or _today()
    import json as _json
    merchant = args.get("merchant") or args.get("description") or "Unknown"
    description = args.get("description") or args.get("merchant") or ""
    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": float(args["amount"]),
        "merchant": merchant,
        "description": description,
        "category": args.get("category", "Other"),
        "is_recurring": 0,
        "metadata": _json.dumps({"notes": args.get("notes", "")}),
    }
    insert_row("transactions", row)
    new_bal = adjust_balance(user_id, -row["amount"])
    month = date[:7]
    category = args.get("category", "Other")
    spent = _get_category_spending(user_id, category, month)
    budget = _get_category_budget(user_id, category, month)
    goal_impact = _get_goal_impact_for_category(user_id, category, month)
    return {
        "status": "ok",
        "id": row["id"],
        "amount": row["amount"],
        "merchant": row["merchant"],
        "category": row["category"],
        "date": date,
        "month_spent": spent,
        "month_budget": budget,
        "new_balance": round(new_bal, 2),
        "goal_impact": goal_impact,
    }


def _add_calendar_event(args: dict, user_id: str) -> dict:
    title = args["title"]
    start = args.get("start")
    if start:
        s = str(start).replace("T", " ")
        date, _, time = s.partition(" ")
        time = (time or "").strip()[:5]  # HH:MM
    else:
        date = args.get("date") or _today()
        time = args.get("time", "") or ""
    if args.get("all_day") is True:
        time = ""
    event_datetime = f"{date} {time}".strip()
    reminder = int(args.get("reminder_minutes", 30))

    conn = get_connection()
    user_row = conn.execute(
        "SELECT default_reminder_minutes FROM users WHERE id=?", (user_id,)
    ).fetchone()
    conn.close()
    if "reminder_minutes" not in args and user_row and user_row["default_reminder_minutes"] is not None:
        reminder = int(user_row["default_reminder_minutes"])

    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": title,
        "description": args.get("description", ""),
        "event_date": event_datetime,
        "event_type": args.get("event_type", "event"),
        "amount": 0,
        "is_recurring": 0,
        "reminder_minutes": reminder,
        "reminder_sent": 0,
        "created_at": _now_iso(),
    }
    insert_row("events", row)

    reminder_label = _reminder_label(reminder)
    return {
        "status": "ok", "id": row["id"], "title": title,
        "date": date, "time": time, "reminder": reminder_label,
    }


def _add_grocery_items(args: dict, user_id: str) -> dict:
    """Add items to the user's Grocery list.

    Routes through the `user_lists` / `list_items` tables that the in-app
    Lists tab actually reads from (a previous implementation wrote only to
    a legacy `grocery_items` table that no UI surfaced, so chat-added items
    appeared to vanish). We find-or-create a `user_lists` row named
    "Grocery" and append the items there. The legacy `grocery_items` table
    is kept in sync too so the marketing landing page's `/api/grocery`
    preview keeps working without redeploys.
    """
    raw_items = args.get("items", []) or []
    if not raw_items:
        return {"status": "ok", "added": [], "count_added": 0}

    now = _now_iso()

    # 1) Find-or-create the canonical "Grocery" user_list for this user.
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
        "ORDER BY created_at ASC LIMIT 1",
        (user_id,),
    ).fetchone()
    if existing:
        list_id = existing["id"] if isinstance(existing, dict) else existing[0]
        order_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) AS val FROM list_items WHERE list_id=?",
            (list_id,),
        ).fetchone()
        max_item_order = order_row["val"] if isinstance(order_row, dict) else order_row[0]
    else:
        list_order_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order),0) AS val FROM user_lists WHERE user_id=?",
            (user_id,),
        ).fetchone()
        max_list_order = list_order_row["val"] if isinstance(list_order_row, dict) else list_order_row[0]
        list_id = _uid()
        insert_row("user_lists", {
            "id": list_id,
            "user_id": user_id,
            "name": "Grocery",
            "icon": "",
            "color": "#22c55e",  # green — matches the grocery / food theme in the palette
            "sort_order": max_list_order + 1,
            "created_at": now,
        })
        max_item_order = 0
    conn.close()

    # 2) Insert each item into both the user_list (UI-visible) and the
    #    legacy grocery_items table (marketing-page preview).
    items_added: list[str] = []
    total_est = 0.0
    for i, item in enumerate(raw_items):
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        price = float(item.get("estimated_price", 0) or 0)
        total_est += price

        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": name,
            "notes": "",
            "is_checked": 0,
            "sort_order": max_item_order + 1 + i,
            "added_at": now,
        })
        insert_row("grocery_items", {
            "id": _uid(),
            "user_id": user_id,
            "name": name,
            "quantity": str(item.get("quantity", "1")),
            "estimated_price": price,
            "is_checked": 0,
            "added_at": now,
        })
        items_added.append(name)

    all_items = fetch_rows("list_items", {"list_id": list_id, "user_id": user_id, "is_checked": 0})
    return {
        "status": "ok",
        "list_id": list_id,
        "list_name": "Grocery",
        "added": items_added,
        "count_added": len(items_added),
        "total_list_count": len(all_items),
        "estimated_total_added": total_est,
    }


def _add_recurring_bill(args: dict, user_id: str) -> dict:
    name = args["name"]
    amount = float(args.get("amount", 0))
    frequency = args.get("frequency", "monthly")
    due_date_iso = args.get("due_date")  # preferred: ISO YYYY-MM-DD
    due_day = args.get("due_day")

    # Compute next due date
    now = datetime.now()
    if due_date_iso and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(due_date_iso)):
        next_due = str(due_date_iso)
    elif due_day and frequency == "monthly":
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
        "mood": args.get("mood", ""),
        "is_pinned": 1 if args.get("is_pinned") else 0,
        "linked_goal": args.get("linked_goal", ""),
        "linked_account": "",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    insert_row("notes", row)
    return {"status": "ok", "id": row["id"], "title": row["title"]}


def _search_notes(args: dict, user_id: str) -> dict:
    query = args.get("query", "").lower()
    tag = args.get("tag", "").lower()
    mood_filter = args.get("mood", "")
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM notes WHERE user_id=? ORDER BY is_pinned DESC, updated_at DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    results = []
    for r in [dict(r) for r in rows]:
        if query:
            searchable = f"{r.get('title','')} {r.get('content','')} {r.get('tags','')}".lower()
            if query not in searchable:
                continue
        if tag and tag not in (r.get("tags") or "").lower():
            continue
        if mood_filter and r.get("mood") != mood_filter:
            continue
        preview = (r.get("content") or "")[:200]
        results.append({
            "id": r["id"], "title": r["title"], "preview": preview,
            "tags": r.get("tags", ""), "mood": r.get("mood", ""),
            "is_pinned": bool(r.get("is_pinned")),
            "linked_goal": r.get("linked_goal", ""),
            "updated_at": r.get("updated_at", ""),
        })
    return {"status": "ok", "count": len(results), "notes": results[:20]}


def _edit_note(args: dict, user_id: str) -> dict:
    nid = args["note_id"]
    conn = get_connection()
    row = conn.execute("SELECT * FROM notes WHERE id=? AND user_id=?", (nid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Note not found."}
    updates = {"updated_at": _now_iso()}
    for field in ("title", "content", "tags", "mood", "linked_goal"):
        if field in args:
            updates[field] = args[field]
    if "is_pinned" in args:
        updates["is_pinned"] = 1 if args["is_pinned"] else 0
    update_row("notes", updates, {"id": nid})
    return {"status": "ok", "id": nid, "updated": list(updates.keys())}


def _pin_note(args: dict, user_id: str) -> dict:
    nid = args["note_id"]
    pin = 1 if args.get("pin", True) else 0
    conn = get_connection()
    row = conn.execute("SELECT id, title, is_pinned FROM notes WHERE id=? AND user_id=?", (nid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Note not found."}
    update_row("notes", {"is_pinned": pin, "updated_at": _now_iso()}, {"id": nid})
    action = "pinned" if pin else "unpinned"
    return {"status": "ok", "action": action, "title": row["title"]}


# ── Full-CRUD additions (edit_bill, delete_goal, journal edit/delete, delete_list) ──

def _edit_bill(args: dict, user_id: str) -> dict:
    """Edit an existing recurring bill / subscription."""
    bill_id = args.get("bill_id") or args.get("id")
    if not bill_id:
        return {"status": "error", "message": "bill_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM subscriptions WHERE id=? AND user_id=?",
        (bill_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Bill not found."}

    updates: dict = {}
    for k in ("name", "category", "frequency"):
        if args.get(k) is not None:
            updates[k] = args[k]
    if args.get("amount") is not None:
        try:
            updates["amount"] = float(args["amount"])
        except (TypeError, ValueError):
            pass
    if args.get("due_date"):
        updates["next_due"] = str(args["due_date"])
    if args.get("is_active") is not None:
        updates["is_active"] = 1 if args["is_active"] else 0

    if not updates:
        return {"status": "no_changes", "message": "Nothing to update."}
    update_row("subscriptions", updates, {"id": bill_id, "user_id": user_id})
    return {
        "status": "ok",
        "id": bill_id,
        "name": row["name"],
        "updated_fields": sorted(updates.keys()),
    }


def _delete_goal(args: dict, user_id: str) -> dict:
    """Delete a goal by id or fuzzy-matched name."""
    goal_id = args.get("goal_id") or args.get("id")
    name_hint = (args.get("name") or args.get("goal_name") or "").strip().lower()

    conn = get_connection()
    if goal_id:
        row = conn.execute(
            "SELECT id, name FROM goals WHERE id=? AND user_id=?",
            (goal_id, user_id),
        ).fetchone()
        matches = [row] if row else []
    elif name_hint:
        all_rows = conn.execute(
            "SELECT id, name FROM goals WHERE user_id=?",
            (user_id,),
        ).fetchall()
        matches = [r for r in all_rows if name_hint in r["name"].lower()]
    else:
        conn.close()
        return {"status": "error", "message": "Provide goal_id or name."}
    conn.close()

    if not matches:
        return {"status": "not_found", "message": "Goal not found."}
    if len(matches) > 1:
        return {
            "status": "ambiguous",
            "message": f"Multiple goals match '{name_hint}'. Ask the user which one.",
            "candidates": [{"id": r["id"], "name": r["name"]} for r in matches],
        }
    target = matches[0]
    delete_row("goals", {"id": target["id"], "user_id": user_id})
    return {"status": "ok", "deleted": target["name"], "id": target["id"]}


def _edit_journal_entry(args: dict, user_id: str) -> dict:
    """Edit an existing journal entry (a notes row with is_journal=1)."""
    entry_id = args.get("entry_id") or args.get("note_id") or args.get("id")
    if not entry_id:
        return {"status": "error", "message": "entry_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT id, is_journal FROM notes WHERE id=? AND user_id=?",
        (entry_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Journal entry not found."}
    d = dict(row) if not isinstance(row, dict) else row
    if not d.get("is_journal"):
        return {"status": "wrong_kind", "message": "That's a plain note — use edit_note."}
    # Delegate to _edit_note using its expected arg shape.
    delegated = {**args, "note_id": entry_id}
    result = _edit_note(delegated, user_id)
    if result.get("status") == "ok":
        result["kind"] = "journal"
    return result


def _delete_journal_entry(args: dict, user_id: str) -> dict:
    """Delete a journal entry (notes row with is_journal=1)."""
    entry_id = args.get("entry_id") or args.get("note_id") or args.get("id")
    if not entry_id:
        return {"status": "error", "message": "entry_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT id, title, is_journal FROM notes WHERE id=? AND user_id=?",
        (entry_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Journal entry not found."}
    d = dict(row) if not isinstance(row, dict) else row
    if not d.get("is_journal"):
        return {"status": "wrong_kind", "message": "That's a plain note — use delete_note."}
    delete_row("notes", {"id": entry_id, "user_id": user_id})
    return {"status": "ok", "deleted": d.get("title") or "journal entry", "id": entry_id}


def _delete_list(args: dict, user_id: str) -> dict:
    """Delete a user list and all its items."""
    list_id = args.get("list_id") or args.get("id")
    if not list_id:
        return {"status": "error", "message": "list_id is required."}
    conn = get_connection()
    row = conn.execute(
        "SELECT id, name FROM user_lists WHERE id=? AND user_id=?",
        (list_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return {"status": "not_found", "message": "List not found."}
    item_count_row = conn.execute(
        "SELECT COUNT(*) AS c FROM list_items WHERE list_id=? AND user_id=?",
        (list_id, user_id),
    ).fetchone()
    item_count = item_count_row["c"] if isinstance(item_count_row, dict) else item_count_row[0]
    conn.close()
    delete_row("list_items", {"list_id": list_id, "user_id": user_id})
    delete_row("user_lists", {"id": list_id, "user_id": user_id})
    name = row["name"] if not isinstance(row, dict) else row.get("name")
    return {"status": "ok", "deleted": name, "id": list_id, "items_removed": item_count}


def _set_budget(args: dict, user_id: str) -> dict:
    month = args.get("month") or _current_month()
    category = args["category"]
    amount = float(args["amount"])
    rollover = 1 if args.get("rollover") else 0
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM budget_categories WHERE user_id=? AND category=? AND month=?",
        (user_id, category, month),
    ).fetchone()
    conn.close()
    if existing:
        update_row("budget_categories", {"planned": amount, "rollover": rollover}, {"id": existing["id"]})
    else:
        insert_row("budget_categories", {
            "id": _uid(),
            "user_id": user_id,
            "category": category,
            "planned": amount,
            "month": month,
            "rollover": rollover,
            "created_at": _now_iso(),
        })
    spent = _get_category_spending(user_id, category, month)
    return {"status": "ok", "category": category, "planned": amount, "spent": spent, "month": month, "rollover": bool(rollover)}


def _check_grocery_item(args: dict, user_id: str) -> dict:
    """Mark a grocery item as checked. Reads the canonical "Grocery"
    user_list first (what the UI shows); falls back to the legacy
    grocery_items table if nothing matches there."""
    name = args["item_name"].lower()
    conn = get_connection()
    try:
        glist = conn.execute(
            "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
            "ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
        if glist:
            list_id = glist["id"] if isinstance(glist, dict) else glist[0]
            rows = conn.execute(
                "SELECT id, name FROM list_items "
                "WHERE list_id=? AND user_id=? AND is_checked=0",
                (list_id, user_id),
            ).fetchall()
            matched = next((r for r in rows if name in r["name"].lower()), None)
            if matched:
                conn.close()
                update_row("list_items", {"is_checked": 1}, {"id": matched["id"]})
                return {"status": "ok", "checked": matched["name"]}
        # Legacy fallback for pre-migration items.
        legacy_rows = conn.execute(
            "SELECT id, name FROM grocery_items WHERE user_id=? AND is_checked=0",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    matched = next((r for r in legacy_rows if name in r["name"].lower()), None)
    if matched:
        update_row("grocery_items", {"is_checked": 1}, {"id": matched["id"]})
        return {"status": "ok", "checked": matched["name"]}
    return {"status": "not_found", "searched": args["item_name"]}


def _get_grocery_list(args: dict, user_id: str) -> dict:
    """Return the unchecked grocery items as the user sees them in the Lists
    tab. Prefers the "Grocery" user_list; falls back to the legacy table."""
    conn = get_connection()
    try:
        glist = conn.execute(
            "SELECT id FROM user_lists WHERE user_id=? AND LOWER(name)='grocery' "
            "ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
        if glist:
            list_id = glist["id"] if isinstance(glist, dict) else glist[0]
            rows = conn.execute(
                "SELECT name FROM list_items "
                "WHERE list_id=? AND user_id=? AND is_checked=0 "
                "ORDER BY sort_order ASC",
                (list_id, user_id),
            ).fetchall()
            names = [r["name"] if isinstance(r, dict) else r[0] for r in rows]
            if names:
                return {"status": "ok", "items": names, "count": len(names)}
    finally:
        conn.close()
    items = fetch_rows("grocery_items", {"user_id": user_id, "is_checked": 0})
    names = [i["name"] for i in items]
    return {"status": "ok", "items": names, "count": len(names)}


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


# ── Balance tools ─────────────────────────────────────────────────────────────

def _set_balance(args: dict, user_id: str) -> dict:
    amount = float(args["amount"])
    update_balance(user_id, amount)
    return {
        "status": "ok",
        "balance": round(amount, 2),
    }


def _add_money(args: dict, user_id: str) -> dict:
    amount = float(args["amount"])
    date = args.get("date") or _today()
    description = args.get("description", "Income")
    import json as _json

    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": -amount,  # negative = income
        "merchant": description,
        "description": description,
        "category": "Income",
        "is_recurring": 0,
        "metadata": _json.dumps({"type": "deposit"}),
    }
    insert_row("transactions", row)

    new_bal = adjust_balance(user_id, amount)
    return {
        "status": "ok",
        "id": row["id"],
        "amount_added": round(amount, 2),
        "description": description,
        "date": date,
        "new_balance": round(new_bal, 2),
    }


def _get_balance(args: dict, user_id: str) -> dict:
    bal = get_balance(user_id)
    conn = get_connection()
    goals = conn.execute(
        "SELECT SUM(current_amount) as total FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchone()
    bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions "
        "WHERE user_id=? AND is_active=1 AND frequency='monthly'",
        (user_id,),
    ).fetchone()
    conn.close()
    goals_total = float(goals["total"] or 0) if goals else 0
    bills_total = float(bills["total"] or 0) if bills else 0
    free_to_spend = round(bal - goals_total, 2)
    return {
        "balance": round(bal, 2),
        "goals_earmarked": round(goals_total, 2),
        "monthly_bills": round(bills_total, 2),
        "free_to_spend": free_to_spend,
    }


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
    bal = get_balance(user_id)
    conn = get_connection()
    goals = conn.execute(
        "SELECT SUM(current_amount) as total FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchone()
    conn.close()
    goals_total = float(goals["total"] or 0) if goals else 0
    return {
        "net_worth": round(bal, 2),
        "balance": round(bal, 2),
        "goals_earmarked": round(goals_total, 2),
        "balance_after_goals": round(bal - goals_total, 2),
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
    return {"status": "ok", "days_ahead": days, "items": items, "count": len(items)}


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

def _reminder_label(minutes: int) -> str:
    """Human-readable label for a reminder_minutes value."""
    if minutes <= 0:
        return "none"
    if minutes < 60:
        return f"{minutes} min before"
    if minutes < 1440:
        return f"{minutes // 60} hour{'s' if minutes >= 120 else ''} before"
    return "1 day before"


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
    # Accept both canonical and legacy arg names.
    raw_name = args.get("name") or args.get("goal_name") or ""
    if not raw_name:
        return {"status": "error", "message": "Goal name is required."}
    goal_name = str(raw_name).lower()
    raw_amount = args.get("progress_amount")
    if raw_amount is None:
        raw_amount = args.get("amount", 0)
    amount = float(raw_amount or 0)
    action = args.get("action", "add")

    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchall()
    conn.close()

    matched = next((r for r in rows if goal_name in r["name"].lower()), None)
    if not matched:
        return {"status": "not_found", "searched": raw_name}

    if action == "set":
        new_amount = amount
    elif action == "subtract":
        new_amount = float(matched["current_amount"]) - amount
    else:
        new_amount = float(matched["current_amount"]) + amount

    new_amount = max(0, new_amount)
    target = float(matched["target_amount"])
    is_completed = 1 if new_amount >= target else 0
    new_amount = min(new_amount, target)

    updates: dict = {"current_amount": new_amount, "is_completed": is_completed}
    if args.get("target_amount") is not None:
        try:
            updates["target_amount"] = float(args["target_amount"])
        except (TypeError, ValueError):
            pass
    if args.get("deadline"):
        updates["target_date"] = str(args["deadline"])
    update_row("goals", updates, {"id": matched["id"]})

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

    return {"status": "ok", "goals": goals, "count": len(goals)}


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


def _set_notification_preferences(args: dict, user_id: str) -> dict:
    updates = {}
    messages = []
    if "default_reminder_minutes" in args:
        val = int(args["default_reminder_minutes"])
        updates["default_reminder_minutes"] = val
        messages.append(f"Default reminder set to {_reminder_label(val)}" if val > 0 else "Default reminders turned off")
    if "daily_digest_enabled" in args:
        val = 1 if args["daily_digest_enabled"] else 0
        updates["daily_digest_enabled"] = val
        messages.append("Daily digest enabled" if val else "Daily digest disabled")
    if "daily_digest_time" in args:
        val = args["daily_digest_time"].strip()
        updates["daily_digest_time"] = val
        messages.append(f"Daily digest time set to {val}")

    if not updates:
        return {"status": "no_changes", "message": "No preferences specified."}

    update_row("users", updates, {"id": user_id})
    return {"status": "ok", "changes": messages}


# ── Delete tools (for undo) ──────────────────────────────────────────────────

def _delete_expense(args: dict, user_id: str) -> dict:
    expense_id = args["expense_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, merchant, amount FROM transactions WHERE id=? AND user_id=?",
        (expense_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Expense not found."}
    amt = float(row["amount"])
    delete_row("transactions", {"id": expense_id, "user_id": user_id})
    if amt > 0:
        new_bal = adjust_balance(user_id, amt)  # refund expense
    elif amt < 0:
        new_bal = adjust_balance(user_id, amt)  # remove income
    else:
        new_bal = get_balance(user_id)
    return {"status": "ok", "deleted": row["merchant"], "amount": amt, "new_balance": round(new_bal, 2)}


def _delete_event(args: dict, user_id: str) -> dict:
    event_id = args["event_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, title FROM events WHERE id=? AND user_id=?",
        (event_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Event not found."}
    delete_row("events", {"id": event_id, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}


def _delete_task(args: dict, user_id: str) -> dict:
    task_id = args["task_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT id, title FROM action_items WHERE id=? AND user_id=?",
        (task_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Task not found."}
    delete_row("action_items", {"id": task_id, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}


def _edit_expense(args: dict, user_id: str) -> dict:
    eid = args["expense_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM transactions WHERE id=? AND user_id=?", (eid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Expense not found."}
    updates = {}
    if "amount" in args:
        updates["amount"] = float(args["amount"])
    if "merchant" in args:
        updates["merchant"] = args["merchant"]
        updates["description"] = args["merchant"]
    if "category" in args:
        updates["category"] = args["category"]
    if "date" in args:
        updates["date"] = args["date"]
    if not updates:
        return {"status": "no_changes", "message": "No fields to update."}
    old_amount = float(row["amount"])
    new_amount = updates.get("amount", old_amount)
    if old_amount > 0 and new_amount != old_amount:
        diff = old_amount - new_amount  # positive if amount decreased (refund), negative if increased
        adjust_balance(user_id, diff)
    update_row("transactions", updates, {"id": eid})
    new_bal = get_balance(user_id)
    return {"status": "ok", "id": eid, "updated": list(updates.keys()),
            "merchant": updates.get("merchant", row["merchant"]),
            "amount": updates.get("amount", row["amount"]),
            "new_balance": round(new_bal, 2)}


def _add_recurring_income(args: dict, user_id: str) -> dict:
    from db import get_recurring_income, get_total_monthly_income
    row = {
        "id": _uid(),
        "user_id": user_id,
        "name": args["name"],
        "amount": float(args["amount"]),
        "frequency": args.get("frequency", "monthly"),
        "source": args.get("source", ""),
        "next_date": "",
        "is_active": 1,
        "created_at": _now_iso(),
    }
    insert_row("recurring_income", row)
    total = get_total_monthly_income(user_id)
    return {"status": "ok", "id": row["id"], "name": row["name"],
            "amount": row["amount"], "frequency": row["frequency"],
            "total_monthly_income": round(total, 2)}


def _edit_event(args: dict, user_id: str) -> dict:
    eid = args["event_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM events WHERE id=? AND user_id=?", (eid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Event not found."}
    updates = {}
    new_date = args.get("date")
    new_time = args.get("time")
    if new_date or new_time:
        old_date_str = (row["event_date"] or "")[:10]
        old_time_str = (row["event_date"] or "")[11:16] if len(row["event_date"] or "") > 10 else ""
        d = new_date or old_date_str
        t = new_time or old_time_str
        updates["event_date"] = f"{d} {t}".strip()
    if "title" in args:
        updates["title"] = args["title"]
    if "description" in args:
        updates["description"] = args["description"]
    if not updates:
        return {"status": "no_changes"}
    update_row("events", updates, {"id": eid})
    return {"status": "ok", "id": eid, "updated": list(updates.keys()), "title": updates.get("title", row["title"])}


def _edit_task(args: dict, user_id: str) -> dict:
    tid = args["task_id"]
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM action_items WHERE id=? AND user_id=?", (tid, user_id)
    ).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Task not found."}
    updates = {"updated_at": _now_iso()}
    if "title" in args:
        updates["title"] = args["title"]
    if "due_date" in args:
        updates["due_date"] = args["due_date"]
    if "priority" in args:
        updates["priority"] = args["priority"]
    update_row("action_items", updates, {"id": tid})
    return {"status": "ok", "id": tid, "updated": list(updates.keys()), "title": updates.get("title", row["title"])}


def _delete_note(args: dict, user_id: str) -> dict:
    nid = args["note_id"]
    conn = get_connection()
    row = conn.execute("SELECT id, title FROM notes WHERE id=? AND user_id=?", (nid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Note not found."}
    delete_row("notes", {"id": nid, "user_id": user_id})
    return {"status": "ok", "deleted": row["title"]}


def _delete_bill(args: dict, user_id: str) -> dict:
    bid = args["bill_id"]
    conn = get_connection()
    row = conn.execute("SELECT id, name FROM subscriptions WHERE id=? AND user_id=?", (bid, user_id)).fetchone()
    conn.close()
    if not row:
        return {"status": "not_found", "message": "Bill not found."}
    update_row("subscriptions", {"is_active": 0}, {"id": bid})
    return {"status": "ok", "cancelled": row["name"]}


def _split_expense(args: dict, user_id: str) -> dict:
    total = float(args["amount"])
    split_count = int(args.get("split_count", 2))
    user_share = round(total / split_count, 2)
    date = args.get("date") or _today()
    import json as _json
    row = {
        "id": _uid(),
        "user_id": user_id,
        "date": date,
        "amount": user_share,
        "merchant": args.get("merchant", "Split expense"),
        "description": f"Split {split_count} ways with {args.get('split_with', 'others')}",
        "category": args.get("category", "Other"),
        "is_recurring": 0,
        "metadata": _json.dumps({
            "split": True, "full_amount": total,
            "split_count": split_count, "split_with": args.get("split_with", ""),
        }),
    }
    insert_row("transactions", row)
    new_bal = adjust_balance(user_id, -user_share)
    return {
        "status": "ok", "id": row["id"],
        "full_amount": total, "your_share": user_share,
        "split_count": split_count, "split_with": args.get("split_with", ""),
        "merchant": row["merchant"], "category": row["category"],
        "new_balance": round(new_bal, 2),
    }


def _get_spending_patterns(args: dict, user_id: str) -> dict:
    months_back = int(args.get("months", 3))
    now = datetime.now()
    start = (now - timedelta(days=months_back * 30)).strftime("%Y-%m-%d")
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM transactions WHERE user_id=? AND date>=? AND amount>0 ORDER BY date ASC",
        (user_id, start),
    ).fetchall()
    conn.close()

    weekday_total = 0.0
    weekend_total = 0.0
    weekday_count = 0
    weekend_count = 0
    monthly_totals: dict[str, float] = {}
    cat_totals: dict[str, float] = {}

    for r in rows:
        amt = float(r["amount"])
        try:
            d = datetime.strptime(r["date"], "%Y-%m-%d")
            if d.weekday() < 5:
                weekday_total += amt
                weekday_count += 1
            else:
                weekend_total += amt
                weekend_count += 1
            month_key = d.strftime("%Y-%m")
            monthly_totals[month_key] = monthly_totals.get(month_key, 0) + amt
        except ValueError:
            pass
        cat = r["category"] or "Other"
        cat_totals[cat] = cat_totals.get(cat, 0) + amt

    months_sorted = sorted(monthly_totals.keys())
    mom_changes = []
    for i in range(1, len(months_sorted)):
        prev = monthly_totals[months_sorted[i - 1]]
        curr = monthly_totals[months_sorted[i]]
        change = curr - prev
        pct = round(change / prev * 100, 1) if prev > 0 else 0
        mom_changes.append({"month": months_sorted[i], "change": round(change, 2), "pct": pct})

    biggest_cat_increase = None
    if len(months_sorted) >= 2:
        last_month = months_sorted[-1]
        prev_month = months_sorted[-2]
        last_by_cat: dict[str, float] = {}
        prev_by_cat: dict[str, float] = {}
        for r in rows:
            if r["date"][:7] == last_month:
                c = r["category"] or "Other"
                last_by_cat[c] = last_by_cat.get(c, 0) + float(r["amount"])
            elif r["date"][:7] == prev_month:
                c = r["category"] or "Other"
                prev_by_cat[c] = prev_by_cat.get(c, 0) + float(r["amount"])
        max_increase = 0
        for cat in last_by_cat:
            inc = last_by_cat[cat] - prev_by_cat.get(cat, 0)
            if inc > max_increase:
                max_increase = inc
                biggest_cat_increase = {"category": cat, "increase": round(inc, 2),
                                        "current": round(last_by_cat[cat], 2),
                                        "previous": round(prev_by_cat.get(cat, 0), 2)}

    return {
        "period_months": months_back,
        "total_transactions": len(rows),
        "weekday_avg": round(weekday_total / max(weekday_count, 1), 2),
        "weekend_avg": round(weekend_total / max(weekend_count, 1), 2),
        "weekday_total": round(weekday_total, 2),
        "weekend_total": round(weekend_total, 2),
        "monthly_totals": {k: round(v, 2) for k, v in monthly_totals.items()},
        "month_over_month": mom_changes,
        "biggest_category_increase": biggest_cat_increase,
        "top_categories": sorted(
            [{"category": k, "total": round(v, 2)} for k, v in cat_totals.items()],
            key=lambda x: -x["total"]
        )[:10],
    }


def _search_transactions(args: dict, user_id: str) -> dict:
    query = args.get("query", "").lower()
    date_from = args.get("date_from", "")
    date_to = args.get("date_to", "")
    category = args.get("category", "")

    conn = get_connection()
    sql = "SELECT * FROM transactions WHERE user_id=?"
    params: list = [user_id]
    if date_from:
        sql += " AND date>=?"
        params.append(date_from)
    if date_to:
        sql += " AND date<=?"
        params.append(date_to)
    if category:
        sql += " AND category=?"
        params.append(category)
    sql += " ORDER BY date DESC LIMIT 50"
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    results = []
    for r in rows:
        merchant = (r["merchant"] or "").lower()
        desc = (r["description"] or "").lower()
        if query and query not in merchant and query not in desc:
            continue
        results.append({
            "id": r["id"], "date": r["date"],
            "merchant": r["merchant"], "category": r["category"],
            "amount": float(r["amount"]),
        })

    return {"query": query, "results": results, "count": len(results)}


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

    bal = get_balance(user_id)
    from db import get_total_monthly_income
    monthly_income = get_total_monthly_income(user_id)

    conn = get_connection()
    expense_rows = conn.execute(
        "SELECT SUM(amount) as total FROM transactions WHERE user_id=? AND date LIKE ? AND amount>0",
        (user_id, f"{month}%"),
    ).fetchone()
    bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions WHERE user_id=? AND is_active=1 AND frequency='monthly'",
        (user_id,),
    ).fetchone()
    goals = conn.execute(
        "SELECT * FROM goals WHERE user_id=? AND is_completed=0",
        (user_id,),
    ).fetchall()
    conn.close()

    total_expenses = float(expense_rows["total"] or 0)
    monthly_bills = float(bills["total"] or 0)

    goals_total = 0.0
    goal_details = []
    for g in goals:
        current = float(g["current_amount"])
        goals_total += current
        goal_details.append({"name": g["name"], "saved": round(current, 2),
                             "target": float(g["target_amount"])})

    balance_after_goals = round(bal - goals_total, 2)

    return {
        "month": month,
        "balance": round(bal, 2),
        "monthly_income": round(monthly_income, 2),
        "monthly_bills_total": round(monthly_bills, 2),
        "goals_earmarked": round(goals_total, 2),
        "balance_after_goals": balance_after_goals,
        "spent_so_far": round(total_expenses, 2),
        "goal_breakdown": goal_details,
    }


# ── Subscription Health ────────────────────────────────────────────────────────

def _get_subscription_health(args: dict, user_id: str) -> dict:
    """Find active subscriptions with no matching transaction in the last 90 days."""
    ninety_days_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
    conn = get_connection()
    subs = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND is_active=1",
        (user_id,),
    ).fetchall()

    dormant = []
    healthy = []
    for sub in [dict(s) for s in subs]:
        name_fragment = sub["name"].lower()[:12]
        txn = conn.execute(
            "SELECT id FROM transactions WHERE user_id=? AND date>=? AND amount>0 AND LOWER(merchant) LIKE ?",
            (user_id, ninety_days_ago, f"%{name_fragment}%"),
        ).fetchone()
        if txn:
            healthy.append(sub["name"])
        else:
            freq = sub.get("frequency", "monthly")
            amt = float(sub.get("amount", 0))
            if freq == "yearly":
                monthly_cost = round(amt / 12, 2)
            elif freq == "weekly":
                monthly_cost = round(amt * 4.33, 2)
            elif freq == "bi-weekly":
                monthly_cost = round(amt * 2.17, 2)
            else:
                monthly_cost = amt
            dormant.append({
                "name": sub["name"],
                "amount": amt,
                "frequency": freq,
                "monthly_cost": monthly_cost,
                "next_due": sub.get("next_due", ""),
                "id": sub["id"],
            })

    conn.close()
    total_dormant_monthly = round(sum(d["monthly_cost"] for d in dormant), 2)
    return {
        "status": "ok",
        "dormant_subscriptions": dormant,
        "dormant_count": len(dormant),
        "dormant_monthly_cost": total_dormant_monthly,
        "dormant_annual_cost": round(total_dormant_monthly * 12, 2),
        "healthy_subscriptions": healthy,
        "healthy_count": len(healthy),
        "check_window_days": 90,
    }


# ── Mood × Spending Correlation ────────────────────────────────────────────────

def _get_mood_spending_report(args: dict, user_id: str) -> dict:
    """Correlate mood journal entries with spending on the same day (±1 day window)."""
    conn = get_connection()
    notes = conn.execute(
        "SELECT mood, created_at FROM notes WHERE user_id=? AND mood!='' AND mood IS NOT NULL",
        (user_id,),
    ).fetchall()

    if len(notes) < 3:
        conn.close()
        return {
            "status": "insufficient_data",
            "message": "Need at least 3 mood journal entries to generate a pattern.",
            "notes_with_mood": len(notes),
        }

    mood_buckets: dict[str, list[float]] = {}
    for note in notes:
        mood = note["mood"]
        note_date_str = (note["created_at"] or "")[:10]
        if not note_date_str:
            continue
        try:
            note_dt = datetime.strptime(note_date_str, "%Y-%m-%d")
        except ValueError:
            continue
        date_from = (note_dt - timedelta(days=1)).strftime("%Y-%m-%d")
        date_to = (note_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        row = conn.execute(
            "SELECT SUM(amount) as total FROM transactions "
            "WHERE user_id=? AND date>=? AND date<=? AND amount>0",
            (user_id, date_from, date_to),
        ).fetchone()
        day_spend = float(row["total"] or 0)
        mood_buckets.setdefault(mood, []).append(day_spend)

    conn.close()

    results = []
    for mood, amounts in mood_buckets.items():
        avg = round(sum(amounts) / len(amounts), 2) if amounts else 0
        results.append({
            "mood": mood,
            "avg_daily_spending": avg,
            "sample_size": len(amounts),
            "total_spending": round(sum(amounts), 2),
        })
    results.sort(key=lambda x: -x["avg_daily_spending"])

    highest = results[0] if results else None
    lowest = results[-1] if len(results) > 1 else None
    insight = ""
    if highest and lowest and highest["mood"] != lowest["mood"]:
        diff = round(highest["avg_daily_spending"] - lowest["avg_daily_spending"], 2)
        insight = (
            f"You spend ${diff:.0f}/day more when {highest['mood']} than when {lowest['mood']}. "
            f"On {highest['mood']} days: ${highest['avg_daily_spending']:.0f} avg. "
            f"On {lowest['mood']} days: ${lowest['avg_daily_spending']:.0f} avg."
        )

    return {
        "status": "ok",
        "mood_spending": results,
        "highest_spending_mood": highest,
        "lowest_spending_mood": lowest,
        "insight": insight,
        "total_mood_entries_analysed": len(notes),
    }


# ── User Lists ────────────────────────────────────────────────────────────────


def _create_list(args: dict, user_id: str) -> dict:
    name = args["name"]
    color = args.get("color", "#ffffff")
    initial_items = args.get("items", [])
    list_id = _uid()
    now = _now_iso()
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(MAX(sort_order),0) as val FROM user_lists WHERE user_id=?",
        (user_id,),
    ).fetchone()
    max_order = row["val"] if isinstance(row, dict) else row[0]
    conn.close()
    insert_row("user_lists", {
        "id": list_id,
        "user_id": user_id,
        "name": name,
        "icon": "",
        "color": color,
        "sort_order": max_order + 1,
        "created_at": now,
    })
    added = []
    for i, item_name in enumerate(initial_items):
        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": item_name,
            "notes": "",
            "is_checked": 0,
            "sort_order": i + 1,
            "added_at": now,
        })
        added.append(item_name)
    result = {"status": "ok", "id": list_id, "name": name, "color": color}
    if added:
        result["items_added"] = added
        result["item_count"] = len(added)
    return result


def _add_list_items(args: dict, user_id: str) -> dict:
    list_id = args["list_id"]
    items = args.get("items", [])
    added = []
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(MAX(sort_order),0) as val FROM list_items WHERE list_id=?",
        (list_id,),
    ).fetchone()
    max_order = row["val"] if isinstance(row, dict) else row[0]
    conn.close()
    for i, name in enumerate(items):
        insert_row("list_items", {
            "id": _uid(),
            "list_id": list_id,
            "user_id": user_id,
            "name": name,
            "notes": "",
            "is_checked": 0,
            "sort_order": max_order + 1 + i,
            "added_at": _now_iso(),
        })
        added.append(name)
    return {
        "status": "ok",
        "list_id": list_id,
        "added": added,
        "count_added": len(added),
    }


def _get_user_lists(args: dict, user_id: str) -> dict:
    conn = get_connection()
    lists = conn.execute(
        "SELECT * FROM user_lists WHERE user_id=? ORDER BY sort_order ASC, created_at ASC",
        (user_id,),
    ).fetchall()
    result = []
    for lst in lists:
        d = dict(lst)
        ic_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM list_items WHERE list_id=? AND is_checked=0",
            (d["id"],),
        ).fetchone()
        item_count = ic_row["cnt"] if isinstance(ic_row, dict) else ic_row[0]
        result.append({"id": d["id"], "name": d["name"], "item_count": item_count})
    conn.close()
    return {"status": "ok", "lists": result, "count": len(result)}


# ── Canonical READ/ANALYSIS wrappers (9-section prompt surface) ───────────────

def _get_bills(args: dict, user_id: str) -> dict:
    """Retrieve bills / subscriptions, optionally filtered by ISO date range."""
    status = (args.get("status") or "active").lower()
    date_range = args.get("date_range") or {}
    date_from = date_range.get("from")
    date_to = date_range.get("to")
    category = args.get("category")

    sql = "SELECT * FROM subscriptions WHERE user_id=?"
    params: list = [user_id]
    if status == "active":
        sql += " AND is_active=1"
    elif status == "inactive":
        sql += " AND is_active=0"
    if category:
        sql += " AND category=?"
        params.append(category)
    if date_from:
        sql += " AND next_due >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND next_due <= ?"
        params.append(date_to)
    sql += " ORDER BY next_due ASC"

    conn = get_connection()
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    bills = [dict(r) if not isinstance(r, dict) else r for r in rows]
    total = sum(float(b.get("amount") or 0) for b in bills)
    return {
        "status": "ok",
        "count": len(bills),
        "total": round(total, 2),
        "bills": bills,
    }


def _get_expenses(args: dict, user_id: str) -> dict:
    """Retrieve logged expenses with optional filters."""
    date_range = args.get("date_range") or {}
    date_from = date_range.get("from")
    date_to = date_range.get("to")
    category = args.get("category")
    search = (args.get("search") or "").strip()
    try:
        limit = int(args.get("limit") or 50)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 500))

    sql = "SELECT * FROM transactions WHERE user_id=?"
    params: list = [user_id]
    if date_from:
        sql += " AND date >= ?"
        params.append(date_from)
    if date_to:
        sql += " AND date <= ?"
        params.append(date_to)
    if category:
        sql += " AND category=?"
        params.append(category)
    if search:
        sql += " AND (LOWER(merchant) LIKE ? OR LOWER(description) LIKE ?)"
        params.extend([f"%{search.lower()}%", f"%{search.lower()}%"])
    sql += " ORDER BY date DESC, id DESC LIMIT ?"
    params.append(limit)

    conn = get_connection()
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    expenses = [dict(r) if not isinstance(r, dict) else r for r in rows]
    total = sum(float(e.get("amount") or 0) for e in expenses)
    return {
        "status": "ok",
        "count": len(expenses),
        "total": round(total, 2),
        "expenses": expenses,
    }


def _get_notes(args: dict, user_id: str) -> dict:
    """Retrieve plain notes (non-journal). Delegates to _search_notes for filtering."""
    if args.get("search") or args.get("tag"):
        return _search_notes(
            {"query": args.get("search"), "tag": args.get("tag"),
             "limit": args.get("limit", 20)},
            user_id,
        )
    try:
        limit = int(args.get("limit") or 20)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 200))
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM notes WHERE user_id=? AND (is_journal=0 OR is_journal IS NULL) "
        "ORDER BY is_pinned DESC, created_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()
    notes = [dict(r) if not isinstance(r, dict) else r for r in rows]
    return {"status": "ok", "count": len(notes), "notes": notes}


def _log_journal_entry(args: dict, user_id: str) -> dict:
    """Log a mood-tagged journal entry into the notes table with is_journal=1."""
    content = (args.get("content") or "").strip()
    mood = (args.get("mood") or "neutral").lower()
    if not content:
        return {"status": "error", "message": "Journal content is required."}
    title = args.get("title") or f"Journal — {args.get('date') or _today()}"
    tags = args.get("tags") or ""
    entry_date = args.get("date") or _today()
    row = {
        "id": _uid(),
        "user_id": user_id,
        "title": title,
        "content": content,
        "mood": mood,
        "tags": tags,
        "is_pinned": 0,
        "is_journal": 1,
        "entry_date": entry_date,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    insert_row("notes", row)
    return {
        "status": "ok",
        "id": row["id"],
        "mood": mood,
        "date": entry_date,
        "title": title,
    }


def _get_journal(args: dict, user_id: str) -> dict:
    """Retrieve journal (mood-tagged) entries with optional filters."""
    date_range = args.get("date_range") or {}
    date_from = date_range.get("from")
    date_to = date_range.get("to")
    mood = args.get("mood")
    try:
        limit = int(args.get("limit") or 20)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 200))

    sql = "SELECT * FROM notes WHERE user_id=? AND is_journal=1"
    params: list = [user_id]
    if date_from:
        sql += " AND (entry_date >= ? OR created_at >= ?)"
        params.extend([date_from, date_from])
    if date_to:
        sql += " AND (entry_date <= ? OR created_at <= ?)"
        params.extend([date_to, date_to])
    if mood:
        sql += " AND mood=?"
        params.append(mood)
    sql += " ORDER BY COALESCE(entry_date, created_at) DESC LIMIT ?"
    params.append(limit)

    conn = get_connection()
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    entries = [dict(r) if not isinstance(r, dict) else r for r in rows]
    return {"status": "ok", "count": len(entries), "entries": entries}


def _generate_insights(args: dict, user_id: str) -> dict:
    """Composite analytical view combining spending, budget, patterns, and goals."""
    scope = set(args.get("scope") or ["expenses", "bills", "goals"])
    focus = args.get("focus") or "general"
    date_range = args.get("date_range") or {}
    month = _current_month()
    if date_range.get("from"):
        month = str(date_range["from"])[:7]

    result: dict = {"status": "ok", "focus": focus, "scope": list(scope), "sections": {}}
    try:
        if "expenses" in scope:
            result["sections"]["spending_summary"] = _get_spending_summary(
                {"month": month}, user_id
            )
            result["sections"]["budget_status"] = _get_budget_status(
                {"month": month}, user_id
            )
            result["sections"]["patterns"] = _get_spending_patterns({}, user_id)
        if "bills" in scope:
            result["sections"]["subscription_health"] = _get_subscription_health(
                {}, user_id
            )
        if "goals" in scope:
            result["sections"]["goals"] = _get_goals({}, user_id)
            result["sections"]["money_left_after_goals"] = _get_money_left_after_goals(
                {}, user_id
            )
        if "journal" in scope:
            result["sections"]["mood_spending"] = _get_mood_spending_report({}, user_id)
    except Exception as e:  # pragma: no cover - defensive
        logger.error("generate_insights partial failure: %s", e)
        result["partial_error"] = str(e)
    return result


def _generate_forecast(args: dict, user_id: str) -> dict:
    """Forward-looking projection blending balance, bills, and goal targets."""
    try:
        horizon = int(args.get("horizon_days") or 30)
    except (TypeError, ValueError):
        horizon = 30
    horizon = max(7, min(horizon, 365))
    scope = set(args.get("scope") or ["expenses", "bills", "goals"])
    scenario = args.get("scenario") or "baseline"
    assumptions = args.get("assumptions") or []

    balance = _get_balance({}, user_id)
    upcoming = _get_upcoming_schedule({"days": horizon}, user_id)
    goals_info = _get_money_left_after_goals({}, user_id) if "goals" in scope else None

    scheduled_bill_total = 0.0
    try:
        items_iter = (upcoming or {}).get("items", []) if isinstance(upcoming, dict) else []
        for item in items_iter:
            if item.get("type") == "bill":
                scheduled_bill_total += float(item.get("amount") or 0)
    except Exception:
        pass

    current = float((balance or {}).get("balance", 0) or 0)
    projected = current - scheduled_bill_total
    if scenario == "pessimistic":
        projected -= 0.10 * max(scheduled_bill_total, 0)
    elif scenario == "optimistic":
        projected += 0.10 * max(scheduled_bill_total, 0)

    return {
        "status": "ok",
        "horizon_days": horizon,
        "scenario": scenario,
        "scope": list(scope),
        "assumptions": list(assumptions),
        "current_balance": round(current, 2),
        "scheduled_outflows": round(scheduled_bill_total, 2),
        "projected_balance": round(projected, 2),
        "upcoming": upcoming,
        "goal_impact": goals_info,
    }


def _generate_yearly_summary(args: dict, user_id: str) -> dict:
    """Year-in-review across selected sections."""
    try:
        year = int(args["year"])
    except (KeyError, TypeError, ValueError):
        return {"status": "error", "message": "year (4-digit integer) is required."}
    sections = set(args.get("sections") or ["expenses", "bills", "goals"])
    date_from = f"{year}-01-01"
    date_to = f"{year}-12-31"

    summary: dict = {"status": "ok", "year": year, "sections": {}}
    if "expenses" in sections:
        summary["sections"]["expenses"] = _get_expenses(
            {"date_range": {"from": date_from, "to": date_to}, "limit": 500}, user_id
        )
    if "bills" in sections:
        summary["sections"]["bills"] = _get_bills(
            {"date_range": {"from": date_from, "to": date_to}, "status": "all"}, user_id
        )
    if "goals" in sections:
        summary["sections"]["goals"] = _get_goals({"include_completed": True}, user_id)
    if "journal" in sections:
        summary["sections"]["journal"] = _get_journal(
            {"date_range": {"from": date_from, "to": date_to}, "limit": 200}, user_id
        )
    if "calendar" in sections:
        summary["sections"]["calendar"] = _get_upcoming_schedule({"days": 365}, user_id)
    return summary


# ── Dispatcher ────────────────────────────────────────────────────────────────
#
# _TOOL_MAP contains every backing function keyed by BOTH the canonical 16-tool
# names (the prompt surface Grok is taught about) and legacy aliases that still
# ship in TOOL_SCHEMAS or might arrive in stale tool-call histories. Adding an
# alias here is free — we only *advertise* the 16 canonical names to Grok via
# the updated system prompt, but the dispatcher still honours legacy names so
# historical conversations and extra orphan tools keep working.

_TOOL_MAP = {
    # Canonical 16 — Bills
    "log_bill": _add_recurring_bill,
    "get_bills": _get_bills,
    # Canonical 16 — Expenses
    "log_expense": _add_expense,
    "get_expenses": _get_expenses,
    # Canonical 16 — Calendar
    "add_calendar_event": _add_calendar_event,
    "get_calendar": _get_upcoming_schedule,
    # Canonical 16 — Notes
    "add_note": _add_note,
    "get_notes": _get_notes,
    # Canonical 16 — Journal
    "log_journal_entry": _log_journal_entry,
    "get_journal": _get_journal,
    # Canonical 16 — Goals
    "create_goal": _add_goal,
    "update_goal": _update_goal_progress,
    "get_goals": _get_goals,
    # Canonical 16 — Analytical
    "generate_insights": _generate_insights,
    "generate_forecast": _generate_forecast,
    "generate_yearly_summary": _generate_yearly_summary,

    # Full-CRUD additions (v3.1)
    "edit_bill": _edit_bill,
    "delete_goal": _delete_goal,
    "edit_journal_entry": _edit_journal_entry,
    "delete_journal_entry": _delete_journal_entry,
    "delete_list": _delete_list,

    # Legacy aliases (kept for back-compat with historical tool calls)
    "add_expense": _add_expense,
    "add_recurring_bill": _add_recurring_bill,
    "add_goal": _add_goal,
    "update_goal_progress": _update_goal_progress,
    "get_upcoming_schedule": _get_upcoming_schedule,

    # Orphan tools — still registered, still dispatchable
    "set_balance": _set_balance,
    "add_money": _add_money,
    "get_balance": _get_balance,
    "add_grocery_items": _add_grocery_items,
    "add_task": _add_task,
    "search_notes": _search_notes,
    "edit_note": _edit_note,
    "pin_note": _pin_note,
    "set_budget": _set_budget,
    "check_grocery_item": _check_grocery_item,
    "get_grocery_list": _get_grocery_list,
    "complete_task": _complete_task,
    "get_spending_summary": _get_spending_summary,
    "get_net_worth": _get_net_worth,
    "get_budget_status": _get_budget_status,
    "get_spending_recap": _get_spending_recap,
    "add_custom_category": _add_custom_category,
    "get_money_left_after_goals": _get_money_left_after_goals,
    "set_notification_preferences": _set_notification_preferences,
    "delete_expense": _delete_expense,
    "delete_event": _delete_event,
    "delete_task": _delete_task,
    "edit_expense": _edit_expense,
    "add_recurring_income": _add_recurring_income,
    "edit_event": _edit_event,
    "edit_task": _edit_task,
    "delete_note": _delete_note,
    "delete_bill": _delete_bill,
    "split_expense": _split_expense,
    "get_spending_patterns": _get_spending_patterns,
    "search_transactions": _search_transactions,
    "get_subscription_health": _get_subscription_health,
    "get_mood_spending_report": _get_mood_spending_report,
    "create_list": _create_list,
    "add_list_items": _add_list_items,
    "get_user_lists": _get_user_lists,
}

_TAB_REFRESH_MAP = {
    # Canonical 16
    "log_bill": ["schedule", "forecast"],
    "get_bills": [],
    "log_expense": ["dashboard", "budget"],
    "get_expenses": [],
    "add_calendar_event": ["dashboard", "schedule"],
    "get_calendar": [],
    "add_note": ["notes"],
    "get_notes": [],
    "log_journal_entry": ["notes", "journal"],
    "get_journal": [],
    "create_goal": ["dashboard", "goals"],
    "update_goal": ["dashboard", "goals"],
    "get_goals": [],
    "generate_insights": ["insights"],
    "generate_forecast": ["forecast"],
    "generate_yearly_summary": ["yearly"],

    # Full-CRUD additions
    "edit_bill": ["schedule", "forecast"],
    "delete_goal": ["dashboard", "goals"],
    "edit_journal_entry": ["notes", "journal"],
    "delete_journal_entry": ["notes", "journal"],
    "delete_list": ["lists"],

    # Legacy aliases
    "add_expense": ["dashboard", "budget"],
    "add_recurring_bill": ["schedule", "forecast"],
    "add_goal": ["dashboard", "goals"],
    "update_goal_progress": ["dashboard", "goals"],
    "get_upcoming_schedule": [],

    # Orphan tools
    "set_balance": ["dashboard", "forecast"],
    "add_money": ["dashboard", "budget", "forecast"],
    "get_balance": [],
    "set_budget": ["dashboard", "budget"],
    "add_grocery_items": ["lists", "dashboard"],
    "check_grocery_item": ["lists"],
    "get_grocery_list": [],
    "add_task": ["schedule"],
    "complete_task": ["schedule"],
    "search_notes": [],
    "edit_note": ["notes"],
    "pin_note": ["notes"],
    "get_spending_summary": [],
    "get_net_worth": [],
    "get_budget_status": [],
    "get_spending_recap": [],
    "add_custom_category": ["budget"],
    "get_money_left_after_goals": [],
    "set_notification_preferences": [],
    "delete_expense": ["dashboard", "budget"],
    "delete_event": ["dashboard", "schedule"],
    "delete_task": ["schedule"],
    "edit_expense": ["dashboard", "budget"],
    "add_recurring_income": ["dashboard", "budget", "forecast"],
    "edit_event": ["dashboard", "schedule"],
    "edit_task": ["schedule"],
    "delete_note": ["notes"],
    "delete_bill": ["schedule", "forecast"],
    "split_expense": ["dashboard", "budget"],
    "get_spending_patterns": [],
    "search_transactions": [],
    "get_subscription_health": [],
    "get_mood_spending_report": [],
    "create_list": ["lists"],
    "add_list_items": ["lists"],
    "get_user_lists": [],
}


# ─────────────────────────────────────────────────────────────────────────────
# PRE-DISPATCH ARGUMENT NORMALISER
# Snaps loosely-formatted Grok arguments onto canonical shapes before the
# tool function runs. Catches the common failure modes where Grok picks the
# right tool but passes slightly-off args (non-ISO dates, loose category
# names, negative amounts, alias frequencies, out-of-taxonomy moods).
# Safe to run on every tool call — unknown keys are passed through untouched.
# ─────────────────────────────────────────────────────────────────────────────

_CANONICAL_CATEGORIES = [
    "Food & Dining", "Groceries", "Transport", "Subscriptions",
    "Health & Fitness", "Shopping", "Rent & Housing", "Travel", "Other",
]

_CANONICAL_MOODS = [
    "happy", "grateful", "motivated", "neutral",
    "stressed", "anxious", "reflective",
]

_MOOD_ALIASES = {
    "sad": "reflective", "down": "reflective", "overwhelmed": "stressed",
    "worried": "anxious", "nervous": "anxious", "tense": "stressed",
    "excited": "happy", "joyful": "happy", "thankful": "grateful",
    "proud": "motivated", "inspired": "motivated", "driven": "motivated",
    "flat": "neutral", "meh": "neutral", "okay": "neutral", "ok": "neutral",
}

_CANONICAL_FREQS = {"weekly", "bi-weekly", "monthly", "yearly"}
_FREQ_ALIASES = {
    "biweekly": "bi-weekly", "bi weekly": "bi-weekly", "fortnightly": "bi-weekly",
    "annual": "yearly", "annually": "yearly", "per year": "yearly", "year": "yearly",
    "per month": "monthly", "every month": "monthly", "month": "monthly",
    "per week": "weekly", "every week": "weekly", "week": "weekly",
    "once a year": "yearly", "once a week": "weekly",
    "daily": "weekly",  # fallback — no 'daily' enum, closest bucket
}

# Date-only fields (strip any accidental time component).
_DATE_ONLY_FIELDS = {"date", "due_date", "deadline", "target_date", "paid_on"}
# Fields that may legitimately carry a time component.
_DATETIME_FIELDS = {"start", "end"}
_DATE_FIELDS = _DATE_ONLY_FIELDS | _DATETIME_FIELDS
_RANGE_FIELDS = {"date_range"}
_AMOUNT_FIELDS = {"amount", "target_amount", "progress_amount", "current_amount"}
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ISO_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?")


_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
    "mon": 0, "tue": 1, "tues": 1, "wed": 2, "thu": 3, "thur": 3,
    "thurs": 3, "fri": 4, "sat": 5, "sun": 6,
}


def _natural_date_fallback(s: str, now: datetime) -> datetime | None:
    """Handle phrases dateparser chokes on ('next friday', 'end of year', etc.)."""
    v = s.lower().strip()
    if v in ("end of year", "end of the year", "year end", "eoy"):
        return now.replace(month=12, day=31)
    if v in ("end of month", "end of the month", "eom"):
        next_month = now.replace(day=28) + timedelta(days=4)
        return next_month - timedelta(days=next_month.day)
    if v in ("end of week", "end of the week", "eow"):
        return now + timedelta(days=(6 - now.weekday()))
    m = re.match(r"^(next|this|upcoming)\s+([a-z]+)$", v)
    if m:
        target = _WEEKDAYS.get(m.group(2))
        if target is not None:
            delta = (target - now.weekday()) % 7
            if delta == 0 or m.group(1) == "next":
                delta = delta or 7
            return now + timedelta(days=delta)
    m = re.match(r"^in\s+(\d+)\s+(day|days|week|weeks|month|months)$", v)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit.startswith("day"):
            return now + timedelta(days=n)
        if unit.startswith("week"):
            return now + timedelta(weeks=n)
        if unit.startswith("month"):
            return now + timedelta(days=30 * n)
    return None


def _to_iso_date(value):
    """Coerce a loose date string to YYYY-MM-DD. Leaves datetimes intact."""
    if value is None or value == "":
        return value
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    s = str(value).strip()
    if _ISO_DATE_RE.match(s) or _ISO_DATETIME_RE.match(s):
        return s
    now = datetime.now()
    if _dateparser is not None:
        parsed = _dateparser.parse(
            s,
            settings={"PREFER_DATES_FROM": "future", "RELATIVE_BASE": now},
        )
        if parsed:
            if parsed.hour or parsed.minute:
                return parsed.strftime("%Y-%m-%dT%H:%M:%S")
            return parsed.strftime("%Y-%m-%d")
    # Custom fallback for phrases dateparser can't handle.
    fallback = _natural_date_fallback(s, now)
    if fallback is not None:
        return fallback.strftime("%Y-%m-%d")
    return value  # let tool-level validation handle truly malformed input


def _normalize_category(value):
    if not value:
        return "Other"
    s = str(value).strip()
    # Exact-match short-circuit (case-insensitive).
    for canon in _CANONICAL_CATEGORIES:
        if s.lower() == canon.lower():
            return canon
    match = get_close_matches(s, _CANONICAL_CATEGORIES, n=1, cutoff=0.6)
    return match[0] if match else "Other"


def _normalize_mood(value):
    if not value:
        return "neutral"
    v = str(value).lower().strip()
    if v in _CANONICAL_MOODS:
        return v
    if v in _MOOD_ALIASES:
        return _MOOD_ALIASES[v]
    match = get_close_matches(v, _CANONICAL_MOODS, n=1, cutoff=0.6)
    return match[0] if match else "neutral"


def _normalize_frequency(value):
    if not value:
        return value
    v = str(value).lower().strip()
    if v in _CANONICAL_FREQS:
        return v
    return _FREQ_ALIASES.get(v, v)


def _normalize_amount(value):
    if value is None or value == "":
        return value
    try:
        n = float(value)
        return abs(round(n, 2))
    except (TypeError, ValueError):
        return value


def normalize_args(tool_name: str, args: dict) -> dict:
    """Return a copy of args with canonical shapes applied.

    Dates   -> ISO YYYY-MM-DD (or YYYY-MM-DDTHH:MM:SS if time present)
    Ranges  -> {"from": <iso>, "to": <iso>}
    Amounts -> positive float, 2 decimals
    category / mood / frequency -> snapped to the canonical taxonomy
    Unknown keys pass through untouched.
    """
    if not isinstance(args, dict):
        return args
    out: dict = {}
    for k, v in args.items():
        if k in _DATE_ONLY_FIELDS:
            coerced = _to_iso_date(v)
            if isinstance(coerced, str) and "T" in coerced:
                coerced = coerced.split("T", 1)[0]
            out[k] = coerced
        elif k in _DATETIME_FIELDS:
            out[k] = _to_iso_date(v)
        elif k in _RANGE_FIELDS and isinstance(v, dict):
            fr = _to_iso_date(v.get("from"))
            to = _to_iso_date(v.get("to"))
            if isinstance(fr, str) and "T" in fr:
                fr = fr.split("T", 1)[0]
            if isinstance(to, str) and "T" in to:
                to = to.split("T", 1)[0]
            out[k] = {"from": fr, "to": to}
        elif k in _AMOUNT_FIELDS:
            out[k] = _normalize_amount(v)
        elif k == "category":
            out[k] = _normalize_category(v)
        elif k == "mood":
            out[k] = _normalize_mood(v)
        elif k == "frequency":
            out[k] = _normalize_frequency(v)
        else:
            out[k] = v
    return out


def execute_tool(tool_name: str, args: dict, user_id: str) -> tuple[dict, list[str]]:
    """
    Execute a tool by name with the given args for user_id.
    Arguments are normalised in-place (dates -> ISO, amounts -> positive float,
    category / mood / frequency snapped to canonical taxonomy) before dispatch.
    Returns (result_dict, tabs_to_refresh).
    """
    fn = _TOOL_MAP.get(tool_name)
    if fn is None:
        return {"error": f"Unknown tool: {tool_name}"}, []
    try:
        args = normalize_args(tool_name, args or {})
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

    # ── Balance account ─────────────────────────────────────────────────────
    insert_row("accounts", {
        "id": _uid(), "user_id": user_id, "name": "Balance",
        "type": "checking", "institution": "", "balance": 5500.00,
        "currency": "USD", "last_updated": today, "metadata": "",
    })

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
