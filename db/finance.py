"""
db.finance — Balance account, recurring income, net worth.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from db.connection import get_connection
from db.crud import insert_row, update_row

logger = logging.getLogger(__name__)


def get_or_create_balance_account(user_id: str) -> dict:
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM accounts WHERE user_id=? AND name='Balance' LIMIT 1",
            (user_id,),
        ).fetchone()
        conn.close()
        if row:
            return dict(row)
    except Exception as exc:
        logger.error("get_or_create_balance_account lookup: %s", exc)

    account = {
        "id": str(uuid.uuid4()), "user_id": user_id, "name": "Balance",
        "type": "checking", "institution": "", "balance": 0.0,
        "currency": "USD", "last_updated": datetime.now(timezone.utc).isoformat(),
        "metadata": "",
    }
    insert_row("accounts", account)
    return account


def get_balance(user_id: str) -> float:
    acct = get_or_create_balance_account(user_id)
    return float(acct.get("balance", 0))


def update_balance(user_id: str, new_balance: float) -> bool:
    acct = get_or_create_balance_account(user_id)
    return update_row(
        "accounts",
        {"balance": new_balance, "last_updated": datetime.now(timezone.utc).isoformat()},
        {"id": acct["id"]},
    )


def adjust_balance(user_id: str, delta: float) -> float:
    acct = get_or_create_balance_account(user_id)
    new_bal = float(acct["balance"]) + delta
    update_row(
        "accounts",
        {"balance": new_bal, "last_updated": datetime.now(timezone.utc).isoformat()},
        {"id": acct["id"]},
    )
    return new_bal


# ── Recurring income helpers ───────────────────────────────────────────────

def get_recurring_income(user_id: str) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM recurring_income WHERE user_id=? AND is_active=1 ORDER BY amount DESC",
            (user_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error("get_recurring_income error: %s", exc)
        return []


def get_total_monthly_income(user_id: str) -> float:
    sources = get_recurring_income(user_id)
    total = 0.0
    for s in sources:
        amt = float(s["amount"])
        freq = (s.get("frequency") or "monthly").lower()
        if freq == "weekly":
            total += amt * 4.33
        elif freq == "biweekly":
            total += amt * 2.167
        elif freq == "yearly":
            total += amt / 12
        else:
            total += amt
    return total


# ── Net worth snapshot helpers ────────────────────────────────────────────

def snapshot_net_worth(user_id: str) -> bool:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        conn = get_connection()
        existing = conn.execute(
            "SELECT id FROM net_worth_snapshots WHERE user_id=? AND snapshot_date=?",
            (user_id, today),
        ).fetchone()
        if existing:
            conn.close()
            return False

        assets = conn.execute(
            "SELECT SUM(balance) as total FROM accounts WHERE user_id=? AND balance>0",
            (user_id,),
        ).fetchone()
        liabs = conn.execute(
            "SELECT ABS(SUM(balance)) as total FROM accounts WHERE user_id=? AND balance<0",
            (user_id,),
        ).fetchone()
        conn.close()

        total_assets = float(assets["total"] or 0) if assets else 0
        total_liabs = float(liabs["total"] or 0) if liabs else 0
        nw = total_assets - total_liabs

        return insert_row("net_worth_snapshots", {
            "id": str(uuid.uuid4()), "user_id": user_id,
            "total_assets": total_assets, "total_liabilities": total_liabs,
            "net_worth": nw, "snapshot_date": today,
        })
    except Exception as exc:
        logger.error("snapshot_net_worth error: %s", exc)
        return False


def get_nw_history(user_id: str, limit: int = 90) -> list[dict]:
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM net_worth_snapshots WHERE user_id=? ORDER BY snapshot_date DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        conn.close()
        return [dict(r) for r in reversed(rows)]
    except Exception as exc:
        logger.error("get_nw_history error: %s", exc)
        return []


# ── API spend tracking ────────────────────────────────────────────────────────
