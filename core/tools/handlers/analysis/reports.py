"""Subscription and mood-spending analysis handlers."""
from __future__ import annotations

from datetime import datetime, timedelta

from db import get_connection

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
