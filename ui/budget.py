"""
ui/budget.py — Budget tab.

Shows:
  - Monthly budget vs actual by category
  - Spending chart
  - Transaction table
  - Manual expense entry
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from db import fetch_rows, get_connection, insert_row
from core.tools import _uid, _now_iso


_BUDGET_CSS = """
<style>
.cat-card {
  background: #131320; border-radius: 12px;
  padding: 0.9rem 1rem; margin-bottom: 0.5rem;
  border-left: 3px solid #334155;
}
.cat-card.over { border-left-color: #ef4444; }
.cat-card.warn { border-left-color: #f59e0b; }
.cat-card.good { border-left-color: #22c55e; }
.cat-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
.cat-name { font-weight: 600; font-size: 0.88rem; }
.cat-nums { font-size: 0.8rem; color: #94a3b8; }
.cat-bar-bg { background: rgba(255,255,255,0.07); border-radius: 4px; height: 5px; }
.cat-bar    { height: 5px; border-radius: 4px; }
.section-head {
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
  color: #475569; margin: 1.2rem 0 0.5rem; font-weight: 600;
}
</style>
"""


def render_budget(user_id: str) -> None:
    st.markdown(_BUDGET_CSS, unsafe_allow_html=True)

    # Month selector
    now = datetime.now()
    months = [(now - timedelta(days=30 * i)).strftime("%Y-%m") for i in range(6)]
    month_labels = {m: datetime.strptime(m, "%Y-%m").strftime("%B %Y") for m in months}
    col_sel, _ = st.columns([2, 3])
    with col_sel:
        selected_label = st.selectbox(
            "Month",
            options=list(month_labels.values()),
            index=0,
            label_visibility="collapsed",
        )
    month_str = next(k for k, v in month_labels.items() if v == selected_label)

    # ── Fetch data ────────────────────────────────────────────────────────────
    conn = get_connection()
    budgets = conn.execute(
        "SELECT * FROM budget_categories WHERE user_id=? AND month=? ORDER BY planned DESC",
        (user_id, month_str),
    ).fetchall()
    txns = conn.execute(
        "SELECT * FROM transactions WHERE user_id=? AND date LIKE ? AND amount>0 ORDER BY date DESC",
        (user_id, f"{month_str}%"),
    ).fetchall()
    spent_by_cat = conn.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date LIKE ? AND amount>0 GROUP BY category",
        (user_id, f"{month_str}%"),
    ).fetchall()
    conn.close()

    spent_map = {r["category"]: float(r["total"]) for r in spent_by_cat}
    total_budgeted = sum(float(b["planned"]) for b in budgets)
    total_spent = sum(spent_map.values())

    # ── Summary metrics ───────────────────────────────────────────────────────
    m1, m2, m3 = st.columns(3)
    m1.metric("Total Budgeted", f"${total_budgeted:,.0f}")
    m2.metric("Total Spent", f"${total_spent:,.0f}",
              delta=f"-${total_budgeted - total_spent:,.0f} remaining" if total_budgeted > total_spent else None,
              delta_color="normal")
    over = max(total_spent - total_budgeted, 0)
    m3.metric("Over Budget", f"${over:,.0f}", delta_color="inverse")

    st.divider()

    # ── Spending chart ────────────────────────────────────────────────────────
    if spent_map:
        cats = sorted(spent_map.keys())
        actuals = [round(spent_map.get(c, 0), 2) for c in cats]
        planned_vals = [float(next((b["planned"] for b in budgets if b["category"] == c), 0)) for c in cats]

        fig = go.Figure()
        fig.add_trace(go.Bar(
            name="Spent", x=cats, y=actuals,
            marker_color="#00c9ff", opacity=0.9,
        ))
        fig.add_trace(go.Bar(
            name="Budget", x=cats, y=planned_vals,
            marker_color="rgba(255,255,255,0.12)", opacity=0.9,
        ))
        fig.update_layout(
            barmode="overlay",
            height=220, margin=dict(l=0, r=0, t=10, b=40),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#94a3b8", size=11),
            legend=dict(orientation="h", y=1.1),
            xaxis=dict(tickangle=-30, gridcolor="rgba(255,255,255,0.05)"),
            yaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
        )
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})

    # ── Category breakdown ────────────────────────────────────────────────────
    st.markdown('<div class="section-head">Category Breakdown</div>', unsafe_allow_html=True)

    if not budgets:
        st.info("No budgets set yet. Ask orryon: *'set food budget to $600'*")
    else:
        for b in budgets:
            cat = b["category"]
            planned = float(b["planned"])
            spent = spent_map.get(cat, 0)
            pct = min(spent / planned * 100, 100) if planned else 0
            is_over = spent > planned
            card_cls = "over" if is_over else "warn" if pct >= 80 else "good"
            bar_color = "#ef4444" if is_over else "#f59e0b" if pct >= 80 else "#22c55e"
            remaining_str = (
                f"<span style='color:#ef4444'>+${spent-planned:,.0f} over</span>"
                if is_over
                else f"<span style='color:#64748b'>${planned-spent:,.0f} left</span>"
            )
            st.markdown(
                f"""<div class="cat-card {card_cls}">
                  <div class="cat-hdr">
                    <span class="cat-name">{cat}</span>
                    <span class="cat-nums">${spent:,.0f} / ${planned:,.0f} &nbsp; {remaining_str}</span>
                  </div>
                  <div class="cat-bar-bg">
                    <div class="cat-bar" style="width:{pct:.0f}%;background:{bar_color}"></div>
                  </div>
                </div>""",
                unsafe_allow_html=True,
            )

    # Also show unbudgeted categories that have spending
    budgeted_cats = {b["category"] for b in budgets}
    unbudgeted = {k: v for k, v in spent_map.items() if k not in budgeted_cats and k != "Income"}
    if unbudgeted:
        st.markdown('<div class="section-head">Unbudgeted Spending</div>', unsafe_allow_html=True)
        for cat, spent in sorted(unbudgeted.items(), key=lambda x: -x[1]):
            st.markdown(
                f'<div style="display:flex;justify-content:space-between;padding:0.35rem 0;'
                f'border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.84rem;">'
                f'<span style="color:#94a3b8">⬜ {cat}</span>'
                f'<span>${spent:,.0f}</span></div>',
                unsafe_allow_html=True,
            )

    # ── Transaction list ──────────────────────────────────────────────────────
    st.markdown('<div class="section-head">Transactions</div>', unsafe_allow_html=True)

    if txns:
        df = pd.DataFrame([dict(r) for r in txns[:30]])
        df_display = df[["date", "merchant", "category", "amount"]].rename(columns={
            "date": "Date", "merchant": "Merchant",
            "category": "Category", "amount": "Amount ($)",
        }).copy()
        df_display["Amount ($)"] = df_display["Amount ($)"].apply(lambda x: f"${x:,.2f}")
        st.dataframe(df_display, use_container_width=True, hide_index=True, height=280)

        # CSV export
        col_exp, _ = st.columns([1, 3])
        with col_exp:
            csv_buf = io.StringIO()
            writer = csv.writer(csv_buf)
            writer.writerow(["Date", "Merchant", "Category", "Amount"])
            for r in txns:
                writer.writerow([r["date"], r["merchant"] or "", r["category"] or "", f"{float(r['amount']):.2f}"])
            st.download_button(
                "⬇️ Export CSV",
                data=csv_buf.getvalue(),
                file_name=f"orryon_budget_{month_str}.csv",
                mime="text/csv",
                use_container_width=True,
            )
    else:
        st.caption("No transactions this month.")

    # ── Quick manual entry ────────────────────────────────────────────────────
    st.markdown('<div class="section-head">Quick Add Expense</div>', unsafe_allow_html=True)
    with st.expander("➕ Add expense manually", expanded=False):
        c1, c2 = st.columns(2)
        with c1:
            m_merchant = st.text_input("Merchant", placeholder="e.g. Whole Foods", key="qe_merchant")
            m_amount = st.number_input("Amount ($)", min_value=0.0, step=0.01, key="qe_amount")
        with c2:
            _base_cats = ["Food & Dining", "Groceries", "Transport", "Subscriptions",
                          "Health & Fitness", "Shopping", "Rent & Housing",
                          "Utilities", "Entertainment", "Travel", "Other"]
            _conn_c = get_connection()
            _custom = [r["name"] for r in _conn_c.execute(
                "SELECT name FROM custom_categories WHERE user_id=? AND is_active=1 ORDER BY name", (user_id,)
            ).fetchall()]
            _conn_c.close()
            CATS = _base_cats + _custom
            m_cat = st.selectbox("Category", CATS, key="qe_cat")
            m_date = st.date_input("Date", value=datetime.now().date(), key="qe_date")
        m_notes = st.text_input("Notes (optional)", key="qe_notes")

        if st.button("Add Expense", type="primary", use_container_width=True, key="qe_submit"):
            if m_merchant and m_amount > 0:
                import json as _json
                insert_row("transactions", {
                    "id": _uid(),
                    "user_id": user_id,
                    "date": m_date.strftime("%Y-%m-%d"),
                    "amount": float(m_amount),
                    "merchant": m_merchant,
                    "description": m_merchant,
                    "category": m_cat,
                    "is_recurring": 0,
                    "metadata": _json.dumps({"notes": m_notes}),
                })
                st.success(f"Added ${m_amount:.2f} at {m_merchant} to {m_cat}")
                st.rerun()
            else:
                st.warning("Please enter a merchant name and amount.")

    # ── Spending Recap ────────────────────────────────────────────────────────
    st.markdown('<div class="section-head">Spending Recap</div>', unsafe_allow_html=True)
    with st.expander("📊 Generate a spending recap", expanded=False):
        recap_period = st.selectbox(
            "Period",
            ["this_month", "last_month", "this_week", "last_week"],
            format_func=lambda x: x.replace("_", " ").title(),
            key="recap_period",
        )
        st.caption("Click below — orryon will analyze your spending and give you a full summary.")
        if st.button("📊 Get Recap from orryon", type="primary", use_container_width=True, key="recap_btn"):
            label = recap_period.replace("_", " ")
            st.session_state["pending_chat_input"] = f"Give me a spending recap for {label}"
            st.info(f"📊 Recap requested for {label}. Use the chat bar below to send it to orryon!")

    # ── Custom Categories ─────────────────────────────────────────────────────
    st.markdown('<div class="section-head">Custom Categories</div>', unsafe_allow_html=True)
    with st.expander("🏷️ Manage custom categories", expanded=False):
        conn = get_connection()
        custom_cats = conn.execute(
            "SELECT * FROM custom_categories WHERE user_id=? AND is_active=1 ORDER BY name",
            (user_id,),
        ).fetchall()
        conn.close()

        if custom_cats:
            for cat in custom_cats:
                c_icon = cat["icon"] or "🏷️"
                c_name = cat["name"]
                c_col = cat["color"] or "#6366f1"
                col_name, col_del = st.columns([5, 1])
                with col_name:
                    st.markdown(
                        f'<span style="background:{c_col}22;border:1px solid {c_col}44;'
                        f'border-radius:20px;padding:2px 10px;font-size:0.82rem;">'
                        f'{c_icon} {c_name}</span>',
                        unsafe_allow_html=True,
                    )
                with col_del:
                    if st.button("✕", key=f"del_cat_{cat['id']}", help=f"Remove {c_name}"):
                        from db import update_row as _upd
                        _upd("custom_categories", {"is_active": 0}, {"id": cat["id"]})
                        st.rerun()
        else:
            st.caption("No custom categories yet.")

        st.divider()
        col_n, col_i = st.columns([3, 1])
        with col_n:
            new_cat_name = st.text_input("Category name", placeholder="Date Night, Pet Care…", key="new_cat_name")
        with col_i:
            new_cat_icon = st.text_input("Icon", value="🏷️", key="new_cat_icon", max_chars=2)
        if st.button("Create Category", type="primary", use_container_width=True, key="create_cat_btn"):
            if new_cat_name.strip():
                from db import insert_row as _ins
                try:
                    _ins("custom_categories", {
                        "id": _uid(), "user_id": user_id,
                        "name": new_cat_name.strip(), "color": "#6366f1",
                        "icon": new_cat_icon or "🏷️", "is_active": 1,
                        "created_at": _now_iso(),
                    })
                    st.success(f"Category '{new_cat_name.strip()}' created!")
                    st.rerun()
                except Exception:
                    st.warning(f"Category '{new_cat_name.strip()}' already exists.")
            else:
                st.warning("Please enter a category name.")

    st.markdown(
        '<p style="font-size:0.68rem;color:#475569;text-align:center;margin-top:1rem">'
        'orryon is for informational purposes only — not financial advice.</p>',
        unsafe_allow_html=True,
    )
