"""
ui/goals.py — Goals tab for orryon
Displays savings goals with progress bars, create/edit/delete UI,
and motivational context.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime

import streamlit as st

from db import get_connection, insert_row, update_row, fetch_rows

# ─── helpers ──────────────────────────────────────────────────────────────────

_CATEGORY_EMOJI = {
    "emergency": "🛡️",
    "vacation": "✈️",
    "house": "🏠",
    "retirement": "🌅",
    "education": "🎓",
    "investment": "📈",
    "debt_payoff": "💳",
    "vehicle": "🚗",
    "gadget": "💻",
    "wedding": "💍",
    "other": "🎯",
}

_CATEGORY_OPTIONS = list(_CATEGORY_EMOJI.keys())


def _load_goals(user_id: str, include_completed: bool = False) -> list[dict]:
    conn = get_connection()
    if include_completed:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? ORDER BY is_completed ASC, created_at DESC",
            (user_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM goals WHERE user_id=? AND is_completed=0 ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _pct(current: float, target: float) -> float:
    if target <= 0:
        return 0.0
    return min(100.0, round((current / target) * 100, 1))


def _days_left(target_date: str) -> int | None:
    if not target_date:
        return None
    try:
        delta = datetime.strptime(target_date, "%Y-%m-%d") - datetime.now()
        return max(0, delta.days)
    except Exception:
        return None


def _monthly_needed(remaining: float, days: int | None) -> float | None:
    if not days or days <= 0 or remaining <= 0:
        return None
    months = days / 30.44
    if months < 0.1:
        return None
    return round(remaining / months, 2)


def _progress_color(pct: float) -> str:
    if pct >= 80:
        return "#22c55e"   # green-500
    if pct >= 50:
        return "#86efac"   # green-300
    if pct >= 25:
        return "#4ade80"   # green-400
    return "#bbf7d0"       # green-100


def _progress_bar_html(pct: float, height: int = 10) -> str:
    color = _progress_color(pct)
    bar_pct = max(2, pct)  # always show a sliver so the bar is visible
    return (
        f'<div style="background:#1e293b;border-radius:99px;height:{height}px;overflow:hidden;">'
        f'<div style="width:{bar_pct}%;height:100%;background:{color};'
        f'border-radius:99px;transition:width .4s ease;"></div></div>'
    )


def _goal_card(g: dict, idx: int) -> None:
    """Render a single goal card with progress bar and quick actions."""
    cat = g.get("category", "other")
    emoji = _CATEGORY_EMOJI.get(cat, "🎯")
    target = float(g["target_amount"])
    current = float(g["current_amount"])
    pct = _pct(current, target)
    remaining = max(0, target - current)
    days = _days_left(g.get("target_date") or "")
    monthly = _monthly_needed(remaining, days)
    completed = bool(g.get("is_completed"))

    with st.container():
        st.markdown(
            f"""
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;
                        padding:18px 20px 14px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <span style="font-size:1.5rem;">{emoji}</span>
                  <span style="font-weight:700;font-size:1.05rem;color:#f1f5f9;margin-left:8px;">
                    {g['name']}{'  ✅' if completed else ''}
                  </span>
                </div>
                <div style="text-align:right;">
                  <span style="font-size:1.3rem;font-weight:800;color:#22c55e;">
                    {pct:.0f}%
                  </span>
                </div>
              </div>
              <div style="margin:10px 0 6px;">
                {_progress_bar_html(pct, 12)}
              </div>
              <div style="display:flex;justify-content:space-between;
                          font-size:0.82rem;color:#94a3b8;margin-top:6px;">
                <span>
                  <b style="color:#f1f5f9;">${current:,.0f}</b> saved &nbsp;·&nbsp;
                  <b style="color:#f1f5f9;">${remaining:,.0f}</b> to go
                </span>
                <span>Target: <b style="color:#f1f5f9;">${target:,.0f}</b></span>
              </div>
            """,
            unsafe_allow_html=True,
        )
        # Sub-info row
        info_parts = []
        if g.get("target_date"):
            info_parts.append(f"🗓 {g['target_date']}")
        if days is not None:
            info_parts.append(f"{days}d left")
        if monthly:
            info_parts.append(f"~${monthly:,.0f}/mo needed")
        if g.get("linked_budget_category"):
            info_parts.append(f"📂 {g['linked_budget_category']}")

        if info_parts:
            st.markdown(
                '<p style="color:#64748b;font-size:0.78rem;margin:4px 0 0;">'
                + "  ·  ".join(info_parts)
                + "</p>",
                unsafe_allow_html=True,
            )
        if g.get("notes"):
            st.markdown(
                f'<p style="color:#475569;font-size:0.78rem;font-style:italic;margin:4px 0 0;">'
                f'"{g["notes"]}"</p>',
                unsafe_allow_html=True,
            )
        st.markdown("</div>", unsafe_allow_html=True)

        # Quick action buttons
        col_add, col_edit, col_del = st.columns([2, 1, 1])
        with col_add:
            with st.popover("➕ Add progress", use_container_width=True):
                amt = st.number_input(
                    "Amount to add ($)",
                    min_value=0.01, step=10.0,
                    key=f"goal_add_amt_{idx}",
                )
                if st.button("Save progress", key=f"goal_add_save_{idx}", type="primary"):
                    new_amt = min(current + amt, target)
                    is_done = 1 if new_amt >= target else 0
                    update_row("goals", {"current_amount": new_amt, "is_completed": is_done}, {"id": g["id"]})
                    st.success(f"+${amt:,.2f} added to {g['name']}!")
                    st.rerun()
        with col_edit:
            with st.popover("✏️ Edit", use_container_width=True):
                new_name = st.text_input("Name", value=g["name"], key=f"goal_name_{idx}")
                new_target = st.number_input("Target ($)", value=float(g["target_amount"]), min_value=1.0, step=100.0, key=f"goal_tgt_{idx}")
                new_current = st.number_input("Saved so far ($)", value=float(g["current_amount"]), min_value=0.0, step=10.0, key=f"goal_cur_{idx}")
                new_date = st.text_input("Target date (YYYY-MM-DD)", value=g.get("target_date") or "", key=f"goal_date_{idx}")
                new_notes = st.text_area("Notes", value=g.get("notes") or "", key=f"goal_notes_{idx}", height=60)
                if st.button("Save changes", key=f"goal_edit_save_{idx}", type="primary"):
                    is_done = 1 if new_current >= new_target else 0
                    update_row("goals", {
                        "name": new_name,
                        "target_amount": new_target,
                        "current_amount": min(new_current, new_target),
                        "target_date": new_date,
                        "notes": new_notes,
                        "is_completed": is_done,
                    }, {"id": g["id"]})
                    st.success("Goal updated!")
                    st.rerun()
        with col_del:
            with st.popover("🗑️ Delete", use_container_width=True):
                st.warning(f"Delete **{g['name']}**?")
                if st.button("Yes, delete", key=f"goal_del_{idx}", type="primary"):
                    conn = get_connection()
                    conn.execute("DELETE FROM goals WHERE id=?", (g["id"],))
                    conn.commit()
                    conn.close()
                    st.success("Goal deleted.")
                    st.rerun()


def _create_goal_form(user_id: str) -> None:
    """Inline form to create a new goal without Grok."""
    st.markdown("#### Create New Goal")
    col1, col2 = st.columns(2)
    with col1:
        name = st.text_input("Goal name *", placeholder="Japan Vacation, Emergency Fund…", key="new_goal_name")
        target = st.number_input("Target amount ($) *", min_value=1.0, step=100.0, key="new_goal_target")
        category = st.selectbox(
            "Category", _CATEGORY_OPTIONS,
            format_func=lambda c: f"{_CATEGORY_EMOJI.get(c,'🎯')} {c.replace('_', ' ').title()}",
            key="new_goal_category",
        )
    with col2:
        current = st.number_input("Already saved ($)", min_value=0.0, step=10.0, key="new_goal_current")
        target_date = st.text_input("Target date (YYYY-MM-DD)", placeholder="2026-12-31", key="new_goal_date")
        linked_cat = st.text_input("Linked budget category (optional)", placeholder="Dining, Savings…", key="new_goal_linked")
    notes = st.text_area("Motivation / notes (optional)", height=64, key="new_goal_notes")

    if st.button("🎯 Create Goal", type="primary", use_container_width=True, key="create_goal_btn"):
        if not name.strip():
            st.error("Goal name is required.")
            return
        if target <= 0:
            st.error("Target amount must be > 0.")
            return
        import uuid
        from datetime import datetime as _dt
        insert_row("goals", {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "name": name.strip(),
            "target_amount": float(target),
            "current_amount": min(float(current), float(target)),
            "target_date": target_date.strip(),
            "category": category,
            "linked_budget_category": linked_cat.strip(),
            "notes": notes.strip(),
            "created_at": _dt.utcnow().isoformat(),
            "is_completed": 1 if current >= target else 0,
        })
        st.success(f"✅ Goal **{name}** created!")
        st.rerun()


# ─── Main render ──────────────────────────────────────────────────────────────

def render_goals(user_id: str) -> None:
    st.markdown(
        """
        <style>
        .goals-header{font-size:1.6rem;font-weight:800;
          background:linear-gradient(135deg,#22c55e,#86efac);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          margin-bottom:2px;}
        .goals-sub{color:#64748b;font-size:.85rem;margin-bottom:1rem;}
        </style>
        <div class="goals-header">🎯 Goals</div>
        <div class="goals-sub">Track your savings targets. Ask orryon to create or update goals naturally.</div>
        """,
        unsafe_allow_html=True,
    )

    show_completed = st.toggle("Show completed goals", value=False, key="goals_show_completed")
    goals = _load_goals(user_id, include_completed=show_completed)

    # ── Summary strip ──────────────────────────────────────────────────────────
    if goals:
        total_target = sum(float(g["target_amount"]) for g in goals if not g["is_completed"])
        total_saved = sum(float(g["current_amount"]) for g in goals if not g["is_completed"])
        overall_pct = _pct(total_saved, total_target)
        completed_count = sum(1 for g in goals if g["is_completed"])

        c1, c2, c3 = st.columns(3)
        with c1:
            st.metric("Active Goals", f"{sum(1 for g in goals if not g['is_completed'])}")
        with c2:
            st.metric("Total Saved", f"${total_saved:,.0f}", f"of ${total_target:,.0f}")
        with c3:
            st.metric("Overall Progress", f"{overall_pct:.0f}%", f"{completed_count} completed")
        st.divider()

    # ── Goal cards ─────────────────────────────────────────────────────────────
    active = [g for g in goals if not g["is_completed"]]
    done = [g for g in goals if g["is_completed"]]

    if active:
        for i, g in enumerate(active):
            _goal_card(g, i)
    else:
        st.info("No active goals yet. Create one below or ask orryon: *\"Help me save $5000 for a vacation by December\"*")

    if done:
        with st.expander(f"🏆 {len(done)} completed goal{'s' if len(done) > 1 else ''}", expanded=False):
            for i, g in enumerate(done):
                _goal_card(g, 1000 + i)

    # ── Export CSV ────────────────────────────────────────────────────────────
    if goals:
        csv_buf = io.StringIO()
        writer = csv.writer(csv_buf)
        writer.writerow(["Name", "Category", "Target ($)", "Saved ($)", "Remaining ($)", "% Complete", "Target Date", "Completed"])
        for g in goals:
            pct = _pct(float(g["current_amount"]), float(g["target_amount"]))
            writer.writerow([
                g["name"], g["category"],
                f"{float(g['target_amount']):.2f}", f"{float(g['current_amount']):.2f}",
                f"{max(0, float(g['target_amount']) - float(g['current_amount'])):.2f}",
                f"{pct:.1f}%", g.get("target_date") or "", "Yes" if g["is_completed"] else "No",
            ])
        col_exp, _ = st.columns([1, 3])
        with col_exp:
            st.download_button(
                "⬇️ Export Goals CSV",
                data=csv_buf.getvalue(),
                file_name="orryon_goals.csv",
                mime="text/csv",
                use_container_width=True,
            )

    st.divider()

    # ── Create goal form ────────────────────────────────────────────────────────
    with st.expander("➕ Create a new goal manually", expanded=not bool(active)):
        _create_goal_form(user_id)

    # ── Grok tip ───────────────────────────────────────────────────────────────
    st.markdown(
        """
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:14px 18px;margin-top:8px;">
          <div style="font-weight:700;color:#22c55e;margin-bottom:6px;">💬 Ask orryon about your goals</div>
          <div style="color:#94a3b8;font-size:.83rem;line-height:1.7;">
            • <i>"I want to save $3000 for an emergency fund by July"</i><br>
            • <i>"How close am I to my Japan vacation goal?"</i><br>
            • <i>"I saved $500 this month — add it to my emergency fund"</i><br>
            • <i>"If I cut dining to $200/mo, how fast will I reach my vacation goal?"</i>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.caption("⚠️ Goals are for tracking and motivation only — not financial advice.")
