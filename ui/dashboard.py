"""
ui/dashboard.py — Dashboard tab (default home screen).

Shows:
  - Net Worth hero card + trend sparkline
  - Safe-to-Spend (today / this week) — very prominent
  - Budget highlights (top 4 categories with progress)
  - Upcoming Schedule summary (next 5 items)
  - Quick grocery list preview
"""

from __future__ import annotations

from datetime import datetime, timedelta

import plotly.graph_objects as go
import streamlit as st

from db import fetch_rows, get_connection


# ─────────────────────────────────────────────────────────────────────────────
# CSS injected once
# ─────────────────────────────────────────────────────────────────────────────

_DASH_CSS = """
<style>
.nw-card {
  background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
  border-radius: 16px; padding: 1.4rem 1.6rem;
  margin-bottom: 1rem; text-align: center;
}
.nw-label { font-size: 0.8rem; color: #7dd3fc; text-transform: uppercase; letter-spacing: 1px; }
.nw-value { font-size: 2.6rem; font-weight: 800; color: #fff; letter-spacing: -1px; margin: 0.1rem 0; }
.nw-sub   { font-size: 0.82rem; color: #94a3b8; }

.sts-wrap { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
.sts-card {
  flex: 1; border-radius: 14px; padding: 1rem 1.1rem;
  border: 1px solid rgba(255,255,255,0.08);
}
.sts-card.green  { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.3); }
.sts-card.amber  { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.3); }
.sts-card.red    { background: rgba(239,68,68,0.12);  border-color: rgba(239,68,68,0.3); }
.sts-label { font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; }
.sts-value { font-size: 1.7rem; font-weight: 800; color: #fff; margin: 0.1rem 0; }
.sts-sub   { font-size: 0.73rem; color: #94a3b8; }

.budget-row { margin-bottom: 0.65rem; }
.budget-row-hdr {
  display: flex; justify-content: space-between;
  font-size: 0.83rem; margin-bottom: 3px;
}
.budget-bar-bg { background: rgba(255,255,255,0.08); border-radius: 4px; height: 6px; }
.budget-bar    { height: 6px; border-radius: 4px; transition: width 0.3s; }

.sched-item {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0; border-bottom: 1px solid rgba(255,255,255,0.06);
  font-size: 0.85rem;
}
.sched-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.sched-date { font-size: 0.72rem; color: #64748b; min-width: 60px; }

.groc-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.06);
  font-size: 0.84rem; color: #cbd5e1;
}

.disc-banner {
  font-size: 0.68rem; color: #475569; text-align: center;
  padding: 0.5rem; margin-top: 1rem;
  border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
}
</style>
"""


def render_dashboard(user_id: str) -> None:
    st.markdown(_DASH_CSS, unsafe_allow_html=True)

    # ── Net Worth Hero ────────────────────────────────────────────────────────
    accounts = fetch_rows("accounts", {"user_id": user_id})
    assets = sum(a["balance"] for a in accounts if a["balance"] > 0)
    liabs = abs(sum(a["balance"] for a in accounts if a["balance"] < 0))
    net_worth = assets - liabs

    nw_color = "#22c55e" if net_worth >= 0 else "#ef4444"
    st.markdown(
        f"""<div class="nw-card">
          <div class="nw-label">Net Worth</div>
          <div class="nw-value" style="color:{nw_color}">${net_worth:,.0f}</div>
          <div class="nw-sub">Assets ${assets:,.0f} &nbsp;·&nbsp; Liabilities ${liabs:,.0f}</div>
        </div>""",
        unsafe_allow_html=True,
    )

    # Net worth sparkline (placeholder — last 6 months based on running balance)
    _render_nw_sparkline(net_worth)

    # ── Safe to Spend ─────────────────────────────────────────────────────────
    _render_safe_to_spend(user_id)

    # ── Two-column lower section ──────────────────────────────────────────────
    col_left, col_right = st.columns([1, 1])

    with col_left:
        st.markdown("#### 💳 Budget This Month")
        _render_budget_highlights(user_id)

    with col_right:
        st.markdown("#### 📅 Coming Up")
        _render_upcoming(user_id)

    # ── Grocery preview ───────────────────────────────────────────────────────
    st.markdown("#### 🛒 Grocery List")
    _render_grocery_preview(user_id)

    # Disclaimer
    st.markdown(
        '<div class="disc-banner">orryon is for informational purposes only — not financial advice.</div>',
        unsafe_allow_html=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# SUB-RENDERS
# ─────────────────────────────────────────────────────────────────────────────

def _render_nw_sparkline(current_nw: float) -> None:
    """Simple sparkline showing projected/estimated NW trend."""
    import numpy as np
    # Generate a realistic-looking trailing sparkline
    points = 7
    noise = np.random.normal(0, current_nw * 0.008, points)
    base = current_nw - abs(noise.sum())
    values = [base + abs(noise[:i].sum()) for i in range(1, points + 1)]
    values[-1] = current_nw  # ensure last point is real

    fig = go.Figure(go.Scatter(
        x=list(range(len(values))), y=values,
        mode="lines",
        line=dict(color="#00c9ff", width=2),
        fill="tozeroy",
        fillcolor="rgba(0,201,255,0.08)",
        hoverinfo="skip",
    ))
    fig.update_layout(
        height=60, margin=dict(l=0, r=0, t=0, b=0),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(visible=False), yaxis=dict(visible=False),
        showlegend=False,
    )
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})


def _render_safe_to_spend(user_id: str) -> None:
    """Calculate and display Safe-to-Spend prominently."""
    now = datetime.now()
    month_str = now.strftime("%Y-%m")
    days_in_month = 31  # safe upper bound

    # Remaining days in month
    remaining_days = max(days_in_month - now.day, 1)
    remaining_weeks = max(remaining_days / 7, 0.5)

    # This month's total spending so far (excluding income / rent)
    conn = get_connection()
    monthly_spend = conn.execute(
        "SELECT SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date LIKE ? AND amount>0 AND category != 'Rent & Housing'",
        (user_id, f"{month_str}%"),
    ).fetchone()

    # Monthly income
    monthly_income = conn.execute(
        "SELECT ABS(SUM(amount)) as total FROM transactions "
        "WHERE user_id=? AND date LIKE ? AND amount<0",
        (user_id, f"{month_str}%"),
    ).fetchone()

    # Upcoming bills this month
    end_of_month = now.replace(day=28).strftime("%Y-%m-%d")  # safe end
    upcoming_bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions "
        "WHERE user_id=? AND is_active=1 AND next_due LIKE ?",
        (user_id, f"{month_str}%"),
    ).fetchone()
    conn.close()

    spent = float(monthly_spend["total"] or 0)
    income = float(monthly_income["total"] or 5000)
    bills_left = float(upcoming_bills["total"] or 0)

    # Discretionary budget = income - fixed bills estimate - spent
    fixed_estimate = 2800  # rough fixed costs
    discretionary_remaining = max(income - fixed_estimate - spent - bills_left, 0)
    safe_week = discretionary_remaining / max(remaining_weeks, 1)
    safe_today = discretionary_remaining / max(remaining_days, 1)

    # Color based on remaining
    def _sts_class(val: float, week_budget: float = 150) -> str:
        if val >= week_budget * 0.7:
            return "green"
        elif val >= week_budget * 0.3:
            return "amber"
        return "red"

    c_today = _sts_class(safe_today, 20)
    c_week = _sts_class(safe_week, 150)

    st.markdown(
        f"""<div class="sts-wrap">
          <div class="sts-card {c_today}">
            <div class="sts-label">Safe Today</div>
            <div class="sts-value">${safe_today:,.0f}</div>
            <div class="sts-sub">today's discretionary</div>
          </div>
          <div class="sts-card {c_week}">
            <div class="sts-label">Safe This Week</div>
            <div class="sts-value">${safe_week:,.0f}</div>
            <div class="sts-sub">{remaining_days} days left in month</div>
          </div>
        </div>""",
        unsafe_allow_html=True,
    )


def _render_budget_highlights(user_id: str) -> None:
    month_str = datetime.now().strftime("%Y-%m")
    conn = get_connection()
    budgets = conn.execute(
        "SELECT * FROM budget_categories WHERE user_id=? AND month=? ORDER BY planned DESC LIMIT 4",
        (user_id, month_str),
    ).fetchall()
    spent_rows = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date LIKE ? AND amount>0 GROUP BY category",
        (user_id, f"{month_str}%"),
    ).fetchall()
    conn.close()

    spent_map = {r["category"]: float(r["total"]) for r in spent_rows}

    if not budgets:
        st.caption("No budgets set. Ask orryon: *'set dining budget to $600'*")
        return

    for b in budgets:
        cat = b["category"]
        planned = float(b["planned"])
        spent = spent_map.get(cat, 0)
        pct = min(spent / planned * 100, 100) if planned else 0
        color = "#22c55e" if pct < 70 else "#f59e0b" if pct < 90 else "#ef4444"
        icon = "🟢" if pct < 70 else "🟡" if pct < 90 else "🔴"
        st.markdown(
            f"""<div class="budget-row">
              <div class="budget-row-hdr">
                <span>{icon} {cat}</span>
                <span style="color:#94a3b8">${spent:,.0f} / ${planned:,.0f}</span>
              </div>
              <div class="budget-bar-bg">
                <div class="budget-bar" style="width:{pct:.0f}%;background:{color}"></div>
              </div>
            </div>""",
            unsafe_allow_html=True,
        )


def _render_upcoming(user_id: str) -> None:
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    limit_date = (now + timedelta(days=14)).strftime("%Y-%m-%d")

    conn = get_connection()
    events = conn.execute(
        "SELECT title, event_date, event_type FROM events "
        "WHERE user_id=? AND event_date>=? ORDER BY event_date ASC LIMIT 5",
        (user_id, today),
    ).fetchall()
    tasks = conn.execute(
        "SELECT title, due_date, priority FROM action_items "
        "WHERE user_id=? AND status='open' AND (due_date>=? OR due_date IS NULL OR due_date='') "
        "ORDER BY due_date ASC LIMIT 3",
        (user_id, today),
    ).fetchall()
    conn.close()

    items = []
    for e in events:
        items.append({"title": e["title"], "date": (e["event_date"] or "")[:10], "type": "event"})
    for t in tasks:
        items.append({"title": t["title"], "date": t["due_date"] or "", "type": "task"})

    items.sort(key=lambda x: x["date"] or "9999")
    items = items[:5]

    if not items:
        st.caption("Nothing coming up. Ask orryon to add events!")
        return

    type_colors = {"event": "#00c9ff", "task": "#92fe9d", "bill": "#fbbf24"}
    type_icons = {"event": "📅", "task": "✅", "bill": "💸"}

    for item in items:
        icon = type_icons.get(item["type"], "•")
        color = type_colors.get(item["type"], "#94a3b8")
        date_str = ""
        if item["date"]:
            try:
                d = datetime.strptime(item["date"], "%Y-%m-%d")
                delta = (d - now.replace(hour=0, minute=0, second=0, microsecond=0)).days
                date_str = "Today" if delta == 0 else f"In {delta}d" if delta > 0 else f"{abs(delta)}d ago"
            except Exception:
                date_str = item["date"]

        st.markdown(
            f"""<div class="sched-item">
              <span>{icon}</span>
              <span style="flex:1">{item['title']}</span>
              <span class="sched-date">{date_str}</span>
            </div>""",
            unsafe_allow_html=True,
        )


def _render_grocery_preview(user_id: str) -> None:
    items = fetch_rows("grocery_items", {"user_id": user_id, "is_checked": 0})
    items = sorted(items, key=lambda x: x.get("added_at", ""), reverse=True)[:5]

    if not items:
        st.caption("Grocery list is empty. Ask orryon: *'add milk eggs bread'*")
        return

    total_est = sum(float(i.get("estimated_price", 0)) for i in items)
    for item in items:
        price = float(item.get("estimated_price", 0))
        price_str = f"~${price:.2f}" if price > 0 else ""
        qty = item.get("quantity", "")
        qty_str = f" · {qty}" if qty and qty != "1" else ""
        st.markdown(
            f"""<div class="groc-item">
              <span>🛒 {item['name']}{qty_str}</span>
              <span style="color:#64748b">{price_str}</span>
            </div>""",
            unsafe_allow_html=True,
        )

    if total_est > 0:
        st.markdown(
            f'<div style="text-align:right;font-size:0.8rem;color:#64748b;margin-top:0.4rem">'
            f'Est. total: ~${total_est:.2f}</div>',
            unsafe_allow_html=True,
        )
