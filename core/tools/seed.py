"""Demo data seeder for new users."""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from difflib import get_close_matches

try:
    import dateparser as _dateparser
except Exception:
    _dateparser = None

from db import (
    delete_row, fetch_rows, get_connection, insert_row, update_row,
    get_balance, adjust_balance, update_balance, get_or_create_balance_account,
)

logger = logging.getLogger(__name__)

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
