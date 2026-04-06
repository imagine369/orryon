"""
ui/schedule.py — Schedule tab (daily life hub).

Shows:
  - Upcoming events calendar
  - Bills & recurring payments
  - Tasks / To-dos
  - Grocery list with running total & budget impact
"""

from __future__ import annotations

from datetime import datetime, timedelta

import streamlit as st

from db import fetch_rows, get_connection, insert_row, update_row
from core.tools import _uid, _now_iso


_SCHED_CSS = """
<style>
.ev-card {
  background: #131320; border-radius: 11px; padding: 0.75rem 0.9rem;
  margin-bottom: 0.45rem; display: flex; align-items: flex-start; gap: 0.8rem;
  border: 1px solid rgba(255,255,255,0.05);
}
.ev-date-box {
  min-width: 46px; text-align: center;
  background: rgba(255,255,255,0.06); border-radius: 8px;
  padding: 0.25rem 0.3rem; flex-shrink: 0;
}
.ev-day  { font-size: 1.4rem; font-weight: 800; color: #fff; line-height: 1; }
.ev-mon  { font-size: 0.65rem; text-transform: uppercase; color: #64748b; }
.ev-body { flex: 1; }
.ev-title { font-weight: 600; font-size: 0.88rem; }
.ev-meta  { font-size: 0.76rem; color: #64748b; margin-top: 2px; }
.ev-badge {
  font-size: 0.68rem; padding: 1px 7px; border-radius: 20px;
  border: 1px solid; margin-right: 4px;
}

.task-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.task-title { flex: 1; font-size: 0.86rem; }
.task-due   { font-size: 0.73rem; color: #64748b; }

.bill-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.55rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.bill-left  { font-size: 0.86rem; }
.bill-right { font-size: 0.84rem; color: #94a3b8; text-align: right; }

.groc-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.45rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.groc-name { flex: 1; font-size: 0.85rem; }
.groc-qty  { font-size: 0.76rem; color: #64748b; min-width: 50px; text-align: right; }
.groc-price { font-size: 0.76rem; color: #64748b; min-width: 50px; text-align: right; }

.section-head {
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
  color: #475569; margin: 1.3rem 0 0.6rem; font-weight: 600;
}
</style>
"""


def render_schedule(user_id: str) -> None:
    st.markdown(_SCHED_CSS, unsafe_allow_html=True)

    now = datetime.now()
    today = now.strftime("%Y-%m-%d")

    # Tab-within-tab for schedule sections
    sub_events, sub_tasks, sub_bills, sub_grocery = st.tabs([
        "📅 Events", "✅ Tasks", "💸 Bills", "🛒 Grocery",
    ])

    # ── EVENTS ────────────────────────────────────────────────────────────────
    with sub_events:
        _render_events(user_id, now, today)

    # ── TASKS ────────────────────────────────────────────────────────────────
    with sub_tasks:
        _render_tasks(user_id, now, today)

    # ── BILLS ─────────────────────────────────────────────────────────────────
    with sub_bills:
        _render_bills(user_id, now)

    # ── GROCERY ───────────────────────────────────────────────────────────────
    with sub_grocery:
        _render_grocery(user_id)


# ─────────────────────────────────────────────────────────────────────────────
# EVENTS
# ─────────────────────────────────────────────────────────────────────────────

def _render_events(user_id: str, now: datetime, today: str) -> None:
    conn = get_connection()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? AND event_date>=? ORDER BY event_date ASC LIMIT 25",
        (user_id, today),
    ).fetchall()
    conn.close()

    if not events:
        st.info("No upcoming events.\n\nTry: *'july 5 pick up Synthia at airport 8pm'*")
    else:
        type_colors = {
            "event": ("rgba(0,201,255,0.15)", "#00c9ff"),
            "errand": ("rgba(146,254,157,0.12)", "#92fe9d"),
            "reminder": ("rgba(251,191,36,0.12)", "#fbbf24"),
            "bill_due": ("rgba(239,68,68,0.12)", "#ef4444"),
            "task": ("rgba(167,139,250,0.12)", "#a78bfa"),
        }
        type_icons = {
            "event": "📅", "errand": "🚗", "reminder": "⏰",
            "bill_due": "💸", "task": "✅",
        }
        for e in events:
            etype = e["event_type"] or "event"
            bg, border = type_colors.get(etype, ("rgba(255,255,255,0.06)", "#64748b"))
            icon = type_icons.get(etype, "•")
            date_str = (e["event_date"] or "")[:10]
            time_str = (e["event_date"] or "")[11:16] if len(e["event_date"] or "") > 10 else ""
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d")
                day_num = d.strftime("%-d")
                mon_str = d.strftime("%b")
                delta = (d.replace(hour=0) - now.replace(hour=0, minute=0, second=0, microsecond=0)).days
                delta_str = "Today" if delta == 0 else "Tomorrow" if delta == 1 else f"In {delta} days"
            except Exception:
                day_num, mon_str, delta_str = "?", "", ""

            time_display = f" · {time_str}" if time_str else ""
            badge_html = (
                f'<span class="ev-badge" style="color:{border};border-color:{border}">'
                f'{delta_str}</span>'
            )
            st.markdown(
                f"""<div class="ev-card" style="border-left:3px solid {border}">
                  <div class="ev-date-box">
                    <div class="ev-day">{day_num}</div>
                    <div class="ev-mon">{mon_str}</div>
                  </div>
                  <div class="ev-body">
                    <div class="ev-title">{icon} {e['title']}</div>
                    <div class="ev-meta">{badge_html}{time_display}</div>
                    {"<div class='ev-meta'>" + e['description'] + "</div>" if e['description'] else ""}
                  </div>
                </div>""",
                unsafe_allow_html=True,
            )

    # Quick add event
    with st.expander("➕ Add event", expanded=False):
        c1, c2 = st.columns(2)
        with c1:
            ev_title = st.text_input("Title", placeholder="e.g. Meet Kirk", key="ev_title")
            ev_date = st.date_input("Date", value=datetime.now().date(), key="ev_date")
        with c2:
            ev_time = st.text_input("Time (optional)", placeholder="e.g. 3:00 PM", key="ev_time")
            ev_type = st.selectbox("Type", ["event", "errand", "reminder", "bill_due"], key="ev_type")
        ev_desc = st.text_input("Notes (optional)", key="ev_desc")
        if st.button("Add Event", type="primary", use_container_width=True, key="ev_add"):
            if ev_title:
                time_fmt = ""
                if ev_time:
                    try:
                        from datetime import time as dtime
                        parsed_t = datetime.strptime(ev_time.strip().upper(), "%I:%M %p")
                        time_fmt = parsed_t.strftime("%H:%M")
                    except Exception:
                        time_fmt = ev_time
                insert_row("events", {
                    "id": _uid(), "user_id": user_id,
                    "title": ev_title, "description": ev_desc,
                    "event_date": f"{ev_date.strftime('%Y-%m-%d')} {time_fmt}".strip(),
                    "event_type": ev_type, "amount": 0,
                    "is_recurring": 0, "created_at": _now_iso(),
                })
                st.success(f"Added: {ev_title}")
                st.rerun()
            else:
                st.warning("Please enter an event title.")


# ─────────────────────────────────────────────────────────────────────────────
# TASKS
# ─────────────────────────────────────────────────────────────────────────────

def _render_tasks(user_id: str, now: datetime, today: str) -> None:
    conn = get_connection()
    tasks = conn.execute(
        "SELECT * FROM action_items WHERE user_id=? AND status='open' ORDER BY due_date ASC, priority DESC",
        (user_id,),
    ).fetchall()
    done_tasks = conn.execute(
        "SELECT * FROM action_items WHERE user_id=? AND status='done' ORDER BY updated_at DESC LIMIT 5",
        (user_id,),
    ).fetchall()
    conn.close()

    priority_colors = {"high": "#ef4444", "medium": "#f59e0b", "low": "#22c55e"}
    priority_icons = {"high": "🔴", "medium": "🟡", "low": "🟢"}

    if not tasks:
        st.info("No open tasks.\n\nTry: *'remind me to pay electricity bill on the 15th'*")
    else:
        for t in tasks:
            pri = t["priority"] or "medium"
            icon = priority_icons.get(pri, "•")
            color = priority_colors.get(pri, "#64748b")

            due_str = ""
            if t["due_date"]:
                try:
                    d = datetime.strptime(t["due_date"], "%Y-%m-%d")
                    delta = (d.replace(hour=0) - now.replace(hour=0, minute=0, second=0, microsecond=0)).days
                    due_str = "Overdue!" if delta < 0 else "Today" if delta == 0 else f"Due in {delta}d"
                except Exception:
                    due_str = t["due_date"]

            col_check, col_body = st.columns([0.08, 0.92])
            with col_check:
                done = st.checkbox("", key=f"task_{t['id']}", label_visibility="collapsed")
            with col_body:
                overdue = due_str == "Overdue!"
                st.markdown(
                    f"""<div class="task-row">
                      <span>{icon}</span>
                      <span class="task-title" style="{'text-decoration:line-through;color:#475569' if done else ''}">{t['title']}</span>
                      <span class="task-due" style="color:{'#ef4444' if overdue else '#64748b'}">{due_str}</span>
                    </div>""",
                    unsafe_allow_html=True,
                )
            if done:
                update_row("action_items", {"status": "done", "updated_at": _now_iso()}, {"id": t["id"]})
                st.rerun()

    if done_tasks:
        with st.expander(f"✅ Recently completed ({len(done_tasks)})"):
            for t in done_tasks:
                st.markdown(
                    f'<span style="text-decoration:line-through;color:#475569;font-size:0.85rem">✓ {t["title"]}</span>',
                    unsafe_allow_html=True,
                )

    # Quick add task
    with st.expander("➕ Add task", expanded=False):
        c1, c2 = st.columns(2)
        with c1:
            t_title = st.text_input("Task", placeholder="e.g. Call dentist", key="t_title")
        with c2:
            t_priority = st.selectbox("Priority", ["medium", "high", "low"], key="t_priority")
        t_due = st.date_input("Due date (optional)", value=None, key="t_due")
        if st.button("Add Task", type="primary", use_container_width=True, key="t_add"):
            if t_title:
                insert_row("action_items", {
                    "id": _uid(), "user_id": user_id,
                    "title": t_title, "description": "",
                    "priority": t_priority, "status": "open",
                    "due_date": t_due.strftime("%Y-%m-%d") if t_due else "",
                    "category": "personal", "created_by": "user",
                    "created_at": _now_iso(), "updated_at": _now_iso(),
                })
                st.success(f"Added: {t_title}")
                st.rerun()
            else:
                st.warning("Please enter a task title.")


# ─────────────────────────────────────────────────────────────────────────────
# BILLS
# ─────────────────────────────────────────────────────────────────────────────

def _render_bills(user_id: str, now: datetime) -> None:
    conn = get_connection()
    active_bills = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND is_active=1 ORDER BY next_due ASC",
        (user_id,),
    ).fetchall()
    cancelled_bills = conn.execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND is_active=0 ORDER BY detected_at DESC LIMIT 5",
        (user_id,),
    ).fetchall()
    conn.close()

    total_monthly = sum(float(b["amount"]) for b in active_bills if b["frequency"] == "monthly")
    total_yearly_est = total_monthly * 12

    # Summary strip
    if active_bills:
        c1, c2, c3 = st.columns(3)
        c1.metric("Active Bills", len(active_bills))
        c2.metric("Monthly Total", f"${total_monthly:,.0f}")
        c3.metric("Annual Est.", f"${total_yearly_est:,.0f}")
        st.markdown('<div style="height:6px"></div>', unsafe_allow_html=True)

    freq_icons = {"monthly": "🔄", "weekly": "📆", "yearly": "📅", "bi-weekly": "🔁"}

    if not active_bills:
        st.info("No recurring bills.\n\nTry: *'electricity bill $120 on the 15th every month'*")
    else:
        for b in active_bills:
            amount = float(b["amount"])
            prev_amount = float(b["previous_amount"] or 0) if "previous_amount" in b.keys() else 0.0
            amount_changed = prev_amount > 0 and abs(amount - prev_amount) > 0.01

            due_str = ""
            due_color = "#64748b"
            if b["next_due"]:
                try:
                    d = datetime.strptime(b["next_due"], "%Y-%m-%d")
                    delta = (d.replace(hour=0) - now.replace(hour=0, minute=0, second=0, microsecond=0)).days
                    due_str = "Due today!" if delta == 0 else f"Due in {delta}d" if delta > 0 else f"{abs(delta)}d overdue"
                    due_color = "#ef4444" if delta <= 0 else "#f59e0b" if delta <= 7 else "#64748b"
                except Exception:
                    due_str = b["next_due"]

            icon = freq_icons.get(b["frequency"] or "monthly", "💳")
            change_badge = ""
            if amount_changed:
                direction = "↑" if amount > prev_amount else "↓"
                diff_amt = abs(amount - prev_amount)
                change_badge = f'<span style="background:#f59e0b22;border:1px solid #f59e0b55;border-radius:20px;padding:1px 7px;font-size:0.7rem;color:#f59e0b;margin-left:6px;">{direction} ${diff_amt:.2f} change</span>'

            col_info, col_action = st.columns([5, 1])
            with col_info:
                st.markdown(
                    f"""<div class="bill-row">
                      <div class="bill-left">
                        <span>{icon} <strong>{b['name']}</strong>{change_badge}</span><br>
                        <span style="font-size:0.74rem;color:#64748b">{b['category'] or ''} · {b['frequency'] or 'monthly'}</span>
                      </div>
                      <div class="bill-right">
                        <strong>${amount:,.2f}</strong><br>
                        <span style="color:{due_color};font-size:0.74rem">{due_str}</span>
                      </div>
                    </div>""",
                    unsafe_allow_html=True,
                )
            with col_action:
                with st.popover("⋮"):
                    new_amt = st.number_input("Update amount ($)", value=amount, min_value=0.0, step=0.01, key=f"upd_bill_{b['id']}")
                    if st.button("Update", key=f"upd_bill_save_{b['id']}"):
                        update_row("subscriptions", {"previous_amount": amount, "amount": new_amt, "last_changed": _now_iso()}, {"id": b["id"]})
                        st.success("Updated!")
                        st.rerun()
                    if st.button("Cancel subscription", key=f"cancel_bill_{b['id']}", type="secondary"):
                        update_row("subscriptions", {"is_active": 0}, {"id": b["id"]})
                        st.success(f"Cancelled {b['name']}")
                        st.rerun()

    if cancelled_bills:
        with st.expander(f"🚫 {len(cancelled_bills)} cancelled subscription{'s' if len(cancelled_bills)>1 else ''}"):
            for b in cancelled_bills:
                col_r, col_btn = st.columns([4, 1])
                with col_r:
                    st.markdown(f'<span style="color:#475569;font-size:0.84rem">✕ {b["name"]} — ${float(b["amount"]):,.2f}/mo</span>', unsafe_allow_html=True)
                with col_btn:
                    if st.button("Restore", key=f"restore_bill_{b['id']}"):
                        update_row("subscriptions", {"is_active": 1}, {"id": b["id"]})
                        st.rerun()

    # Quick add bill
    with st.expander("➕ Add recurring bill", expanded=False):
        c1, c2 = st.columns(2)
        with c1:
            b_name = st.text_input("Bill name", placeholder="e.g. Electricity", key="b_name")
            b_amount = st.number_input("Amount ($)", min_value=0.0, step=0.01, key="b_amount")
        with c2:
            b_freq = st.selectbox("Frequency", ["monthly", "weekly", "yearly", "bi-weekly"], key="b_freq")
            b_day = st.number_input("Due day of month", min_value=1, max_value=31, value=1, key="b_day")
        if st.button("Add Bill", type="primary", use_container_width=True, key="b_add"):
            if b_name:
                day = int(b_day)
                if now.day < day:
                    nd = now.replace(day=day).strftime("%Y-%m-%d")
                else:
                    m = now.month + 1 if now.month < 12 else 1
                    y = now.year if now.month < 12 else now.year + 1
                    nd = now.replace(year=y, month=m, day=day).strftime("%Y-%m-%d")
                insert_row("subscriptions", {
                    "id": _uid(), "user_id": user_id,
                    "name": b_name, "amount": float(b_amount),
                    "frequency": b_freq, "next_due": nd,
                    "category": "Utilities", "is_active": 1,
                    "detected_at": _now_iso(),
                })
                st.success(f"Added: {b_name}")
                st.rerun()
            else:
                st.warning("Please enter a bill name.")


# ─────────────────────────────────────────────────────────────────────────────
# GROCERY
# ─────────────────────────────────────────────────────────────────────────────

def _render_grocery(user_id: str) -> None:
    conn = get_connection()
    items = conn.execute(
        "SELECT * FROM grocery_items WHERE user_id=? AND is_checked=0 ORDER BY added_at ASC",
        (user_id,),
    ).fetchall()
    checked_items = conn.execute(
        "SELECT * FROM grocery_items WHERE user_id=? AND is_checked=1 ORDER BY added_at DESC LIMIT 10",
        (user_id,),
    ).fetchall()
    conn.close()

    total_est = sum(float(i["estimated_price"]) for i in items)
    count = len(items)

    if items:
        # Budget impact
        now = datetime.now()
        month_str = now.strftime("%Y-%m")
        conn2 = get_connection()
        groc_budget = conn2.execute(
            "SELECT planned FROM budget_categories WHERE user_id=? AND category='Groceries' AND month=?",
            (user_id, month_str),
        ).fetchone()
        groc_spent = conn2.execute(
            "SELECT SUM(amount) as total FROM transactions "
            "WHERE user_id=? AND category='Groceries' AND date LIKE ? AND amount>0",
            (user_id, f"{month_str}%"),
        ).fetchone()
        conn2.close()

        spent_val = float(groc_spent["total"] or 0)
        budget_val = float(groc_budget["planned"]) if groc_budget else 0
        projected = spent_val + total_est

        col_m1, col_m2, col_m3 = st.columns(3)
        col_m1.metric("Items", count)
        col_m2.metric("Est. Total", f"${total_est:.2f}")
        if budget_val:
            pct = round(projected / budget_val * 100, 0)
            col_m3.metric(
                "Grocery Budget",
                f"{pct:.0f}% after shop",
                delta=f"${projected:,.0f} / ${budget_val:,.0f}",
                delta_color="inverse" if projected > budget_val else "normal",
            )

    if not items:
        st.info("Grocery list is empty.\n\nTry: *'add milk eggs bread chicken to grocery list'*")
    else:
        for item in items:
            col_chk, col_body = st.columns([0.08, 0.92])
            with col_chk:
                bought = st.checkbox("", key=f"groc_{item['id']}", label_visibility="collapsed")
            with col_body:
                price_str = f"~${float(item['estimated_price']):.2f}" if float(item.get("estimated_price", 0)) > 0 else ""
                qty_str = item.get("quantity", "")
                qty_display = f" · {qty_str}" if qty_str and qty_str != "1" else ""
                st.markdown(
                    f'<div class="groc-row">'
                    f'<span class="groc-name">🛒 {item["name"]}{qty_display}</span>'
                    f'<span class="groc-price">{price_str}</span>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
            if bought:
                update_row("grocery_items", {"is_checked": 1}, {"id": item["id"]})
                st.rerun()

    if checked_items:
        with st.expander(f"✅ Bought ({len(checked_items)})"):
            for item in checked_items:
                st.markdown(
                    f'<span style="text-decoration:line-through;color:#475569;font-size:0.85rem">✓ {item["name"]}</span>',
                    unsafe_allow_html=True,
                )
            if st.button("Clear bought items", key="groc_clear"):
                conn3 = get_connection()
                conn3.execute(
                    "DELETE FROM grocery_items WHERE user_id=? AND is_checked=1",
                    (user_id,),
                )
                conn3.commit()
                conn3.close()
                st.rerun()

    # Quick add grocery
    with st.expander("➕ Add items", expanded=False):
        g_items_text = st.text_area(
            "Items (one per line)",
            placeholder="milk\neggs\nbread\nchicken",
            height=100,
            key="g_items",
        )
        g_col1, g_col2 = st.columns(2)
        if g_col1.button("Add to List", type="primary", use_container_width=True, key="g_add"):
            lines = [l.strip() for l in g_items_text.split("\n") if l.strip()]
            if lines:
                for line in lines:
                    insert_row("grocery_items", {
                        "id": _uid(), "user_id": user_id, "name": line,
                        "quantity": "1", "estimated_price": 0,
                        "is_checked": 0, "added_at": _now_iso(),
                    })
                st.success(f"Added {len(lines)} item(s)")
                st.rerun()
            else:
                st.warning("Enter at least one item.")
