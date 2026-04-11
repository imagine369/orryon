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

from db import fetch_rows, get_connection, insert_row, update_row
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
        # Calculate rollover from prior month
        prev_month_dt = datetime.strptime(month_str, "%Y-%m").replace(day=1) - timedelta(days=1)
        prev_month = prev_month_dt.strftime("%Y-%m")
        conn_ro = get_connection()
        prev_budgets = conn_ro.execute(
            "SELECT category, planned FROM budget_categories WHERE user_id=? AND month=?",
            (user_id, prev_month),
        ).fetchall()
        prev_spent_rows = conn_ro.execute(
            "SELECT category, SUM(amount) as total FROM transactions "
            "WHERE user_id=? AND date LIKE ? AND amount>0 GROUP BY category",
            (user_id, f"{prev_month}%"),
        ).fetchall()
        conn_ro.close()
        prev_spent_map = {r["category"]: float(r["total"]) for r in prev_spent_rows}
        prev_budget_map = {b["category"]: float(b["planned"]) for b in prev_budgets}

        for b in budgets:
            cat = b["category"]
            planned = float(b["planned"])
            has_rollover = bool(b.get("rollover"))
            rollover_amt = 0.0
            if has_rollover and cat in prev_budget_map:
                prev_plan = prev_budget_map[cat]
                prev_sp = prev_spent_map.get(cat, 0)
                rollover_amt = max(0, prev_plan - prev_sp)
            effective_budget = planned + rollover_amt
            spent = spent_map.get(cat, 0)
            pct = min(spent / effective_budget * 100, 100) if effective_budget else 0
            is_over = spent > effective_budget
            card_cls = "over" if is_over else "warn" if pct >= 80 else "good"
            bar_color = "#ef4444" if is_over else "#f59e0b" if pct >= 80 else "#22c55e"
            rollover_badge = (
                f" <span style='background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:20px;"
                f"padding:1px 7px;font-size:0.68rem;color:#a5b4fc;margin-left:4px;'>+${rollover_amt:,.0f} rollover</span>"
                if rollover_amt > 0 else ""
            )
            remaining_str = (
                f"<span style='color:#ef4444'>+${spent-effective_budget:,.0f} over</span>"
                if is_over
                else f"<span style='color:#64748b'>${effective_budget-spent:,.0f} left</span>"
            )
            st.markdown(
                f"""<div class="cat-card {card_cls}">
                  <div class="cat-hdr">
                    <span class="cat-name">{cat}{rollover_badge}</span>
                    <span class="cat-nums">${spent:,.0f} / ${effective_budget:,.0f} &nbsp; {remaining_str}</span>
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

    # ── Transaction list with edit/delete ─────────────────────────────────────
    st.markdown('<div class="section-head">Transactions</div>', unsafe_allow_html=True)

    if txns:
        for idx, r in enumerate(txns[:30]):
            col_body, col_edit = st.columns([5, 1])
            with col_body:
                _att_icon = " 📎" if r.get("attachment_path") else ""
                st.markdown(
                    f'<div style="display:flex;justify-content:space-between;padding:0.35rem 0;'
                    f'border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.84rem;">'
                    f'<span style="color:#94a3b8">{r["date"]}</span>'
                    f'<span style="flex:1;margin:0 8px;color:#e2e8f0">{r["merchant"] or "—"}{_att_icon}</span>'
                    f'<span style="color:#64748b;min-width:70px">{r["category"] or "—"}</span>'
                    f'<span style="min-width:70px;text-align:right;font-weight:600">${float(r["amount"]):,.2f}</span>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
            with col_edit:
                with st.popover("✏️", use_container_width=True):
                    _base_cats_e = ["Food & Dining", "Groceries", "Transport", "Subscriptions",
                                    "Health & Fitness", "Shopping", "Rent & Housing",
                                    "Utilities", "Entertainment", "Travel", "Other"]
                    e_amt = st.number_input("Amount", value=float(r["amount"]), min_value=0.01, step=0.01, key=f"etxn_a_{idx}")
                    e_merchant = st.text_input("Merchant", value=r["merchant"] or "", key=f"etxn_m_{idx}")
                    e_cat = st.selectbox("Category", _base_cats_e,
                                         index=_base_cats_e.index(r["category"]) if r["category"] in _base_cats_e else len(_base_cats_e) - 1,
                                         key=f"etxn_c_{idx}")
                    if st.button("Save", key=f"etxn_save_{idx}", type="primary"):
                        update_row("transactions", {"amount": e_amt, "merchant": e_merchant, "category": e_cat}, {"id": r["id"]})
                        st.success("Updated!")
                        st.rerun()
                    if st.button("Delete", key=f"etxn_del_{idx}"):
                        from db import delete_row as _dr
                        _dr("transactions", {"id": r["id"]})
                        st.rerun()

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
        m_receipt = st.file_uploader("Attach receipt (optional)", type=["png", "jpg", "jpeg", "pdf"], key="qe_receipt")

        if st.button("Add Expense", type="primary", use_container_width=True, key="qe_submit"):
            if m_merchant and m_amount > 0:
                import json as _json
                attachment = ""
                if m_receipt is not None:
                    from config import ATTACHMENTS_DIR
                    import os
                    fname = f"{_uid()}_{m_receipt.name}"
                    fpath = os.path.join(ATTACHMENTS_DIR, fname)
                    with open(fpath, "wb") as _f:
                        _f.write(m_receipt.getvalue())
                    attachment = fpath
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
                    "attachment_path": attachment,
                })
                st.success(f"Added ${m_amount:.2f} at {m_merchant} to {m_cat}")
                st.rerun()
            else:
                st.warning("Please enter a merchant name and amount.")

    # ── CSV Import ─────────────────────────────────────────────────────────────
    st.markdown('<div class="section-head">Import Transactions</div>', unsafe_allow_html=True)
    with st.expander("📁 Import from CSV", expanded=False):
        st.caption("Upload a bank CSV (Chase, Amex, or generic format). We'll auto-detect columns.")
        uploaded = st.file_uploader("CSV file", type=["csv"], key="csv_import", label_visibility="collapsed")
        if uploaded is not None:
            from core.csv_importer import parse_csv
            result = parse_csv(uploaded.getvalue(), user_id)
            if result["status"] == "error":
                st.error(result["error"])
            elif result["status"] == "needs_mapping":
                st.warning(f"Could not auto-detect columns. Headers found: {', '.join(result['headers'])}")
                st.caption("Rename your columns to Date, Description, Amount and re-upload.")
            else:
                txn_list = result["transactions"]
                st.success(f"Found **{result['count']}** transactions ({result['duplicates_removed']} duplicates removed). Format: {result['detected_format']}")
                if txn_list:
                    preview = pd.DataFrame(txn_list[:10])[["date", "merchant", "category", "amount"]]
                    preview.columns = ["Date", "Merchant", "Category", "Amount ($)"]
                    st.dataframe(preview, use_container_width=True, hide_index=True)
                    if st.button(f"✅ Import {len(txn_list)} transactions", type="primary", use_container_width=True, key="csv_confirm"):
                        for t in txn_list:
                            insert_row("transactions", t)
                        st.success(f"Imported {len(txn_list)} transactions!")
                        st.rerun()

    # ── Recurring Income ──────────────────────────────────────────────────────
    st.markdown('<div class="section-head">Recurring Income</div>', unsafe_allow_html=True)
    with st.expander("💰 Manage income sources", expanded=False):
        from db import get_recurring_income, get_total_monthly_income
        _income_sources = get_recurring_income(user_id)
        _total_income = get_total_monthly_income(user_id)

        if _income_sources:
            st.metric("Monthly Income", f"${_total_income:,.0f}")
            for _ri_idx, _ri in enumerate(_income_sources):
                _ri_col_info, _ri_col_act = st.columns([4, 1])
                with _ri_col_info:
                    _ri_freq = (_ri.get("frequency") or "monthly").capitalize()
                    st.markdown(
                        f'<div style="display:flex;justify-content:space-between;padding:0.4rem 0;'
                        f'border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.84rem;">'
                        f'<span style="color:#e2e8f0;font-weight:600;">{_ri["name"]}</span>'
                        f'<span style="color:#92fe9d;font-weight:600;">${float(_ri["amount"]):,.2f}<span style="color:#64748b;font-weight:400;font-size:0.75rem;">/{_ri_freq.lower()}</span></span>'
                        f'</div>',
                        unsafe_allow_html=True,
                    )
                with _ri_col_act:
                    with st.popover("⋮", use_container_width=True):
                        _ri_new_name = st.text_input("Name", value=_ri["name"], key=f"ri_n_{_ri_idx}")
                        _ri_new_amt = st.number_input("Amount", value=float(_ri["amount"]), min_value=0.01, step=1.0, key=f"ri_a_{_ri_idx}")
                        _ri_new_freq = st.selectbox("Frequency", ["monthly", "biweekly", "weekly", "yearly"],
                                                    index=["monthly", "biweekly", "weekly", "yearly"].index((_ri.get("frequency") or "monthly").lower())
                                                    if (_ri.get("frequency") or "monthly").lower() in ["monthly", "biweekly", "weekly", "yearly"] else 0,
                                                    key=f"ri_f_{_ri_idx}")
                        if st.button("Save", key=f"ri_save_{_ri_idx}", type="primary"):
                            update_row("recurring_income", {"name": _ri_new_name, "amount": _ri_new_amt, "frequency": _ri_new_freq}, {"id": _ri["id"]})
                            st.success("Updated!")
                            st.rerun()
                        if st.button("🗑️ Remove", key=f"ri_del_{_ri_idx}"):
                            update_row("recurring_income", {"is_active": 0}, {"id": _ri["id"]})
                            st.rerun()
        else:
            st.caption("No recurring income sources yet.")

        st.divider()
        st.markdown("**Add income source**")
        _ri_c1, _ri_c2 = st.columns(2)
        with _ri_c1:
            _new_ri_name = st.text_input("Source name", placeholder="e.g. Salary, Freelance", key="new_ri_name")
            _new_ri_amt = st.number_input("Amount ($)", min_value=0.01, step=1.0, key="new_ri_amt")
        with _ri_c2:
            _new_ri_freq = st.selectbox("Frequency", ["monthly", "biweekly", "weekly", "yearly"], key="new_ri_freq")
            _new_ri_source = st.text_input("Source (optional)", placeholder="e.g. Employer name", key="new_ri_source")
        if st.button("Add Income", type="primary", use_container_width=True, key="add_ri_btn"):
            if _new_ri_name.strip() and _new_ri_amt > 0:
                insert_row("recurring_income", {
                    "id": _uid(), "user_id": user_id,
                    "name": _new_ri_name.strip(), "amount": float(_new_ri_amt),
                    "frequency": _new_ri_freq, "source": _new_ri_source,
                    "next_date": "", "is_active": 1, "created_at": _now_iso(),
                })
                st.success(f"Added: {_new_ri_name.strip()} — ${_new_ri_amt:,.2f}/{_new_ri_freq}")
                st.rerun()
            else:
                st.warning("Enter a name and amount.")

    # ── Spending Recap ────────────────────────────────────────────────────────
    st.markdown('<div class="section-head">Spending Recap</div>', unsafe_allow_html=True)
    with st.expander("📊 Generate a spending recap", expanded=False):
        recap_period = st.selectbox(
            "Period",
            ["this_month", "last_month", "this_week", "last_week"],
            format_func=lambda x: x.replace("_", " ").title(),
            key="recap_period",
        )
        st.caption("Click below — orryon will generate a spending recap using your actual data.")
        if st.button("📊 Get Recap", type="primary", use_container_width=True, key="recap_btn"):
            from core.tools import _get_spending_recap
            result = _get_spending_recap({"period": recap_period}, user_id)
            total = result.get("total_spent", 0)
            txn_count = result.get("transaction_count", 0)
            top_cats = result.get("top_categories", [])
            change = result.get("change_vs_prev", 0)
            change_pct = result.get("change_pct", 0)
            insight = result.get("positive_insight", "")
            over = result.get("over_budget_categories", [])
            label = result.get("period", recap_period.replace("_", " ").title())

            recap_md = f"**{label} Recap:** ${total:,.0f} spent across {txn_count} transactions.\n\n"
            if top_cats:
                recap_md += "**Top categories:** " + ", ".join(
                    f"{c['category']} ${c['total']:,.0f}" for c in top_cats
                ) + "\n\n"
            direction = "less" if change < 0 else "more"
            recap_md += f"That's ${abs(change):,.0f} {direction} than last period ({abs(change_pct):.0f}%).\n\n"
            if over:
                recap_md += "**Over budget:** " + ", ".join(
                    f"{o['category']} (+${o['over_by']:,.0f})" for o in over
                ) + "\n\n"
            if insight:
                recap_md += f"{insight}\n\n"
            recap_md += "*(orryon is for informational purposes only — not financial advice.)*"
            st.markdown(recap_md)

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
