"""
tools.py — Custom LangChain tools for every guddd agent domain.

Each tool is a @tool-decorated function that accepts a JSON string (or plain
text) and returns a JSON string.  Agents call these to read/write real data.

Tool groups
───────────
  DATA AGGREGATOR  : fetch_bank_accounts, fetch_transactions,
                     fetch_stock_quote, fetch_crypto_price, load_sample_data
  NET WORTH        : calculate_net_worth, update_account_balance,
                     get_portfolio_performance
  BUDGET           : get_spending_by_category, detect_subscriptions,
                     categorize_transaction
  FORECASTING      : forecast_cash_flow, run_monte_carlo_retirement,
                     simulate_scenario, project_savings_goal
  INSIGHTS         : detect_anomalies, get_financial_recommendations,
                     analyze_spending_trends
  SCHEDULING       : create_calendar_event, list_upcoming_events,
                     add_bill_reminder
  NOTES            : save_note, search_notes, summarize_notes
  REPORTING        : generate_csv_report, get_debt_payoff_plan

Adding a new tool:
  1. Write a function decorated with @tool("Name") here.
  2. Add it to the relevant agent's tools list in agents.py.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from langchain_core.tools import tool

from config import (
    DB_PATH,
    GOOGLE_CALENDAR_CREDENTIALS,
    GOOGLE_CALENDAR_ID,
    GOOGLE_CALENDAR_TOKEN,
    ICS_CALENDAR_PATH,
    NOTES_DIR,
    PLAID_ACCESS_TOKEN,
    PLAID_CLIENT_ID,
    PLAID_ENABLED,
    PLAID_ENV,
    PLAID_SECRET,
    POLYGON_API_KEY,
    USE_GOOGLE_CALENDAR,
    USE_POLYGON,
    USER_ID,
)
from db import fetch_rows, get_connection, insert_row, update_row

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _parse(raw: str) -> dict:
    """Parse a JSON string, returning empty dict on failure."""
    if raw and raw.strip().startswith("{"):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
    return {}


def _ok(data: dict) -> str:
    return json.dumps(data)


def _err(msg: str) -> str:
    return json.dumps({"error": msg})


# ─────────────────────────────────────────────────────────────────────────────
# DATA AGGREGATOR TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@tool("fetch_bank_accounts")
def fetch_bank_accounts(input: str = "") -> str:
    """
    Fetch bank, savings, investment, credit, and loan accounts.
    Uses Plaid when credentials are configured, otherwise returns data from the
    local SQLite database.

    Input (optional JSON): {"user_id": "..."}
    Returns: {"accounts": [...], "count": N}
    """
    try:
        params = _parse(input)
        user_id = params.get("user_id", USER_ID)

        if PLAID_ENABLED:
            result = _plaid_accounts(user_id)
            if result:
                return result

        accounts = fetch_rows("accounts", {"user_id": user_id})
        return _ok({"accounts": accounts, "count": len(accounts)})
    except Exception as exc:
        return _err(str(exc))


def _plaid_accounts(user_id: str) -> Optional[str]:
    try:
        from plaid import ApiClient, Configuration, Environment
        from plaid.api import plaid_api
        from plaid.model.accounts_get_request import AccountsGetRequest

        env_map = {
            "sandbox": Environment.Sandbox,
            "development": Environment.Development,
            "production": Environment.Production,
        }
        cfg = Configuration(
            host=env_map.get(PLAID_ENV, Environment.Sandbox),
            api_key={"clientId": PLAID_CLIENT_ID, "secret": PLAID_SECRET},
        )
        with ApiClient(cfg) as client:
            api = plaid_api.PlaidApi(client)
            resp = api.accounts_get(AccountsGetRequest(access_token=PLAID_ACCESS_TOKEN))

        accounts = []
        for acc in resp.accounts:
            row = {
                "id": acc.account_id,
                "user_id": user_id,
                "name": acc.name,
                "type": str(acc.type),
                "institution": "Plaid",
                "balance": acc.balances.current or 0,
                "currency": acc.balances.iso_currency_code or "USD",
                "last_updated": datetime.now().isoformat(),
            }
            accounts.append(row)
            insert_row("accounts", row)

        return _ok({"accounts": accounts, "count": len(accounts), "source": "plaid"})
    except Exception as exc:
        logger.warning("Plaid accounts unavailable: %s", exc)
        return None


@tool("fetch_transactions")
def fetch_transactions(input: str = "") -> str:
    """
    Fetch recent transactions from Plaid or the local database.

    Input (optional JSON): {"days": 30, "account_id": "...", "user_id": "..."}
    Returns: {"transactions": [...], "count": N}
    """
    try:
        params = _parse(input)
        user_id = params.get("user_id", USER_ID)
        days = int(params.get("days", 30))
        account_id = params.get("account_id")

        if PLAID_ENABLED:
            result = _plaid_transactions(user_id, days, account_id)
            if result:
                return result

        where: dict = {"user_id": user_id}
        if account_id:
            where["account_id"] = account_id
        txns = fetch_rows("transactions", where, limit=500)
        return _ok({"transactions": txns, "count": len(txns), "source": "local"})
    except Exception as exc:
        return _err(str(exc))


def _plaid_transactions(
    user_id: str, days: int, account_id: Optional[str]
) -> Optional[str]:
    try:
        import datetime as dt

        from plaid import ApiClient, Configuration, Environment
        from plaid.api import plaid_api
        from plaid.model.transactions_get_request import TransactionsGetRequest
        from plaid.model.transactions_get_request_options import (
            TransactionsGetRequestOptions,
        )

        env_map = {
            "sandbox": Environment.Sandbox,
            "development": Environment.Development,
            "production": Environment.Production,
        }
        cfg = Configuration(
            host=env_map.get(PLAID_ENV, Environment.Sandbox),
            api_key={"clientId": PLAID_CLIENT_ID, "secret": PLAID_SECRET},
        )
        end = dt.date.today()
        start = end - dt.timedelta(days=days)
        options = TransactionsGetRequestOptions()
        if account_id:
            options.account_ids = [account_id]

        with ApiClient(cfg) as client:
            api = plaid_api.PlaidApi(client)
            resp = api.transactions_get(
                TransactionsGetRequest(
                    access_token=PLAID_ACCESS_TOKEN,
                    start_date=start,
                    end_date=end,
                    options=options,
                )
            )

        transactions = []
        for txn in resp.transactions:
            row = {
                "id": txn.transaction_id,
                "account_id": txn.account_id,
                "user_id": user_id,
                "date": str(txn.date),
                "amount": txn.amount,
                "description": txn.name,
                "category": (txn.category[0] if txn.category else "Uncategorized"),
                "merchant": txn.merchant_name or txn.name,
                "is_recurring": 0,
            }
            transactions.append(row)
            insert_row("transactions", row)

        return _ok({"transactions": transactions, "count": len(transactions), "source": "plaid"})
    except Exception as exc:
        logger.warning("Plaid transactions unavailable: %s", exc)
        return None


@tool("fetch_stock_quote")
def fetch_stock_quote(input: str = "") -> str:
    """
    Fetch real-time stock / ETF quotes.

    Input: JSON {"symbols": ["AAPL", "VTI"]} OR plain comma-separated "AAPL,VTI"
    Returns: {"quotes": {"AAPL": {"price": ..., "change_pct": ...}, ...}}
    """
    try:
        if input.strip().startswith("{"):
            symbols: list[str] = _parse(input).get("symbols", [])
        else:
            symbols = [s.strip().upper() for s in input.split(",") if s.strip()]

        if not symbols:
            return _err("No symbols provided")

        if USE_POLYGON:
            return _polygon_quotes(symbols)
        return _yfinance_quotes(symbols)
    except Exception as exc:
        return _err(str(exc))


def _yfinance_quotes(symbols: list[str]) -> str:
    import yfinance as yf

    results: dict = {}
    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="2d")
            price = float(hist["Close"].iloc[-1]) if not hist.empty else 0.0
            prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else price
            chg_pct = round((price - prev) / prev * 100, 2) if prev else 0.0
            results[sym] = {
                "symbol": sym,
                "price": round(price, 2),
                "change_pct": chg_pct,
                "source": "yfinance",
            }
        except Exception as exc:
            results[sym] = {"symbol": sym, "error": str(exc)}
    return _ok({"quotes": results})


def _polygon_quotes(symbols: list[str]) -> str:
    import requests

    results: dict = {}
    for sym in symbols:
        try:
            url = (
                f"https://api.polygon.io/v2/last/trade/{sym}"
                f"?apiKey={POLYGON_API_KEY}"
            )
            data = requests.get(url, timeout=5).json()
            results[sym] = {
                "symbol": sym,
                "price": data.get("results", {}).get("p", 0),
                "source": "polygon",
            }
        except Exception as exc:
            results[sym] = {"symbol": sym, "error": str(exc)}
    return _ok({"quotes": results})


@tool("fetch_crypto_price")
def fetch_crypto_price(input: str = "") -> str:
    """
    Fetch cryptocurrency prices via yfinance (free, no API key).

    Input: JSON {"symbols": ["BTC", "ETH"]} OR plain "BTC,ETH"
    Returns: {"crypto": {"BTC": {"price_usd": ...}, ...}}
    """
    try:
        if input.strip().startswith("{"):
            symbols: list[str] = _parse(input).get("symbols", ["BTC"])
        else:
            symbols = [s.strip().upper() for s in input.split(",") if s.strip()] or ["BTC"]

        import yfinance as yf

        results: dict = {}
        for sym in symbols:
            try:
                hist = yf.Ticker(f"{sym}-USD").history(period="2d")
                price = float(hist["Close"].iloc[-1]) if not hist.empty else 0.0
                results[sym] = {"symbol": sym, "price_usd": round(price, 2), "source": "yfinance"}
            except Exception as exc:
                results[sym] = {"symbol": sym, "error": str(exc)}
        return _ok({"crypto": results})
    except Exception as exc:
        return _err(str(exc))


@tool("load_sample_data")
def load_sample_data(input: str = "") -> str:
    """
    Load sample financial data into the local database for testing/demo.

    Input: optional file path string OR empty to generate synthetic data.
    Returns: {"status": "success", "loaded": {"accounts": N, ...}}
    """
    try:
        path = input.strip() or "data/sample_data.json"

        if os.path.exists(path):
            with open(path) as fh:
                data = json.load(fh)
            loaded = {"accounts": 0, "transactions": 0, "holdings": 0, "goals": 0}
            for acc in data.get("accounts", []):
                acc.setdefault("user_id", USER_ID)
                acc.setdefault("last_updated", datetime.now().isoformat())
                insert_row("accounts", acc)
                loaded["accounts"] += 1
            for txn in data.get("transactions", []):
                txn.setdefault("user_id", USER_ID)
                insert_row("transactions", txn)
                loaded["transactions"] += 1
            for h in data.get("holdings", []):
                h.setdefault("user_id", USER_ID)
                insert_row("holdings", h)
                loaded["holdings"] += 1
            for g in data.get("goals", []):
                g.setdefault("user_id", USER_ID)
                g.setdefault("created_at", datetime.now().isoformat())
                insert_row("goals", g)
                loaded["goals"] += 1
            return _ok({"status": "success", "loaded": loaded})

        return _generate_sample_data()
    except Exception as exc:
        logger.error("load_sample_data error: %s", exc)
        return _err(str(exc))


def _generate_sample_data() -> str:
    """Synthesise realistic sample data and persist it to the local DB."""
    import random

    accounts = [
        {
            "id": "acc_checking_001", "user_id": USER_ID, "name": "Chase Checking",
            "type": "checking", "institution": "Chase",
            "balance": 4250.67, "currency": "USD",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "acc_savings_001", "user_id": USER_ID, "name": "Ally HYSA",
            "type": "savings", "institution": "Ally",
            "balance": 18500.00, "currency": "USD",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "acc_invest_001", "user_id": USER_ID, "name": "Fidelity Brokerage",
            "type": "investment", "institution": "Fidelity",
            "balance": 87430.25, "currency": "USD",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "acc_401k_001", "user_id": USER_ID, "name": "401(k) — Fidelity",
            "type": "investment", "institution": "Fidelity",
            "balance": 245000.00, "currency": "USD",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "acc_cc_001", "user_id": USER_ID, "name": "Chase Sapphire Reserve",
            "type": "credit", "institution": "Chase",
            "balance": -2340.50, "currency": "USD",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "acc_mortgage_001", "user_id": USER_ID, "name": "Home Mortgage",
            "type": "loan", "institution": "Wells Fargo",
            "balance": -285000.00, "currency": "USD",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "acc_home_001", "user_id": USER_ID, "name": "Home Value (Estimated)",
            "type": "asset", "institution": "Zillow Est.",
            "balance": 450000.00, "currency": "USD",
            "last_updated": datetime.now().isoformat(),
        },
    ]

    category_merchants: dict[str, list[str]] = {
        "Food & Dining": ["Chipotle", "Starbucks", "McDonald's", "Local Bistro", "Panera"],
        "Groceries": ["Whole Foods", "Trader Joe's", "Kroger", "Costco"],
        "Shopping": ["Amazon", "Target", "Best Buy", "Walmart"],
        "Travel": ["Delta Airlines", "Marriott", "Uber", "Lyft"],
        "Utilities": ["Electricity Co.", "Water Dept.", "Comcast"],
        "Entertainment": ["Netflix", "Spotify", "AMC Theaters", "Steam"],
        "Healthcare": ["CVS Pharmacy", "Doctor's Office", "Planet Fitness"],
        "Subscriptions": ["Netflix", "Spotify", "Adobe CC", "GitHub Pro", "iCloud+"],
        "Gas": ["Shell", "Chevron", "BP"],
        "Income": ["Employer Direct Deposit", "Freelance Payment"],
    }

    transactions = []
    for _ in range(120):
        cat = random.choice(list(category_merchants.keys()))
        merchant = random.choice(category_merchants[cat])
        amount = (
            random.uniform(-5500, -3000)
            if cat == "Income"
            else random.uniform(5, 300)
        )
        date = (datetime.now() - timedelta(days=random.randint(0, 60))).strftime("%Y-%m-%d")
        transactions.append(
            {
                "id": f"txn_{uuid.uuid4().hex[:8]}",
                "account_id": "acc_checking_001",
                "user_id": USER_ID,
                "date": date,
                "amount": round(amount, 2),
                "description": merchant,
                "category": cat,
                "merchant": merchant,
                "is_recurring": 1 if cat == "Subscriptions" else 0,
            }
        )

    holdings = [
        {
            "id": "hold_001", "user_id": USER_ID, "account_id": "acc_invest_001",
            "symbol": "VTI", "name": "Vanguard Total Stock Market ETF",
            "quantity": 120.0, "cost_basis": 42000.00, "asset_type": "etf",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "hold_002", "user_id": USER_ID, "account_id": "acc_invest_001",
            "symbol": "AAPL", "name": "Apple Inc.",
            "quantity": 50.0, "cost_basis": 8500.00, "asset_type": "stock",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "hold_003", "user_id": USER_ID, "account_id": "acc_invest_001",
            "symbol": "BTC", "name": "Bitcoin",
            "quantity": 0.5, "cost_basis": 20000.00, "asset_type": "crypto",
            "last_updated": datetime.now().isoformat(),
        },
        {
            "id": "hold_004", "user_id": USER_ID, "account_id": "acc_invest_001",
            "symbol": "MSFT", "name": "Microsoft Corp.",
            "quantity": 30.0, "cost_basis": 9600.00, "asset_type": "stock",
            "last_updated": datetime.now().isoformat(),
        },
    ]

    goals = [
        {
            "id": "goal_001", "user_id": USER_ID, "name": "Emergency Fund",
            "target_amount": 25000.0, "current_amount": 18500.0,
            "target_date": "2026-12-31", "category": "emergency",
            "created_at": datetime.now().isoformat(),
        },
        {
            "id": "goal_002", "user_id": USER_ID, "name": "Europe Vacation",
            "target_amount": 8000.0, "current_amount": 2300.0,
            "target_date": "2027-06-01", "category": "vacation",
            "created_at": datetime.now().isoformat(),
        },
        {
            "id": "goal_003", "user_id": USER_ID, "name": "Early Retirement",
            "target_amount": 2_000_000.0, "current_amount": 332_430.0,
            "target_date": "2045-01-01", "category": "retirement",
            "created_at": datetime.now().isoformat(),
        },
        {
            "id": "goal_004", "user_id": USER_ID, "name": "House Down Payment",
            "target_amount": 80_000.0, "current_amount": 18_500.0,
            "target_date": "2028-06-01", "category": "house",
            "created_at": datetime.now().isoformat(),
        },
    ]

    for row in accounts:
        insert_row("accounts", row)
    for row in transactions:
        insert_row("transactions", row)
    for row in holdings:
        insert_row("holdings", row)
    for row in goals:
        insert_row("goals", row)

    return _ok({
        "status": "success",
        "generated": {
            "accounts": len(accounts),
            "transactions": len(transactions),
            "holdings": len(holdings),
            "goals": len(goals),
        },
        "message": "Synthetic sample data loaded into local database.",
    })


# ─────────────────────────────────────────────────────────────────────────────
# NET WORTH TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@tool("calculate_net_worth")
def calculate_net_worth(input: str = "") -> str:
    """
    Calculate total net worth: sum(assets) − sum(liabilities).

    Input (optional JSON): {"user_id": "..."}
    Returns: {"net_worth": N, "total_assets": N, "total_liabilities": N,
              "breakdown": {...}, "as_of": "ISO datetime"}
    """
    try:
        user_id = _parse(input).get("user_id", USER_ID)
        accounts = fetch_rows("accounts", {"user_id": user_id})
        if not accounts:
            return _ok({"net_worth": 0, "message": "No accounts found. Load sample data first."})

        assets = sum(a["balance"] for a in accounts if a["balance"] > 0)
        liabs = abs(sum(a["balance"] for a in accounts if a["balance"] < 0))

        breakdown = {
            "liquid": sum(
                a["balance"] for a in accounts
                if a["type"] in ("checking", "savings") and a["balance"] > 0
            ),
            "investments": sum(
                a["balance"] for a in accounts if a["type"] == "investment"
            ),
            "real_estate": sum(
                a["balance"] for a in accounts if a["type"] == "asset"
            ),
            "credit_cards": abs(sum(
                a["balance"] for a in accounts
                if a["type"] == "credit" and a["balance"] < 0
            )),
            "loans": abs(sum(
                a["balance"] for a in accounts
                if a["type"] == "loan" and a["balance"] < 0
            )),
        }

        return _ok({
            "net_worth": round(assets - liabs, 2),
            "total_assets": round(assets, 2),
            "total_liabilities": round(liabs, 2),
            "breakdown": {k: round(v, 2) for k, v in breakdown.items()},
            "accounts_count": len(accounts),
            "as_of": datetime.now().isoformat(),
        })
    except Exception as exc:
        return _err(str(exc))


@tool("update_account_balance")
def update_account_balance(input: str = "") -> str:
    """
    Add or update a manual account balance (e.g., home value, car, manual asset).

    Input JSON: {"account_id": "...", "name": "...", "type": "asset",
                 "balance": 450000, "institution": "Zillow Est."}
    Returns: {"status": "updated", "account": {...}}
    """
    try:
        params = _parse(input)
        if not params:
            return _err("Input must be a JSON object with at least 'name' and 'balance'.")
        row = {
            "id": params.get("account_id", f"acc_{uuid.uuid4().hex[:8]}"),
            "user_id": USER_ID,
            "name": params.get("name", "Manual Account"),
            "type": params.get("type", "asset"),
            "institution": params.get("institution", "Manual"),
            "balance": float(params.get("balance", 0)),
            "currency": params.get("currency", "USD"),
            "last_updated": datetime.now().isoformat(),
        }
        insert_row("accounts", row)
        return _ok({"status": "updated", "account": row})
    except Exception as exc:
        return _err(str(exc))


@tool("get_portfolio_performance")
def get_portfolio_performance(input: str = "") -> str:
    """
    Analyse investment portfolio: current value, cost basis, P&L, allocation.

    Input (optional JSON): {"user_id": "...", "fetch_live_prices": true}
    Returns: {"holdings": [...], "total_value": N, "total_return_pct": N,
              "allocation_pct": {...}}
    """
    try:
        params = _parse(input)
        user_id = params.get("user_id", USER_ID)
        fetch_live = params.get("fetch_live_prices", True)

        holdings = fetch_rows("holdings", {"user_id": user_id})
        if not holdings:
            return _ok({"holdings": [], "message": "No holdings found. Load sample data first."})

        import yfinance as yf

        total_value = 0.0
        total_cost = 0.0
        portfolio = []

        for h in holdings:
            # Default: use cost-basis price
            avg_cost = h["cost_basis"] / h["quantity"] if h["quantity"] else 0
            current_price = avg_cost

            if fetch_live:
                try:
                    sym = f"{h['symbol']}-USD" if h["asset_type"] == "crypto" else h["symbol"]
                    hist = yf.Ticker(sym).history(period="1d")
                    if not hist.empty:
                        current_price = float(hist["Close"].iloc[-1])
                except Exception:
                    pass  # silently use cost-basis price

            current_value = current_price * h["quantity"]
            gain_loss = current_value - h["cost_basis"]
            gain_pct = (gain_loss / h["cost_basis"] * 100) if h["cost_basis"] else 0

            portfolio.append({
                "symbol": h["symbol"],
                "name": h.get("name", h["symbol"]),
                "quantity": h["quantity"],
                "current_price": round(current_price, 2),
                "current_value": round(current_value, 2),
                "cost_basis": round(h["cost_basis"], 2),
                "gain_loss": round(gain_loss, 2),
                "gain_loss_pct": round(gain_pct, 2),
                "asset_type": h["asset_type"],
            })
            total_value += current_value
            total_cost += h["cost_basis"]

        allocation: dict[str, float] = {}
        for p in portfolio:
            at = p["asset_type"]
            allocation[at] = allocation.get(at, 0) + p["current_value"]
        allocation_pct = {
            k: round(v / total_value * 100, 1) if total_value else 0
            for k, v in allocation.items()
        }

        return _ok({
            "holdings": portfolio,
            "total_value": round(total_value, 2),
            "total_cost_basis": round(total_cost, 2),
            "total_gain_loss": round(total_value - total_cost, 2),
            "total_return_pct": round((total_value - total_cost) / total_cost * 100, 2) if total_cost else 0,
            "allocation_pct": allocation_pct,
        })
    except Exception as exc:
        return _err(str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# BUDGET & EXPENSE TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@tool("get_spending_by_category")
def get_spending_by_category(input: str = "") -> str:
    """
    Summarise spending by category for a given period (expenses only).

    Input (optional JSON): {"days": 30, "user_id": "..."}
    Returns: {"spending": [{"category": ..., "total": ..., "percentage": ...}],
              "total": N, "period_days": N}
    """
    try:
        params = _parse(input)
        user_id = params.get("user_id", USER_ID)
        days = int(params.get("days", 30))
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        conn = get_connection()
        rows = conn.execute(
            """
            SELECT category, SUM(amount) AS total
            FROM transactions
            WHERE user_id = ? AND date >= ? AND amount > 0
            GROUP BY category
            ORDER BY total DESC
            """,
            (user_id, cutoff),
        ).fetchall()
        conn.close()

        summary = [{"category": r["category"] or "Uncategorized", "total": round(r["total"], 2)} for r in rows]
        grand = sum(s["total"] for s in summary)
        for s in summary:
            s["percentage"] = round(s["total"] / grand * 100, 1) if grand else 0.0

        return _ok({"spending": summary, "total": round(grand, 2), "period_days": days})
    except Exception as exc:
        return _err(str(exc))


@tool("detect_subscriptions")
def detect_subscriptions(input: str = "") -> str:
    """
    Auto-detect recurring subscription charges from transaction history.
    Looks for merchants with consistent amounts appearing 2+ times.

    Input (optional JSON): {"user_id": "...", "min_occurrences": 2}
    Returns: {"subscriptions": [...], "count": N, "monthly_total": N}
    """
    try:
        params = _parse(input)
        user_id = params.get("user_id", USER_ID)
        min_occ = int(params.get("min_occurrences", 2))

        txns = fetch_rows("transactions", {"user_id": user_id}, limit=500)

        merchant_charges: dict[str, list] = {}
        for t in txns:
            key = (t.get("merchant") or t.get("description") or "Unknown").lower().strip()
            merchant_charges.setdefault(key, []).append({"amount": t["amount"], "date": t["date"]})

        subscription_keywords = [
            "netflix", "spotify", "hulu", "disney", "amazon prime", "adobe",
            "github", "dropbox", "icloud", "google one", "apple", "microsoft",
            "gym", "insurance", "streaming", "prime", "plus", "pro",
        ]

        subscriptions = []
        for merchant, charges in merchant_charges.items():
            if len(charges) < min_occ:
                continue
            amounts = [c["amount"] for c in charges if c["amount"] > 0]
            if not amounts:
                continue
            avg = float(np.mean(amounts))
            std = float(np.std(amounts))
            is_sub = std < 1.0 or any(kw in merchant for kw in subscription_keywords)
            if is_sub and avg > 0:
                sub = {
                    "id": f"sub_{uuid.uuid4().hex[:8]}",
                    "user_id": USER_ID,
                    "name": merchant.title(),
                    "amount": round(avg, 2),
                    "frequency": "monthly",
                    "occurrences": len(charges),
                    "detected_at": datetime.now().isoformat(),
                    "is_active": 1,
                }
                subscriptions.append(sub)
                insert_row("subscriptions", sub)

        monthly_total = round(sum(s["amount"] for s in subscriptions), 2)
        return _ok({"subscriptions": subscriptions, "count": len(subscriptions),
                    "monthly_total": monthly_total, "annual_total": round(monthly_total * 12, 2)})
    except Exception as exc:
        return _err(str(exc))


@tool("categorize_transaction")
def categorize_transaction(input: str = "") -> str:
    """
    Categorise a transaction using keyword-rule matching.

    Input JSON: {"description": "Starbucks Coffee", "amount": 5.75}
    Returns: {"category": "Food & Dining", "confidence": "high"}
    """
    try:
        params = _parse(input)
        desc = params.get("description", "").lower()
        amount = float(params.get("amount", 0))

        rules: dict[str, list[str]] = {
            "Food & Dining": ["restaurant", "coffee", "cafe", "starbucks", "chipotle",
                              "mcdonald", "pizza", "sushi", "burger", "doordash", "grubhub"],
            "Groceries": ["grocery", "whole foods", "trader joe", "kroger", "safeway",
                          "walmart grocery", "publix", "aldi", "costco"],
            "Transportation": ["uber", "lyft", "gas", "shell", "chevron", "bp",
                               "parking", "metro", "bart", "transit"],
            "Shopping": ["amazon", "target", "walmart", "best buy", "apple store", "ebay"],
            "Entertainment": ["netflix", "spotify", "hulu", "disney", "cinema",
                              "amc", "ticketmaster", "steam", "gaming"],
            "Healthcare": ["pharmacy", "cvs", "walgreens", "doctor", "hospital",
                           "dental", "vision", "gym", "planet fitness"],
            "Utilities": ["electric", "water", "gas utility", "internet",
                          "comcast", "at&t", "verizon", "t-mobile"],
            "Travel": ["airline", "delta", "united", "southwest", "hotel",
                       "marriott", "hilton", "airbnb"],
            "Subscriptions": ["subscription", "premium", "membership", "adobe", "github"],
            "Income": ["payroll", "direct deposit", "salary", "freelance", "zelle"],
        }

        for cat, keywords in rules.items():
            if any(kw in desc for kw in keywords):
                return _ok({"category": cat, "description": desc,
                             "amount": amount, "confidence": "high"})

        if amount < 0:
            return _ok({"category": "Income", "description": desc,
                         "amount": amount, "confidence": "medium"})

        return _ok({"category": "Other", "description": desc,
                     "amount": amount, "confidence": "low"})
    except Exception as exc:
        return _err(str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# FORECASTING TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@tool("forecast_cash_flow")
def forecast_cash_flow(input: str = "") -> str:
    """
    Forecast future account balance based on recurring income and expenses.

    Input JSON: {"months": 6, "monthly_income": 7500, "monthly_expenses": 4200,
                 "current_balance": 4250, "savings_rate": 0.10}
    Returns: {"projections": [...month-by-month...], "monthly_surplus": N}
    """
    try:
        p = _parse(input)
        months = int(p.get("months", 6))
        income = float(p.get("monthly_income", 7500))
        expenses = float(p.get("monthly_expenses", 4200))
        balance = float(p.get("current_balance", 4250))
        savings_rate = float(p.get("savings_rate", 0.0))

        projections = []
        for i in range(1, months + 1):
            month_label = (datetime.now() + timedelta(days=30 * i)).strftime("%Y-%m")
            savings_transfer = income * savings_rate
            net = income - expenses - savings_transfer
            balance += net
            projections.append({
                "month": month_label,
                "income": income,
                "expenses": expenses,
                "savings_transfer": round(savings_transfer, 2),
                "net": round(net, 2),
                "projected_balance": round(balance, 2),
            })

        return _ok({
            "projections": projections,
            "months": months,
            "monthly_surplus": round(income - expenses, 2),
            "annual_projection": round((income - expenses) * 12, 2),
        })
    except Exception as exc:
        return _err(str(exc))


@tool("run_monte_carlo_retirement")
def run_monte_carlo_retirement(input: str = "") -> str:
    """
    Monte Carlo simulation for retirement planning (lognormal market returns).

    Input JSON: {"current_age": 30, "retirement_age": 65,
                 "current_savings": 332430, "monthly_contribution": 2000,
                 "annual_return_mean": 0.07, "annual_return_std": 0.15,
                 "target_nest_egg": 2000000, "simulations": 1000}
    Returns: probability of success, percentile outcomes, median outcome.
    """
    try:
        p = _parse(input)
        cur_age = int(p.get("current_age", 30))
        ret_age = int(p.get("retirement_age", 65))
        savings = float(p.get("current_savings", 332_430))
        monthly_contrib = float(p.get("monthly_contribution", 2000))
        mean_r = float(p.get("annual_return_mean", 0.07))
        std_r = float(p.get("annual_return_std", 0.15))
        target = float(p.get("target_nest_egg", 2_000_000))
        n_sims = int(p.get("simulations", 1000))

        years = ret_age - cur_age
        if years <= 0:
            return _err("retirement_age must be greater than current_age")

        monthly_mean = mean_r / 12
        monthly_std = std_r / (12 ** 0.5)
        months = years * 12

        rng = np.random.default_rng(seed=42)
        final_values: list[float] = []
        for _ in range(n_sims):
            bal = savings
            returns = rng.normal(monthly_mean, monthly_std, months)
            for r in returns:
                bal = bal * (1 + r) + monthly_contrib
            final_values.append(bal)

        fv = np.array(final_values)
        success_rate = float(np.mean(fv >= target)) * 100

        return _ok({
            "years_to_retirement": years,
            "current_age": cur_age,
            "retirement_age": ret_age,
            "target_nest_egg": target,
            "current_savings": savings,
            "monthly_contribution": monthly_contrib,
            "probability_of_success": round(success_rate, 1),
            "median_outcome": round(float(np.median(fv)), 2),
            "p10_outcome": round(float(np.percentile(fv, 10)), 2),
            "p25_outcome": round(float(np.percentile(fv, 25)), 2),
            "p75_outcome": round(float(np.percentile(fv, 75)), 2),
            "p90_outcome": round(float(np.percentile(fv, 90)), 2),
            "simulations_run": n_sims,
            "assumed_annual_return": f"{mean_r * 100:.1f}%",
        })
    except Exception as exc:
        return _err(str(exc))


@tool("simulate_scenario")
def simulate_scenario(input: str = "") -> str:
    """
    Simulate a financial life-event (job loss, raise, large expense, recession).

    Input JSON: {"scenario": "job_loss", "duration_months": 6,
                 "current_monthly_income": 7500, "current_monthly_expenses": 4200,
                 "current_savings": 22750}
    Scenario options: job_loss | pay_cut_20pct | raise_15pct | large_expense | recession
    Returns: impact analysis with month-by-month balance timeline.
    """
    try:
        p = _parse(input)
        scenario = p.get("scenario", "job_loss")
        duration = int(p.get("duration_months", 6))
        income = float(p.get("current_monthly_income", 7500))
        expenses = float(p.get("current_monthly_expenses", 4200))
        savings = float(p.get("current_savings", 22750))

        scenarios = {
            "job_loss":       {"income_mult": 0.0,   "extra_exp": 0,    "label": "Complete Job Loss"},
            "pay_cut_20pct":  {"income_mult": 0.8,   "extra_exp": 0,    "label": "20% Pay Cut"},
            "raise_15pct":    {"income_mult": 1.15,  "extra_exp": 0,    "label": "15% Raise"},
            "large_expense":  {"income_mult": 1.0,   "extra_exp": 2000, "label": "Large Unexpected Expense ($2k/mo)"},
            "recession":      {"income_mult": 0.7,   "extra_exp": 0,    "label": "Recession — 30% Income Drop"},
        }

        s = scenarios.get(scenario, scenarios["job_loss"])
        new_income = income * s["income_mult"]
        new_expenses = expenses + s["extra_exp"]
        monthly_net = new_income - new_expenses

        bal = savings
        timeline = []
        months_until_zero = None
        for i in range(1, duration + 1):
            bal += monthly_net
            month_label = (datetime.now() + timedelta(days=30 * i)).strftime("%Y-%m")
            timeline.append({"month": month_label, "balance": round(bal, 2)})
            if bal <= 0 and months_until_zero is None:
                months_until_zero = i

        runway = round(savings / abs(monthly_net), 1) if monthly_net < 0 else None

        return _ok({
            "scenario": scenario,
            "description": s["label"],
            "duration_months": duration,
            "original_income": income,
            "new_income": new_income,
            "original_expenses": expenses,
            "new_expenses": new_expenses,
            "monthly_net_change": round(monthly_net, 2),
            "starting_savings": savings,
            "ending_savings": round(bal, 2),
            "runway_months": runway,
            "months_until_broke": months_until_zero,
            "timeline": timeline,
        })
    except Exception as exc:
        return _err(str(exc))


@tool("project_savings_goal")
def project_savings_goal(input: str = "") -> str:
    """
    Project when a savings goal will be reached given a monthly contribution.

    Input JSON option A: {"goal_id": "goal_001", "monthly_contribution": 500}
    Input JSON option B: {"target": 8000, "current": 2300, "name": "Vacation",
                          "monthly_contribution": 500}
    Returns: estimated completion date and progress percentage.
    """
    try:
        p = _parse(input)
        monthly = float(p.get("monthly_contribution", 500))

        if "goal_id" in p:
            goals = fetch_rows("goals", {"id": p["goal_id"], "user_id": USER_ID})
            if not goals:
                return _err("Goal not found")
            g = goals[0]
            target, current, name = g["target_amount"], g["current_amount"], g["name"]
        else:
            target = float(p.get("target", 10_000))
            current = float(p.get("current", 0))
            name = p.get("name", "Savings Goal")

        if monthly <= 0:
            return _err("monthly_contribution must be positive")

        remaining = target - current
        months_needed = remaining / monthly
        completion = (datetime.now() + timedelta(days=30 * months_needed)).strftime("%Y-%m-%d")

        return _ok({
            "goal_name": name,
            "target": target,
            "current": current,
            "remaining": round(remaining, 2),
            "monthly_contribution": monthly,
            "months_to_completion": round(months_needed, 1),
            "estimated_completion_date": completion,
            "progress_percentage": round(current / target * 100, 1) if target else 0,
        })
    except Exception as exc:
        return _err(str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# INSIGHTS TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@tool("detect_anomalies")
def detect_anomalies(input: str = "") -> str:
    """
    Detect statistically unusual transactions using Z-score analysis per category.

    Input (optional JSON): {"user_id": "...", "sensitivity": 2.0}
    Returns: {"anomalies": [...], "count": N}
    """
    try:
        p = _parse(input)
        user_id = p.get("user_id", USER_ID)
        sensitivity = float(p.get("sensitivity", 2.0))

        txns = fetch_rows("transactions", {"user_id": user_id}, limit=500)
        if not txns:
            return _ok({"anomalies": [], "note": "No transactions available."})

        cat_txns: dict[str, list] = {}
        for t in txns:
            if t["amount"] > 0:
                cat_txns.setdefault(t.get("category", "Other"), []).append(t)

        anomalies = []
        for cat, items in cat_txns.items():
            if len(items) < 3:
                continue
            amounts = np.array([i["amount"] for i in items])
            mean, std = float(amounts.mean()), float(amounts.std())
            if std == 0:
                continue
            for t in items:
                z = abs(t["amount"] - mean) / std
                if z > sensitivity:
                    direction = "high" if t["amount"] > mean else "low"
                    anomalies.append({
                        "transaction_id": t["id"],
                        "date": t["date"],
                        "description": t.get("description", ""),
                        "amount": t["amount"],
                        "category": cat,
                        "z_score": round(z, 2),
                        "category_mean": round(mean, 2),
                        "reason": f"Unusually {direction} for {cat} (z={z:.1f}σ)",
                    })

        anomalies.sort(key=lambda x: x["z_score"], reverse=True)
        return _ok({"anomalies": anomalies[:20], "count": len(anomalies)})
    except Exception as exc:
        return _err(str(exc))


@tool("get_financial_recommendations")
def get_financial_recommendations(input: str = "") -> str:
    """
    Generate prioritised, personalised financial recommendations.

    Input (optional JSON): {"user_id": "...", "focus": "savings|debt|investment|all"}
    Returns: {"recommendations": [...], "count": N}
    """
    try:
        p = _parse(input)
        user_id = p.get("user_id", USER_ID)

        accounts = fetch_rows("accounts", {"user_id": user_id})
        goals = fetch_rows("goals", {"user_id": user_id})

        if not accounts:
            return _ok({"recommendations": [{
                "type": "setup", "priority": "high",
                "message": "Load your financial data to get personalised recommendations.",
                "action": "Click 'Load Sample' in the sidebar.",
            }]})

        recs = []

        # Emergency fund check
        liquid = sum(a["balance"] for a in accounts if a["type"] in ("checking", "savings") and a["balance"] > 0)
        est_monthly_expenses = 4200.0
        months_covered = liquid / est_monthly_expenses if est_monthly_expenses else 0

        if months_covered < 3:
            recs.append({
                "type": "emergency_fund", "priority": "high",
                "message": f"Liquid savings cover only {months_covered:.1f} months of expenses. Aim for 3–6 months.",
                "action": "Increase emergency fund contributions before investing.",
            })
        elif months_covered >= 9:
            recs.append({
                "type": "over_saving", "priority": "low",
                "message": f"Your emergency fund ({months_covered:.1f} mo) exceeds 6 months. Consider investing excess.",
                "action": "Move extra cash to a taxable brokerage or pay down debt.",
            })

        # Debt check
        credit_debt = abs(sum(a["balance"] for a in accounts if a["type"] == "credit"))
        if credit_debt > 5000:
            recs.append({
                "type": "high_interest_debt", "priority": "high",
                "message": f"You carry ${credit_debt:,.0f} in credit card debt — likely 18–25% APR.",
                "action": "Prioritise paying this off before investing in taxable accounts.",
            })

        # Goals lagging
        for g in goals:
            if g.get("is_completed"):
                continue
            progress = (g["current_amount"] / g["target_amount"] * 100) if g["target_amount"] else 0
            if progress < 15 and g.get("target_date"):
                recs.append({
                    "type": "goal_lagging", "priority": "medium",
                    "message": f"Goal '{g['name']}' is only {progress:.0f}% funded.",
                    "action": "Set up an automatic transfer to accelerate progress.",
                })

        # Diversification nudge
        recs.append({
            "type": "portfolio_review", "priority": "low",
            "message": "Schedule a quarterly portfolio rebalancing review.",
            "action": "Check asset allocation against your target in the Forecast tab.",
        })

        if not recs:
            recs.append({
                "type": "on_track", "priority": "low",
                "message": "Your finances look healthy — keep up the great work!",
                "action": "Review goals quarterly.",
            })

        return _ok({"recommendations": recs, "count": len(recs)})
    except Exception as exc:
        return _err(str(exc))


@tool("analyze_spending_trends")
def analyze_spending_trends(input: str = "") -> str:
    """
    Analyse month-over-month spending changes by category.

    Input (optional JSON): {"user_id": "..."}
    Returns: {"trends": {category: {YYYY-MM: total}},
              "insights": [...significant changes...]}
    """
    try:
        p = _parse(input)
        user_id = p.get("user_id", USER_ID)

        conn = get_connection()
        rows = conn.execute(
            """
            SELECT strftime('%Y-%m', date) AS month,
                   category,
                   SUM(amount)             AS total
            FROM transactions
            WHERE user_id = ? AND amount > 0
            GROUP BY month, category
            ORDER BY month DESC
            """,
            (user_id,),
        ).fetchall()
        conn.close()

        trends: dict[str, dict] = {}
        for r in rows:
            cat = r["category"] or "Other"
            trends.setdefault(cat, {})[r["month"]] = round(r["total"], 2)

        insights = []
        for cat, monthly in trends.items():
            months_sorted = sorted(monthly.keys(), reverse=True)
            if len(months_sorted) >= 2:
                cur = monthly[months_sorted[0]]
                prev = monthly[months_sorted[1]]
                chg = ((cur - prev) / prev * 100) if prev else 0
                if abs(chg) >= 20:
                    direction = "increased" if chg > 0 else "decreased"
                    insights.append({
                        "category": cat,
                        "current_month": cur,
                        "previous_month": prev,
                        "change_pct": round(chg, 1),
                        "insight": f"{cat} spending {direction} by {abs(chg):.0f}% month-over-month.",
                    })

        insights.sort(key=lambda x: abs(x["change_pct"]), reverse=True)
        return _ok({"trends": trends, "insights": insights,
                    "categories_tracked": len(trends)})
    except Exception as exc:
        return _err(str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULING TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@tool("create_calendar_event")
def create_calendar_event(input: str = "") -> str:
    """
    Create a financial calendar event and optionally sync to Google Calendar.

    Input JSON: {"title": "...", "date": "YYYY-MM-DD", "description": "...",
                 "event_type": "bill_due|review|reminder|goal_deadline",
                 "amount": 0, "is_recurring": false, "recurrence": "monthly"}
    Returns: {"status": "created", "event": {...}}
    """
    try:
        p = _parse(input)
        event = {
            "id": f"evt_{uuid.uuid4().hex[:8]}",
            "user_id": USER_ID,
            "title": p.get("title", "Financial Event"),
            "description": p.get("description", ""),
            "event_date": p.get("date", datetime.now().strftime("%Y-%m-%d")),
            "event_type": p.get("event_type", "reminder"),
            "amount": float(p.get("amount", 0)),
            "account_id": p.get("account_id", ""),
            "is_recurring": int(bool(p.get("is_recurring", False))),
            "recurrence": p.get("recurrence", ""),
            "is_synced_to_google": 0,
            "created_at": datetime.now().isoformat(),
        }
        insert_row("events", event)

        if USE_GOOGLE_CALENDAR:
            synced = _sync_google_calendar(event)
            if synced:
                event["is_synced_to_google"] = 1
                update_row("events", {"is_synced_to_google": 1}, {"id": event["id"]})

        _write_ics(event)
        return _ok({"status": "created", "event": event})
    except Exception as exc:
        return _err(str(exc))


def _sync_google_calendar(event: dict) -> bool:
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build

        SCOPES = ["https://www.googleapis.com/auth/calendar"]
        creds = None
        if os.path.exists(GOOGLE_CALENDAR_TOKEN):
            creds = Credentials.from_authorized_user_file(GOOGLE_CALENDAR_TOKEN, SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    GOOGLE_CALENDAR_CREDENTIALS, SCOPES
                )
                creds = flow.run_local_server(port=0)
            with open(GOOGLE_CALENDAR_TOKEN, "w") as fh:
                fh.write(creds.to_json())

        service = build("calendar", "v3", credentials=creds)
        gc_event = {
            "summary": event["title"],
            "description": event.get("description", ""),
            "start": {"date": event["event_date"]},
            "end": {"date": event["event_date"]},
        }
        service.events().insert(calendarId=GOOGLE_CALENDAR_ID, body=gc_event).execute()
        return True
    except Exception as exc:
        logger.warning("Google Calendar sync failed: %s", exc)
        return False


def _write_ics(event: dict) -> None:
    """Append event to a local .ics file as a portable fallback."""
    try:
        from icalendar import Calendar, Event as ICSEvent

        cal = Calendar()
        if os.path.exists(ICS_CALENDAR_PATH):
            with open(ICS_CALENDAR_PATH, "rb") as fh:
                cal = Calendar.from_ical(fh.read())
        else:
            cal.add("prodid", "-//guddd Finance//EN")
            cal.add("version", "2.0")

        ev = ICSEvent()
        ev.add("summary", event["title"])
        ev.add("description", event.get("description", ""))
        ev.add("dtstart", datetime.strptime(event["event_date"], "%Y-%m-%d").date())
        ev.add("uid", event["id"])
        cal.add_component(ev)
        with open(ICS_CALENDAR_PATH, "wb") as fh:
            fh.write(cal.to_ical())
    except Exception as exc:
        logger.warning("ICS write failed: %s", exc)


@tool("list_upcoming_events")
def list_upcoming_events(input: str = "") -> str:
    """
    List upcoming financial calendar events within a date window.

    Input (optional JSON): {"days": 30, "event_type": "bill_due", "user_id": "..."}
    Returns: {"events": [...], "count": N, "period": "Next N days"}
    """
    try:
        p = _parse(input)
        user_id = p.get("user_id", USER_ID)
        days = int(p.get("days", 30))
        event_type = p.get("event_type")

        today = datetime.now().strftime("%Y-%m-%d")
        end = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

        conn = get_connection()
        query = "SELECT * FROM events WHERE user_id = ? AND event_date BETWEEN ? AND ?"
        params: list = [user_id, today, end]
        if event_type:
            query += " AND event_type = ?"
            params.append(event_type)
        query += " ORDER BY event_date ASC"
        rows = conn.execute(query, params).fetchall()
        conn.close()

        events = [dict(r) for r in rows]
        return _ok({"events": events, "count": len(events), "period": f"Next {days} days"})
    except Exception as exc:
        return _err(str(exc))


@tool("add_bill_reminder")
def add_bill_reminder(input: str = "") -> str:
    """
    Add a monthly bill reminder to the financial calendar.

    Input JSON: {"bill_name": "Rent", "amount": 1800, "due_day": 1,
                 "is_recurring": true, "account_id": "..."}
    Returns: the created calendar event.
    """
    try:
        p = _parse(input)
        bill_name = p.get("bill_name", "Bill")
        amount = float(p.get("amount", 0))
        due_day = int(p.get("due_day", 1))
        is_recurring = bool(p.get("is_recurring", True))

        today = datetime.now()
        try:
            next_due = today.replace(day=due_day)
        except ValueError:
            next_due = today.replace(day=28)  # month end fallback

        if next_due.date() < today.date():
            # Advance to next month
            if today.month == 12:
                next_due = next_due.replace(year=today.year + 1, month=1)
            else:
                next_due = next_due.replace(month=today.month + 1)

        return create_calendar_event(json.dumps({
            "title": f"Bill Due: {bill_name}",
            "description": f"${amount:.2f} due for {bill_name}",
            "date": next_due.strftime("%Y-%m-%d"),
            "event_type": "bill_due",
            "amount": amount,
            "account_id": p.get("account_id", ""),
            "is_recurring": is_recurring,
            "recurrence": "monthly" if is_recurring else "",
        }))
    except Exception as exc:
        return _err(str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# NOTES TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@tool("save_note")
def save_note(input: str = "") -> str:
    """
    Save a financial note or journal entry to SQLite and as a markdown file.

    Input JSON: {"title": "...", "content": "...", "tags": "savings,goal,idea",
                 "linked_account": "acc_id", "linked_goal": "goal_id"}
    Returns: {"status": "saved", "note_id": "...", "title": "..."}
    """
    try:
        p = _parse(input)
        now_iso = datetime.now().isoformat()
        note = {
            "id": f"note_{uuid.uuid4().hex[:8]}",
            "user_id": USER_ID,
            "title": p.get("title", "Untitled Note"),
            "content": p.get("content", ""),
            "tags": p.get("tags", ""),
            "linked_account": p.get("linked_account", ""),
            "linked_goal": p.get("linked_goal", ""),
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        insert_row("notes", note)
        _note_to_markdown(note)
        return _ok({"status": "saved", "note_id": note["id"], "title": note["title"]})
    except Exception as exc:
        return _err(str(exc))


def _note_to_markdown(note: dict) -> None:
    """Write a note as a portable markdown file in the NOTES_DIR."""
    try:
        safe = "".join(c if c.isalnum() or c in (" ", "-", "_") else "_" for c in note["title"])
        filepath = os.path.join(NOTES_DIR, f"{note['id']}_{safe[:30]}.md")
        content = (
            f"# {note['title']}\n\n"
            f"**Date:** {note['created_at'][:10]}  \n"
            f"**Tags:** {note.get('tags', '')}  \n"
            f"**Linked Account:** {note.get('linked_account') or 'N/A'}  \n"
            f"**Linked Goal:** {note.get('linked_goal') or 'N/A'}  \n\n"
            f"---\n\n{note['content']}\n"
        )
        with open(filepath, "w") as fh:
            fh.write(content)
    except Exception as exc:
        logger.warning("Note markdown write failed: %s", exc)


@tool("search_notes")
def search_notes(input: str = "") -> str:
    """
    Search financial notes by keyword or tag.

    Input: JSON {"query": "savings", "tags": "goal"} OR plain text search string.
    Returns: {"notes": [...], "count": N, "query": "..."}
    """
    try:
        if input.strip().startswith("{"):
            p = _parse(input)
            query = p.get("query", "")
            tags = p.get("tags", "")
        else:
            query = input.strip()
            tags = ""

        conn = get_connection()
        sql = "SELECT * FROM notes WHERE user_id = ?"
        params: list = [USER_ID]
        if query:
            sql += " AND (title LIKE ? OR content LIKE ?)"
            params += [f"%{query}%", f"%{query}%"]
        if tags:
            sql += " AND tags LIKE ?"
            params.append(f"%{tags}%")
        sql += " ORDER BY created_at DESC LIMIT 20"
        rows = conn.execute(sql, params).fetchall()
        conn.close()

        notes = [dict(r) for r in rows]
        return _ok({"notes": notes, "count": len(notes), "query": query})
    except Exception as exc:
        return _err(str(exc))


@tool("summarize_notes")
def summarize_notes(input: str = "") -> str:
    """
    Retrieve and preview recent financial notes.

    Input (optional JSON): {"days": 30, "tags": "...", "limit": 10}
    Returns: {"summaries": [...], "total_notes": N, "period": "Last N days"}
    """
    try:
        p = _parse(input)
        days = int(p.get("days", 30))
        limit = int(p.get("limit", 10))
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()

        conn = get_connection()
        rows = conn.execute(
            """
            SELECT id, title, content, tags, created_at
            FROM notes
            WHERE user_id = ? AND created_at >= ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (USER_ID, cutoff, limit),
        ).fetchall()
        conn.close()

        summaries = [
            {
                "id": r["id"],
                "title": r["title"],
                "preview": (r["content"][:150] + "…" if len(r["content"] or "") > 150 else r["content"]),
                "tags": r["tags"],
                "date": (r["created_at"] or "")[:10],
            }
            for r in rows
        ]
        return _ok({"summaries": summaries, "total_notes": len(summaries),
                    "period": f"Last {days} days"})
    except Exception as exc:
        return _err(str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# REPORTING TOOLS
# ─────────────────────────────────────────────────────────────────────────────

@tool("generate_csv_report")
def generate_csv_report(input: str = "") -> str:
    """
    Export a CSV report for tax or accounting purposes.

    Input JSON: {"start_date": "2026-01-01", "end_date": "2026-03-31",
                 "report_type": "transactions|spending|net_worth"}
    Returns: {"status": "generated", "file": "path/to/report.csv", "rows": N}
    """
    try:
        p = _parse(input)
        rtype = p.get("report_type", "transactions")
        start = p.get("start_date", (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d"))
        end = p.get("end_date", datetime.now().strftime("%Y-%m-%d"))

        conn = sqlite3.connect(DB_PATH)
        if rtype == "transactions":
            df = pd.read_sql_query(
                "SELECT date, description, category, amount, merchant, account_id "
                "FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC",
                conn, params=(USER_ID, start, end),
            )
        elif rtype == "spending":
            df = pd.read_sql_query(
                "SELECT strftime('%Y-%m', date) AS month, category, SUM(amount) AS total "
                "FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ? AND amount > 0 "
                "GROUP BY month, category ORDER BY month DESC",
                conn, params=(USER_ID, start, end),
            )
        else:
            df = pd.read_sql_query(
                "SELECT name, type, institution, balance, currency, last_updated "
                "FROM accounts WHERE user_id = ?",
                conn, params=(USER_ID,),
            )
        conn.close()

        filepath = f"report_{rtype}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        df.to_csv(filepath, index=False)
        return _ok({"status": "generated", "file": filepath, "rows": len(df),
                    "report_type": rtype, "period": f"{start} to {end}"})
    except Exception as exc:
        return _err(str(exc))


@tool("get_debt_payoff_plan")
def get_debt_payoff_plan(input: str = "") -> str:
    """
    Calculate debt payoff timelines using Avalanche (lowest interest cost) and
    Snowball (smallest balance first) methods.

    Input JSON: {"debts": [{"name": "...", "balance": N, "interest_rate": 0.22,
                             "min_payment": N}], "extra_monthly_payment": 200}
    Returns: both methods with months, interest paid, and savings comparison.
    """
    try:
        p = _parse(input)
        debts: list[dict] = p.get("debts", [
            {"name": "Credit Card", "balance": 2340.50, "interest_rate": 0.22, "min_payment": 70},
            {"name": "Student Loan", "balance": 15000, "interest_rate": 0.065, "min_payment": 180},
        ])
        extra = float(p.get("extra_monthly_payment", 200))

        def simulate(sorted_debts: list[dict], extra_payment: float):
            d = [dict(row) for row in sorted_debts]
            month = 0
            total_interest = 0.0
            while any(row["balance"] > 0 for row in d) and month < 360:
                month += 1
                extra_rem = extra_payment
                for i, row in enumerate(d):
                    if row["balance"] <= 0:
                        continue
                    monthly_interest = row["balance"] * (row["interest_rate"] / 12)
                    total_interest += monthly_interest
                    row["balance"] += monthly_interest
                    payment = row["min_payment"] + (extra_rem if i == 0 else 0)
                    payment = min(payment, row["balance"])
                    row["balance"] = max(0.0, row["balance"] - payment)
                    if i == 0 and row["balance"] == 0 and i + 1 < len(d):
                        extra_rem += row["min_payment"]
            return month, round(total_interest, 2)

        avalanche = sorted(debts, key=lambda x: x["interest_rate"], reverse=True)
        snowball = sorted(debts, key=lambda x: x["balance"])
        av_months, av_interest = simulate(avalanche, extra)
        sw_months, sw_interest = simulate(snowball, extra)

        return _ok({
            "total_debt": round(sum(d["balance"] for d in debts), 2),
            "extra_monthly_payment": extra,
            "avalanche_method": {
                "order": [d["name"] for d in avalanche],
                "months_to_payoff": av_months,
                "total_interest_paid": av_interest,
                "description": "Pay highest-interest debt first (saves the most money).",
            },
            "snowball_method": {
                "order": [d["name"] for d in snowball],
                "months_to_payoff": sw_months,
                "total_interest_paid": sw_interest,
                "description": "Pay smallest balance first (builds momentum).",
            },
            "interest_savings_with_avalanche": round(sw_interest - av_interest, 2),
        })
    except Exception as exc:
        return _err(str(exc))
