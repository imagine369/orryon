"""OpenAI-compatible tool schemas sent to Grok."""
from __future__ import annotations

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
                            "enum": ["expenses", "bills", "goals", "journal", "calendar", "wellness"],
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
    {
        "type": "function",
        "function": {
            "name": "get_wellness_history",
            "description": (
                "Retrieve the user's wellness history: reset/anchor session completions, "
                "mood trends (pre vs post), durations, and streak data. Use when the user "
                "asks 'how has my meditation been going', 'show my reset history', "
                "'compare my moods this week vs last', etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "Start date (YYYY-MM-DD). Defaults to 30 days ago."},
                    "date_to": {"type": "string", "description": "End date (YYYY-MM-DD). Defaults to today."},
                    "anchor_id": {"type": "string", "description": "Optional: filter by a specific anchor/reset type."},
                    "include_streaks": {"type": "boolean", "description": "Also return streak stats. Defaults true."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_periods",
            "description": (
                "Compare data across two time periods for spending, wellness, journal moods, "
                "or streaks. Use when the user asks things like 'how did last month compare "
                "to this month', 'am I spending more than before', 'has my mood improved', etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": ["spending", "wellness", "journal_mood", "streaks"],
                        "description": "What to compare.",
                    },
                    "period_a_from": {"type": "string", "description": "Start of period A (YYYY-MM-DD)."},
                    "period_a_to": {"type": "string", "description": "End of period A (YYYY-MM-DD)."},
                    "period_b_from": {"type": "string", "description": "Start of period B (YYYY-MM-DD)."},
                    "period_b_to": {"type": "string", "description": "End of period B (YYYY-MM-DD)."},
                    "category": {"type": "string", "description": "Optional: filter spending by category."},
                },
                "required": ["scope", "period_a_from", "period_a_to", "period_b_from", "period_b_to"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cross_feature_search",
            "description": (
                "Search across multiple features at once: journal entries, notes, transactions, "
                "events, lists, and goals. Use when the user asks a broad question like "
                "'what do I know about Edward', 'everything related to Japan trip', "
                "'find anything about groceries', etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search term or phrase."},
                    "features": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["journal", "notes", "transactions", "events", "lists", "goals"]},
                        "description": "Which features to search. Defaults to all.",
                    },
                    "limit": {"type": "integer", "description": "Max results per feature. Default 10."},
                },
                "required": ["query"],
            },
        },
    },
]
