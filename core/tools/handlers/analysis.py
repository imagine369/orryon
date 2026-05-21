"""Tool handlers — analysis."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

from db import (
    delete_row, fetch_rows, get_connection, insert_row, update_row, get_balance, adjust_balance, update_balance, get_or_create_balance_account
)
from core.tools.shared import (
    _current_month
)

logger = logging.getLogger(__name__)

from core.tools.handlers.balance import (
    _get_balance,
    _get_budget_status,
    _get_money_left_after_goals,
    _get_spending_summary,
)
from core.tools.handlers.bills import _get_bills
from core.tools.handlers.calendar import _get_upcoming_schedule
from core.tools.handlers.expenses import _get_expenses, _get_spending_patterns
from core.tools.handlers.goals import _get_goals
from core.tools.handlers.notes import _get_journal

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
def _generate_insights(args: dict, user_id: str) -> dict:
    """Composite analytical view combining spending, budget, patterns, goals, and wellness."""
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
        if "wellness" in scope:
            result["sections"]["wellness"] = _get_wellness_history(
                {"date_from": date_range.get("from"), "date_to": date_range.get("to")},
                user_id,
            )
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
def _get_wellness_history(args: dict, user_id: str) -> dict:
    """Return reset-session completions, mood pre/post trends, and streak data."""
    now = datetime.now()
    date_from = args.get("date_from") or (now - timedelta(days=30)).strftime("%Y-%m-%d")
    date_to = args.get("date_to") or now.strftime("%Y-%m-%d")
    anchor_filter = args.get("anchor_id", "")
    include_streaks = args.get("include_streaks", True)

    conn = get_connection()
    sql = (
        "SELECT * FROM reset_completions "
        "WHERE user_id=? AND date_key>=? AND date_key<=?"
    )
    params: list = [user_id, date_from, date_to]
    if anchor_filter:
        sql += " AND anchor_id=?"
        params.append(anchor_filter)
    sql += " ORDER BY date_key ASC"
    completions = conn.execute(sql, tuple(params)).fetchall()

    total_sessions = len(completions)
    total_duration = 0
    moods_pre: list[str] = []
    moods_post: list[str] = []
    for c in completions:
        c = dict(c) if not isinstance(c, dict) else c
        total_duration += int(c.get("duration") or 0)
        if c.get("pre_mood"):
            moods_pre.append(c["pre_mood"])
        if c.get("post_mood"):
            moods_post.append(c["post_mood"])

    def _mood_summary(moods: list[str]) -> dict:
        if not moods:
            return {}
        from collections import Counter
        counts = Counter(moods)
        return {mood: cnt for mood, cnt in counts.most_common()}

    result: dict = {
        "status": "ok",
        "date_from": date_from,
        "date_to": date_to,
        "total_sessions": total_sessions,
        "total_duration_min": total_duration,
        "avg_duration_min": round(total_duration / max(total_sessions, 1), 1),
        "pre_mood_distribution": _mood_summary(moods_pre),
        "post_mood_distribution": _mood_summary(moods_post),
        "sessions": [
            {
                "date": (dict(c) if not isinstance(c, dict) else c).get("date_key"),
                "anchor_id": (dict(c) if not isinstance(c, dict) else c).get("anchor_id"),
                "duration": (dict(c) if not isinstance(c, dict) else c).get("duration"),
                "pre_mood": (dict(c) if not isinstance(c, dict) else c).get("pre_mood"),
                "post_mood": (dict(c) if not isinstance(c, dict) else c).get("post_mood"),
                "note": (dict(c) if not isinstance(c, dict) else c).get("note"),
            }
            for c in completions[:50]
        ],
    }

    if include_streaks:
        streaks = conn.execute(
            "SELECT s.id, s.name, s.emoji, s.target_days, "
            "  (SELECT COUNT(*) FROM streak_days sd WHERE sd.streak_id=s.id) as total_days, "
            "  (SELECT MAX(sd.date_key) FROM streak_days sd WHERE sd.streak_id=s.id) as last_day "
            "FROM streaks s WHERE s.user_id=?",
            (user_id,),
        ).fetchall()
        streak_list = []
        for s in streaks:
            s = dict(s) if not isinstance(s, dict) else s
            last_day = s.get("last_day", "")
            is_active = last_day == now.strftime("%Y-%m-%d") or last_day == (now - timedelta(days=1)).strftime("%Y-%m-%d")
            streak_list.append({
                "name": s["name"],
                "emoji": s.get("emoji", ""),
                "total_days": s.get("total_days", 0),
                "target_days": s.get("target_days"),
                "last_day": last_day,
                "is_active": is_active,
            })
        result["streaks"] = streak_list

    conn.close()
    return result
def _compare_periods(args: dict, user_id: str) -> dict:
    """Compare two time periods across spending, wellness, journal mood, or streaks."""
    scope = args["scope"]
    pa_from, pa_to = args["period_a_from"], args["period_a_to"]
    pb_from, pb_to = args["period_b_from"], args["period_b_to"]
    category = args.get("category", "")

    conn = get_connection()

    if scope == "spending":
        def _spend(d_from: str, d_to: str) -> dict:
            sql = "SELECT category, SUM(amount) as total, COUNT(*) as cnt FROM transactions WHERE user_id=? AND date>=? AND date<=? AND amount>0"
            p: list = [user_id, d_from, d_to]
            if category:
                sql += " AND category=?"
                p.append(category)
            sql += " GROUP BY category"
            rows = conn.execute(sql, tuple(p)).fetchall()
            total = sum(float(r["total"]) for r in rows)
            by_cat = {r["category"]: round(float(r["total"]), 2) for r in rows}
            return {"total": round(total, 2), "by_category": by_cat, "txn_count": sum(r["cnt"] for r in rows)}
        a = _spend(pa_from, pa_to)
        b = _spend(pb_from, pb_to)
        diff = round(b["total"] - a["total"], 2)
        pct = round((diff / a["total"] * 100) if a["total"] > 0 else 0, 1)
        conn.close()
        return {"scope": "spending", "period_a": {"from": pa_from, "to": pa_to, **a}, "period_b": {"from": pb_from, "to": pb_to, **b}, "change": diff, "change_pct": pct}

    if scope == "wellness":
        def _well(d_from: str, d_to: str) -> dict:
            rows = conn.execute(
                "SELECT COUNT(*) as cnt, COALESCE(SUM(duration),0) as dur FROM reset_completions WHERE user_id=? AND date_key>=? AND date_key<=?",
                (user_id, d_from, d_to),
            ).fetchone()
            return {"sessions": rows["cnt"], "total_duration_min": int(rows["dur"])}
        a = _well(pa_from, pa_to)
        b = _well(pb_from, pb_to)
        conn.close()
        return {"scope": "wellness", "period_a": {"from": pa_from, "to": pa_to, **a}, "period_b": {"from": pb_from, "to": pb_to, **b}, "session_change": b["sessions"] - a["sessions"], "duration_change": b["total_duration_min"] - a["total_duration_min"]}

    if scope == "journal_mood":
        from collections import Counter
        def _moods(d_from: str, d_to: str) -> dict:
            rows = conn.execute(
                "SELECT mood FROM notes WHERE user_id=? AND is_journal=1 AND (entry_date>=? OR created_at>=?) AND (entry_date<=? OR created_at<=?)",
                (user_id, d_from, d_from, d_to, d_to),
            ).fetchall()
            moods = [r["mood"] for r in rows if r["mood"]]
            return {"entry_count": len(rows), "mood_distribution": dict(Counter(moods))}
        a = _moods(pa_from, pa_to)
        b = _moods(pb_from, pb_to)
        conn.close()
        return {"scope": "journal_mood", "period_a": {"from": pa_from, "to": pa_to, **a}, "period_b": {"from": pb_from, "to": pb_to, **b}}

    if scope == "streaks":
        def _streak_days(d_from: str, d_to: str) -> dict:
            rows = conn.execute(
                "SELECT s.name, COUNT(sd.id) as days FROM streak_days sd "
                "JOIN streaks s ON s.id=sd.streak_id "
                "WHERE sd.user_id=? AND sd.date_key>=? AND sd.date_key<=? "
                "GROUP BY s.name",
                (user_id, d_from, d_to),
            ).fetchall()
            return {"by_streak": {r["name"]: r["days"] for r in rows}, "total_days": sum(r["days"] for r in rows)}
        a = _streak_days(pa_from, pa_to)
        b = _streak_days(pb_from, pb_to)
        conn.close()
        return {"scope": "streaks", "period_a": {"from": pa_from, "to": pa_to, **a}, "period_b": {"from": pb_from, "to": pb_to, **b}, "day_change": b["total_days"] - a["total_days"]}

    conn.close()
    return {"status": "error", "message": f"Unknown scope: {scope}"}
def _cross_feature_search(args: dict, user_id: str) -> dict:
    """Unified search across journal, notes, transactions, events, lists, and goals."""
    query = (args.get("query") or "").lower()
    if not query:
        return {"status": "error", "message": "query is required."}
    features = set(args.get("features") or ["journal", "notes", "transactions", "events", "lists", "goals"])
    try:
        limit = int(args.get("limit") or 10)
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 50))

    conn = get_connection()
    results: dict = {"status": "ok", "query": query, "features": {}}

    if "journal" in features:
        rows = conn.execute(
            "SELECT id, title, content, mood, entry_date, created_at FROM notes "
            "WHERE user_id=? AND is_journal=1 AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?) "
            "ORDER BY COALESCE(entry_date, created_at) DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["journal"] = [
            {"id": r["id"], "title": r["title"], "preview": (r["content"] or "")[:200], "mood": r["mood"], "date": r["entry_date"] or r["created_at"]}
            for r in rows
        ]

    if "notes" in features:
        rows = conn.execute(
            "SELECT id, title, content, tags, updated_at FROM notes "
            "WHERE user_id=? AND (is_journal=0 OR is_journal IS NULL) AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?) "
            "ORDER BY updated_at DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["notes"] = [
            {"id": r["id"], "title": r["title"], "preview": (r["content"] or "")[:200], "tags": r["tags"], "updated_at": r["updated_at"]}
            for r in rows
        ]

    if "transactions" in features:
        rows = conn.execute(
            "SELECT id, merchant, amount, date, category, description FROM transactions "
            "WHERE user_id=? AND (LOWER(merchant) LIKE ? OR LOWER(category) LIKE ? OR LOWER(description) LIKE ?) "
            "ORDER BY date DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["transactions"] = [
            {"id": r["id"], "merchant": r["merchant"], "amount": float(r["amount"]), "date": r["date"], "category": r["category"]}
            for r in rows
        ]

    if "events" in features:
        rows = conn.execute(
            "SELECT id, title, event_date, event_type, notes FROM events "
            "WHERE user_id=? AND (LOWER(title) LIKE ? OR LOWER(notes) LIKE ?) "
            "ORDER BY event_date DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["events"] = [
            {"id": r["id"], "title": r["title"], "date": r["event_date"], "type": r.get("event_type", "")}
            for r in rows
        ]

    if "lists" in features:
        rows = conn.execute(
            "SELECT li.id, li.name, li.is_checked, ul.name as list_name FROM list_items li "
            "JOIN user_lists ul ON ul.id=li.list_id "
            "WHERE li.user_id=? AND LOWER(li.name) LIKE ? "
            "ORDER BY li.sort_order ASC LIMIT ?",
            (user_id, f"%{query}%", limit),
        ).fetchall()
        results["features"]["lists"] = [
            {"id": r["id"], "item": r["name"], "list": r["list_name"], "checked": bool(r["is_checked"])}
            for r in rows
        ]

    if "goals" in features:
        rows = conn.execute(
            "SELECT id, name, target_amount, current_amount, target_date, category, is_completed FROM goals "
            "WHERE user_id=? AND (LOWER(name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(notes) LIKE ?) "
            "ORDER BY created_at DESC LIMIT ?",
            (user_id, f"%{query}%", f"%{query}%", f"%{query}%", limit),
        ).fetchall()
        results["features"]["goals"] = [
            {"id": r["id"], "name": r["name"], "target": float(r["target_amount"]), "current": float(r["current_amount"]), "category": r["category"], "completed": bool(r["is_completed"])}
            for r in rows
        ]

    conn.close()

    total = sum(len(v) for v in results["features"].values())
    results["total_results"] = total
    return results
