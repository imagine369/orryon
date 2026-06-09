"""Wellness history, period comparison, and cross-feature search."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta

from db import get_connection

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
