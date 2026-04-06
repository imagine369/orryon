"""
ui/notes.py — Notes tab.

Shows:
  - Search bar
  - Notes grid/list
  - New note form
  - Tag filtering
"""

from __future__ import annotations

from datetime import datetime

import streamlit as st

from db import delete_row, fetch_rows, get_connection, insert_row, update_row
from core.tools import _uid, _now_iso


_NOTES_CSS = """
<style>
.note-card {
  background: #131320; border-radius: 12px;
  padding: 0.9rem 1rem; margin-bottom: 0.55rem;
  border: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
}
.note-card:hover { border-color: rgba(0,201,255,0.25); }
.note-title { font-weight: 700; font-size: 0.9rem; margin-bottom: 3px; }
.note-preview { font-size: 0.81rem; color: #64748b; line-height: 1.45; }
.note-meta { font-size: 0.72rem; color: #475569; margin-top: 6px; }
.note-tag {
  font-size: 0.68rem; padding: 1px 7px; border-radius: 20px;
  background: rgba(0,201,255,0.12); color: #00c9ff;
  border: 1px solid rgba(0,201,255,0.2); margin-right: 4px;
}
.section-head {
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
  color: #475569; margin: 1.2rem 0 0.6rem; font-weight: 600;
}
</style>
"""


def render_notes(user_id: str) -> None:
    st.markdown(_NOTES_CSS, unsafe_allow_html=True)

    # ── Search ────────────────────────────────────────────────────────────────
    search = st.text_input(
        "Search notes",
        placeholder="🔍  Search by title, content, or tag…",
        label_visibility="collapsed",
        key="notes_search",
    )

    # ── Fetch notes ───────────────────────────────────────────────────────────
    conn = get_connection()
    if search:
        s = f"%{search.lower()}%"
        notes = conn.execute(
            "SELECT * FROM notes WHERE user_id=? "
            "AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?) "
            "ORDER BY updated_at DESC",
            (user_id, s, s, s),
        ).fetchall()
    else:
        notes = conn.execute(
            "SELECT * FROM notes WHERE user_id=? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    conn.close()

    notes = [dict(n) for n in notes]

    # ── Tag filter pills ──────────────────────────────────────────────────────
    all_tags: set[str] = set()
    for n in notes:
        if n.get("tags"):
            for t in n["tags"].split(","):
                tag = t.strip()
                if tag:
                    all_tags.add(tag)

    selected_tag = None
    if all_tags:
        tag_list = ["All tags"] + sorted(all_tags)
        tag_sel = st.selectbox(
            "Filter by tag",
            options=tag_list,
            label_visibility="collapsed",
            key="notes_tag_filter",
        )
        if tag_sel != "All tags":
            selected_tag = tag_sel
            notes = [n for n in notes if selected_tag in (n.get("tags") or "")]

    # ── Note count ────────────────────────────────────────────────────────────
    col_cnt, col_new = st.columns([3, 1])
    col_cnt.markdown(
        f'<p style="font-size:0.8rem;color:#64748b;margin:0.2rem 0">'
        f'{len(notes)} note{"s" if len(notes) != 1 else ""}</p>',
        unsafe_allow_html=True,
    )

    # ── New note form (top shortcut) ──────────────────────────────────────────
    with col_new:
        show_form = st.button("✏️ New", use_container_width=True, key="new_note_btn")

    if show_form or st.session_state.get("show_note_form"):
        st.session_state["show_note_form"] = True
        with st.form("new_note_form", clear_on_submit=True):
            n_title = st.text_input("Title", placeholder="Note title…", key="nn_title")
            n_content = st.text_area("Content", placeholder="Start writing…", height=140, key="nn_content")
            n_tags = st.text_input(
                "Tags (comma-separated)",
                placeholder="e.g. finance, ideas, health",
                key="nn_tags",
            )
            c1, c2 = st.columns(2)
            submitted = c1.form_submit_button("Save Note", type="primary", use_container_width=True)
            cancelled = c2.form_submit_button("Cancel", use_container_width=True)

            if submitted and n_title:
                now_iso = _now_iso()
                insert_row("notes", {
                    "id": _uid(), "user_id": user_id,
                    "title": n_title, "content": n_content,
                    "tags": n_tags, "created_at": now_iso, "updated_at": now_iso,
                })
                st.session_state["show_note_form"] = False
                st.success(f"Saved: {n_title}")
                st.rerun()
            elif cancelled:
                st.session_state["show_note_form"] = False
                st.rerun()

    st.markdown("---")

    # ── Notes list ────────────────────────────────────────────────────────────
    if not notes:
        st.info(
            "No notes yet.\n\n"
            "Try asking orryon: *'note: thinking about switching banks'*\n"
            "or use the **✏️ New** button above."
        )
        return

    # Show editing state
    edit_id = st.session_state.get("editing_note_id")

    for note in notes:
        # Preview text (first 120 chars)
        content = note.get("content") or ""
        preview = content[:120] + ("…" if len(content) > 120 else "")

        # Tags
        tags_raw = note.get("tags") or ""
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
        tag_html = " ".join(f'<span class="note-tag">{t}</span>' for t in tags)

        # Date
        date_str = ""
        raw_date = note.get("updated_at") or note.get("created_at") or ""
        if raw_date:
            try:
                d = datetime.fromisoformat(raw_date[:19])
                date_str = d.strftime("%b %d, %Y")
            except Exception:
                date_str = raw_date[:10]

        if edit_id == note["id"]:
            # Inline edit mode
            with st.form(f"edit_note_{note['id']}"):
                e_title = st.text_input("Title", value=note["title"], key=f"e_title_{note['id']}")
                e_content = st.text_area("Content", value=content, height=180, key=f"e_content_{note['id']}")
                e_tags = st.text_input("Tags", value=tags_raw, key=f"e_tags_{note['id']}")
                ce1, ce2, ce3 = st.columns(3)
                if ce1.form_submit_button("Save", type="primary", use_container_width=True):
                    now_iso = _now_iso()
                    update_row(
                        "notes",
                        {"title": e_title, "content": e_content, "tags": e_tags, "updated_at": now_iso},
                        {"id": note["id"]},
                    )
                    st.session_state["editing_note_id"] = None
                    st.rerun()
                if ce2.form_submit_button("Cancel", use_container_width=True):
                    st.session_state["editing_note_id"] = None
                    st.rerun()
                if ce3.form_submit_button("🗑 Delete", use_container_width=True):
                    delete_row("notes", {"id": note["id"]})
                    st.session_state["editing_note_id"] = None
                    st.rerun()
        else:
            col_note, col_actions = st.columns([5, 1])
            with col_note:
                st.markdown(
                    f"""<div class="note-card">
                      <div class="note-title">{note['title']}</div>
                      <div class="note-preview">{preview}</div>
                      {('<div class="note-meta">' + tag_html + '</div>') if tags else ''}
                      <div class="note-meta">{date_str}</div>
                    </div>""",
                    unsafe_allow_html=True,
                )
            with col_actions:
                if st.button("✏️", key=f"edit_{note['id']}", help="Edit note"):
                    st.session_state["editing_note_id"] = note["id"]
                    st.rerun()
