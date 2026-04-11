"""
ui/forecast.py — Forecast tab.

Shows:
  - 6-month cash flow projection chart
  - Net worth projection chart
  - What-if scenario sliders
"""

from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import plotly.graph_objects as go
import streamlit as st

from db import fetch_rows, get_connection, get_total_monthly_income


def render_forecast(user_id: str) -> None:
    st.markdown("""
<style>
.forecast-card {
  background: #131320; border-radius: 12px; padding: 1rem 1.2rem;
  margin-bottom: 1rem; border: 1px solid rgba(255,255,255,0.06);
}
.scenario-label {
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
  color: #475569; margin: 1.2rem 0 0.6rem; font-weight: 600;
}
</style>
""", unsafe_allow_html=True)

    # ── Fetch base data ───────────────────────────────────────────────────────
    now = datetime.now()
    month_str = now.strftime("%Y-%m")

    conn = get_connection()
    # Avg monthly income (last 2 months)
    income_rows = conn.execute(
        "SELECT ABS(SUM(amount)) / 2.0 as avg_income FROM transactions "
        "WHERE user_id=? AND amount<0 AND date>=?",
        (user_id, (now - timedelta(days=60)).strftime("%Y-%m-%d")),
    ).fetchone()
    # Avg monthly expenses (last 2 months)
    expense_rows = conn.execute(
        "SELECT SUM(amount) / 2.0 as avg_expense FROM transactions "
        "WHERE user_id=? AND amount>0 AND date>=?",
        (user_id, (now - timedelta(days=60)).strftime("%Y-%m-%d")),
    ).fetchone()
    # Current liquid balance
    liquid = conn.execute(
        "SELECT SUM(balance) as total FROM accounts "
        "WHERE user_id=? AND type IN ('checking', 'savings') AND balance>0",
        (user_id,),
    ).fetchone()
    # Total assets
    all_assets = conn.execute(
        "SELECT SUM(balance) as total FROM accounts WHERE user_id=? AND balance>0",
        (user_id,),
    ).fetchone()
    all_liabs = conn.execute(
        "SELECT ABS(SUM(balance)) as total FROM accounts WHERE user_id=? AND balance<0",
        (user_id,),
    ).fetchone()
    # Recurring bills
    bills = conn.execute(
        "SELECT SUM(amount) as total FROM subscriptions WHERE user_id=? AND is_active=1",
        (user_id,),
    ).fetchone()
    conn.close()

    # Prefer recurring_income table, fall back to transaction-based estimate
    _recurring_monthly = get_total_monthly_income(user_id)
    avg_income = _recurring_monthly if _recurring_monthly > 0 else float(income_rows["avg_income"] or 5000)
    avg_expense = float(expense_rows["avg_expense"] or 3000)
    current_liquid = float(liquid["total"] or 4000)
    total_assets = float(all_assets["total"] or 0)
    total_liabs = float(all_liabs["total"] or 0)
    net_worth_now = total_assets - total_liabs
    monthly_bills = float(bills["total"] or 0)

    # ── Horizon selector ─────────────────────────────────────────────────────
    horizon = st.select_slider(
        "Projection horizon",
        options=[3, 6, 9, 12],
        value=6,
        format_func=lambda x: f"{x} months",
    )

    # ── Cash Flow Chart ───────────────────────────────────────────────────────
    st.markdown("#### 💵 Cash Flow Projection")
    _render_cashflow(avg_income, avg_expense, current_liquid, horizon, now)

    st.divider()

    # ── Net Worth Projection ──────────────────────────────────────────────────
    st.markdown("#### 📈 Net Worth Projection")
    _render_nw_projection(net_worth_now, avg_income, avg_expense, horizon, now)

    st.divider()

    # ── What-If Scenarios ─────────────────────────────────────────────────────
    st.markdown("#### 🔮 What-If Scenarios")
    st.caption("Adjust assumptions to see how they affect your financial outlook.")

    with st.expander("Adjust scenario assumptions", expanded=True):
        col1, col2 = st.columns(2)
        with col1:
            s_income = st.slider(
                "Monthly income ($)",
                min_value=1000, max_value=20000,
                value=int(avg_income), step=100,
                key="sc_income",
            )
            s_expense = st.slider(
                "Monthly expenses ($)",
                min_value=500, max_value=15000,
                value=int(avg_expense), step=100,
                key="sc_expense",
            )
        with col2:
            s_savings_rate = st.slider(
                "Extra monthly savings ($)",
                min_value=0, max_value=5000,
                value=0, step=50,
                key="sc_save",
            )
            s_invest_return = st.slider(
                "Annual investment return (%)",
                min_value=0.0, max_value=15.0,
                value=7.0, step=0.5,
                key="sc_return",
            )

    # Scenario results
    monthly_savings = s_income - s_expense + s_savings_rate
    monthly_invest_gain = (net_worth_now * (s_invest_return / 100)) / 12
    projected_nw_12m = net_worth_now + (monthly_savings + monthly_invest_gain) * horizon

    sc1, sc2, sc3 = st.columns(3)
    sc1.metric("Monthly Net Save", f"${monthly_savings:,.0f}",
               delta=f"${monthly_savings - (avg_income - avg_expense):,.0f} vs now")
    sc2.metric(f"NW in {horizon}m", f"${projected_nw_12m:,.0f}",
               delta=f"${projected_nw_12m - net_worth_now:,.0f}")
    sc3.metric("Annual Savings Rate",
               f"{max(monthly_savings / s_income * 100, 0):.0f}%" if s_income else "—")

    st.markdown(
        '<p style="font-size:0.68rem;color:#475569;text-align:center;margin-top:1rem">'
        'orryon is for informational purposes only — not financial advice. '
        'Projections are estimates based on your data and assumptions.</p>',
        unsafe_allow_html=True,
    )


def _render_cashflow(
    avg_income: float,
    avg_expense: float,
    current_liquid: float,
    horizon: int,
    now: datetime,
) -> None:
    months = []
    balances = []
    incomes = []
    expenses = []
    balance = current_liquid

    for i in range(horizon + 1):
        m = (now.replace(day=1) + timedelta(days=32 * i))
        months.append(m.strftime("%b %Y"))
        if i > 0:
            balance = balance + avg_income - avg_expense
        balances.append(round(balance, 2))
        incomes.append(avg_income)
        expenses.append(avg_expense)

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=months, y=balances,
        name="Projected Balance",
        line=dict(color="#00c9ff", width=2.5),
        fill="tozeroy", fillcolor="rgba(0,201,255,0.06)",
        hovertemplate="<b>%{x}</b><br>$%{y:,.0f}<extra></extra>",
    ))
    fig.add_trace(go.Bar(
        x=months[1:], y=incomes[1:],
        name="Est. Income", marker_color="rgba(146,254,157,0.4)",
        hovertemplate="<b>Income %{x}</b><br>$%{y:,.0f}<extra></extra>",
    ))
    fig.add_trace(go.Bar(
        x=months[1:], y=[-e for e in expenses[1:]],
        name="Est. Expenses", marker_color="rgba(239,68,68,0.35)",
        hovertemplate="<b>Expenses %{x}</b><br>$%{y:,.0f}<extra></extra>",
    ))
    fig.update_layout(
        height=280, barmode="relative",
        margin=dict(l=0, r=0, t=10, b=30),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#94a3b8", size=11),
        legend=dict(orientation="h", y=1.08),
        xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
        yaxis=dict(gridcolor="rgba(255,255,255,0.05)", tickprefix="$"),
    )
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})


def _render_nw_projection(
    net_worth_now: float,
    avg_income: float,
    avg_expense: float,
    horizon: int,
    now: datetime,
) -> None:
    monthly_save = avg_income - avg_expense
    # 7% annual return = ~0.565% monthly
    monthly_return = 0.00565

    months = []
    nw_base = []
    nw_optimistic = []
    nw_conservative = []
    nw = net_worth_now

    for i in range(horizon + 1):
        m = (now.replace(day=1) + timedelta(days=32 * i))
        months.append(m.strftime("%b %Y"))
        nw_base.append(round(nw, 2))
        nw_optimistic.append(round(net_worth_now + (monthly_save * 1.2 + net_worth_now * monthly_return * 1.2) * i, 2))
        nw_conservative.append(round(net_worth_now + (monthly_save * 0.7 + net_worth_now * monthly_return * 0.5) * i, 2))
        nw += monthly_save + nw * monthly_return

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=months, y=nw_optimistic, name="Optimistic",
        line=dict(color="#22c55e", width=1.5, dash="dot"),
        hovertemplate="<b>Optimistic %{x}</b><br>$%{y:,.0f}<extra></extra>",
    ))
    fig.add_trace(go.Scatter(
        x=months, y=nw_base, name="Base Case",
        line=dict(color="#00c9ff", width=2.5),
        fill="tonexty", fillcolor="rgba(0,201,255,0.04)",
        hovertemplate="<b>Base %{x}</b><br>$%{y:,.0f}<extra></extra>",
    ))
    fig.add_trace(go.Scatter(
        x=months, y=nw_conservative, name="Conservative",
        line=dict(color="#f59e0b", width=1.5, dash="dot"),
        fill="tonexty", fillcolor="rgba(245,158,11,0.03)",
        hovertemplate="<b>Conservative %{x}</b><br>$%{y:,.0f}<extra></extra>",
    ))
    fig.update_layout(
        height=280, margin=dict(l=0, r=0, t=10, b=30),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#94a3b8", size=11),
        legend=dict(orientation="h", y=1.08),
        xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
        yaxis=dict(gridcolor="rgba(255,255,255,0.05)", tickprefix="$"),
    )
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
