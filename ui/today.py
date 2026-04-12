"""
ui/today.py — Today tab for orryon.

Designed as a daily ritual page:
  1. Breathing widget  (top — always there, starts immediately)
  2. Today's schedule  (events + tasks due today)
  3. Spending today    (transactions logged today)
  4. Goals snapshot    (active goals, brief progress)

The page is intentionally read-only so Streamlit reruns never interrupt the
breathing animation mid-session.
"""
from __future__ import annotations

from datetime import datetime, date

import streamlit as st

from db import get_connection, get_balance
from ui.breathe import render_breathe_widget


# ─────────────────────────────────────────────────────────────────────────────
# CSS
# ─────────────────────────────────────────────────────────────────────────────

_TODAY_CSS = """<style>
.td-section-label {
  font-size: .65rem; text-transform: uppercase; letter-spacing: 2px;
  color: rgba(255,255,255,.22); margin: 1.5rem 0 .6rem;
}
.td-row {
  display: flex; align-items: center; gap: .65rem;
  padding: .5rem 0; border-bottom: 1px solid rgba(255,255,255,.05);
  font-size: .85rem;
}
.td-row:last-child { border-bottom: none; }
.td-row-title { color: #e2e8f0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-row-meta  { color: rgba(255,255,255,.30); font-size: .74rem; flex-shrink: 0; }
.td-row-amt   { color: #fff; font-weight: 600; flex-shrink: 0; }
.td-empty     { font-size: .82rem; color: rgba(255,255,255,.25); padding: .4rem 0; }

.td-card {
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 14px; padding: .9rem 1.1rem; margin-bottom: .6rem;
}

/* goal mini strip */
.td-goal-bar-bg { background: rgba(255,255,255,.08); border-radius: 4px; height: 5px; margin-top: 5px; }
.td-goal-bar    { height: 5px; border-radius: 4px; }
</style>"""


# ─────────────────────────────────────────────────────────────────────────────
# Main renderer
# ─────────────────────────────────────────────────────────────────────────────

def render_today(user_id: str) -> None:
    st.markdown(_TODAY_CSS, unsafe_allow_html=True)

    # ── Greeting ──────────────────────────────────────────────────────────────
    now       = datetime.now()
    hour      = now.hour
    day_str   = now.strftime("%A, %B %-d")

    if hour < 12:
        greeting, emoji = "Good morning", "🌅"
    elif hour < 17:
        greeting, emoji = "Good afternoon", "☀️"
    else:
        greeting, emoji = "Good evening", "🌙"

    display_name = st.session_state.get("display_name", "").split()[0] if st.session_state.get("display_name") else ""
    name_part    = f", {display_name}" if display_name else ""

    st.markdown(
        f'<div style="margin-bottom:1.2rem;">'
        f'<div style="font-size:.72rem;color:rgba(255,255,255,.28);letter-spacing:1px;margin-bottom:.2rem;">'
        f'{emoji} {day_str}</div>'
        f'<div style="font-size:1.3rem;font-weight:700;color:#fff;">'
        f'{greeting}{name_part}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    # ── Breathing widget (the centrepiece) ────────────────────────────────────
    _stress_label = _get_stress_label(user_id, now)
    render_breathe_widget(widget_id="today", label=_stress_label)

    # ── Today's schedule ──────────────────────────────────────────────────────
    st.markdown('<div class="td-section-label">Today\'s Schedule</div>', unsafe_allow_html=True)
    _render_schedule(user_id, now)

    # ── Spending today ────────────────────────────────────────────────────────
    st.markdown('<div class="td-section-label">Spending Today</div>', unsafe_allow_html=True)
    _render_spending_today(user_id, now)

    # ── Goals snapshot ────────────────────────────────────────────────────────
    st.markdown('<div class="td-section-label">Goals</div>', unsafe_allow_html=True)
    _render_goals_snapshot(user_id)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_stress_label(user_id: str, now: datetime) -> str:
    """Return a context-aware subtitle for the breathing widget."""
    month_str = now.strftime("%Y-%m")
    conn = get_connection()
    over = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM   budget_categories b
        WHERE  b.user_id = ?
          AND  b.month   = ?
          AND  b.planned > 0
          AND (
            SELECT COALESCE(SUM(t.amount), 0)
            FROM   transactions t
            WHERE  t.user_id  = b.user_id
              AND  t.category = b.category
              AND  t.date LIKE ?
              AND  t.amount   > 0
          ) / b.planned >= 0.90
        """,
        (user_id, month_str, f"{month_str}%"),
    ).fetchone()
    conn.close()

    bal        = get_balance(user_id)
    is_stressed = (over and over["n"] > 0) or bal < 0

    if is_stressed:
        return "Budget pressure showing — a short breathing session helps reset your focus."
    return "Follow the circle — breathe in as it grows, out as it shrinks."


def _render_schedule(user_id: str, now: datetime) -> None:
    today_str = now.strftime("%Y-%m-%d")
    conn = get_connection()
    events = conn.execute(
        "SELECT title, event_time FROM events "
        "WHERE user_id=? AND event_date=? ORDER BY event_time ASC",
        (user_id, today_str),
    ).fetchall()
    tasks = conn.execute(
        "SELECT title, priority FROM action_items "
        "WHERE user_id=? AND status='open' AND (due_date=? OR due_date='') "
        "ORDER BY priority DESC, created_at ASC LIMIT 5",
        (user_id, today_str),
    ).fetchall()
    conn.close()

    _PRI_COLOR = {"high": "#ef4444", "medium": "#f59e0b", "low": "#64748b"}

    if not events and not tasks:
        st.markdown('<div class="td-empty">Nothing scheduled for today — enjoy the breathing.</div>', unsafe_allow_html=True)
        return

    html = '<div class="td-card">'
    for e in events:
        time_str = e["event_time"][:5] if e["event_time"] else ""
        html += (
            f'<div class="td-row">'
            f'<span>📅</span>'
            f'<span class="td-row-title">{e["title"]}</span>'
            f'<span class="td-row-meta">{time_str}</span>'
            f'</div>'
        )
    for t in tasks:
        pri   = t["priority"] or "medium"
        color = _PRI_COLOR.get(pri, "#64748b")
        html += (
            f'<div class="td-row">'
            f'<span style="color:{color}">✅</span>'
            f'<span class="td-row-title">{t["title"]}</span>'
            f'<span class="td-row-meta" style="color:{color};font-size:.7rem;">{pri}</span>'
            f'</div>'
        )
    html += '</div>'
    st.markdown(html, unsafe_allow_html=True)


def _render_spending_today(user_id: str, now: datetime) -> None:
    today_str = now.strftime("%Y-%m-%d")
    conn = get_connection()
    rows = conn.execute(
        "SELECT merchant, amount, category FROM transactions "
        "WHERE user_id=? AND date=? AND amount>0 ORDER BY rowid DESC LIMIT 8",
        (user_id, today_str),
    ).fetchall()
    total_row = conn.execute(
        "SELECT COALESCE(SUM(amount),0) AS total FROM transactions "
        "WHERE user_id=? AND date=? AND amount>0",
        (user_id, today_str),
    ).fetchone()
    conn.close()

    total = float(total_row["total"]) if total_row else 0.0

    if not rows:
        st.markdown('<div class="td-empty">No spending logged yet today.</div>', unsafe_allow_html=True)
        return

    html = '<div class="td-card">'
    for r in rows:
        html += (
            f'<div class="td-row">'
            f'<span class="td-row-title">{r["merchant"]}</span>'
            f'<span class="td-row-meta">{r["category"] or ""}</span>'
            f'<span class="td-row-amt">−${float(r["amount"]):,.2f}</span>'
            f'</div>'
        )
    if total > 0:
        html += (
            f'<div style="text-align:right;font-size:.75rem;color:rgba(255,255,255,.28);'
            f'margin-top:.5rem;">Today\'s total: ${total:,.2f}</div>'
        )
    html += '</div>'
    st.markdown(html, unsafe_allow_html=True)


def _render_goals_snapshot(user_id: str) -> None:
    conn = get_connection()
    rows = conn.execute(
        "SELECT name, target_amount, current_amount, category FROM goals "
        "WHERE user_id=? AND is_completed=0 ORDER BY created_at DESC LIMIT 4",
        (user_id,),
    ).fetchall()
    conn.close()

    if not rows:
        st.markdown(
            '<div class="td-empty">No active goals — ask orryon to set one.</div>',
            unsafe_allow_html=True,
        )
        return

    _CAT_EMOJI = {
        "emergency": "🛡️", "vacation": "✈️", "house": "🏠",
        "retirement": "🌅", "education": "🎓", "investment": "📈",
        "debt_payoff": "💳", "vehicle": "🚗", "gadget": "💻",
        "wedding": "💍", "other": "🎯",
    }

    html = '<div class="td-card">'
    for g in rows:
        target  = float(g["target_amount"])
        current = float(g["current_amount"])
        pct     = min(100.0, round(current / target * 100, 1)) if target > 0 else 0
        color   = "#22c55e" if pct >= 75 else "#4ade80" if pct >= 40 else "#86efac"
        emoji   = _CAT_EMOJI.get(g["category"] or "other", "🎯")
        width   = max(2, pct)
        html += (
            f'<div style="padding:.45rem 0;border-bottom:1px solid rgba(255,255,255,.05);">'
            f'<div style="display:flex;justify-content:space-between;font-size:.83rem;margin-bottom:4px;">'
            f'<span style="color:#e2e8f0;">{emoji} {g["name"]}</span>'
            f'<span style="color:{color};font-weight:700;">{pct:.0f}%</span>'
            f'</div>'
            f'<div class="td-goal-bar-bg">'
            f'<div class="td-goal-bar" style="width:{width}%;background:{color};"></div>'
            f'</div>'
            f'</div>'
        )
    html += '</div>'
    st.markdown(html, unsafe_allow_html=True)
