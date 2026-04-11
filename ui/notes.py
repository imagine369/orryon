"""
ui/notes.py — Rich Notes / Journal tab.

Features:
  - Markdown rendering with expand-to-read view
  - Pinned notes section
  - Mood tracking per entry
  - Linked accounts & goals
  - Templates (Weekly Check-In, Spending Reflection, Goal Progress)
  - Search + tag filter
  - Word count & reading time
"""

from __future__ import annotations

from datetime import datetime

import streamlit as st

from db import delete_row, fetch_rows, get_connection, insert_row, update_row
from core.tools import _uid, _now_iso


_MOOD_MAP = {
    "": ("", ""),
    "happy": ("😊", "Happy"),
    "grateful": ("🙏", "Grateful"),
    "motivated": ("🔥", "Motivated"),
    "neutral": ("😐", "Neutral"),
    "stressed": ("😰", "Stressed"),
    "anxious": ("😟", "Anxious"),
    "reflective": ("🤔", "Reflective"),
}

_TEMPLATES = {
    "Weekly Money Check-In": {
        "content": """## How did this week go?

**What went well financially:**
- 

**What could improve:**
- 

**Biggest expense this week:**


**Goals progress check:**


**Plan for next week:**
- 
""",
        "tags": "weekly, check-in",
    },
    "Spending Reflection": {
        "content": """## Spending Reflection

**Biggest purchase this period:**


**Was it worth it?** (yes / no / mixed)


**Any regrets?**


**What brought the most value?**


**One thing to change next month:**

""",
        "tags": "reflection, spending",
    },
    "Goal Progress": {
        "content": """## Goal Check-In

**Goal:**


**Current progress:**


**What I did this month toward it:**
- 

**Obstacles / blockers:**


**Next milestone:**


**Motivation level (1-10):**

""",
        "tags": "goals, progress",
    },
    "Financial Decision": {
        "content": """## Decision to Make

**What I'm considering:**


**Option A:**
- Pros: 
- Cons: 

**Option B:**
- Pros: 
- Cons: 

**Budget impact:**


**My gut feeling:**


**Decision:**

""",
        "tags": "decision, finance",
    },
}


_NOTES_CSS = """
<style>
.note-card {
  background: #131320; border-radius: 14px;
  padding: 1rem 1.1rem; margin-bottom: 0.6rem;
  border: 1px solid rgba(255,255,255,0.06);
  cursor: pointer; transition: border-color 0.2s;
}
.note-card:hover { border-color: rgba(0,201,255,0.3); }
.note-card.pinned { border-color: rgba(250,204,21,0.3); background: #16162a; }
.note-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.note-title { font-weight: 700; font-size: 0.92rem; color: #f1f5f9; }
.note-pin { font-size: 0.75rem; color: #facc15; }
.note-preview { font-size: 0.82rem; color: #64748b; line-height: 1.5; }
.note-footer { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.note-tag {
  font-size: 0.67rem; padding: 2px 8px; border-radius: 20px;
  background: rgba(0,201,255,0.1); color: #00c9ff;
  border: 1px solid rgba(0,201,255,0.2);
}
.note-mood-badge {
  font-size: 0.67rem; padding: 2px 8px; border-radius: 20px;
  background: rgba(250,204,21,0.1); color: #facc15;
  border: 1px solid rgba(250,204,21,0.2);
}
.note-link-badge {
  font-size: 0.67rem; padding: 2px 8px; border-radius: 20px;
  background: rgba(99,102,241,0.1); color: #a5b4fc;
  border: 1px solid rgba(99,102,241,0.2);
}
.note-date { font-size: 0.7rem; color: #475569; }
.note-wc { font-size: 0.65rem; color: #334155; }
.section-head {
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
  color: #475569; margin: 1.2rem 0 0.6rem; font-weight: 600;
}
.reading-pane {
  background: #0f0f1e; border-radius: 14px; padding: 1.4rem 1.5rem;
  border: 1px solid rgba(255,255,255,0.08); margin-bottom: 1rem;
}
.reading-title { font-size: 1.3rem; font-weight: 800; color: #f1f5f9; margin-bottom: 0.6rem; }
.reading-meta { font-size: 0.76rem; color: #64748b; margin-bottom: 1rem;
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
</style>
"""


def _word_count(text: str) -> int:
    return len(text.split()) if text else 0


def _reading_time(text: str) -> str:
    wc = _word_count(text)
    mins = max(1, round(wc / 200))
    return f"{mins} min read"


def _format_date(raw: str) -> str:
    if not raw:
        return ""
    try:
        d = datetime.fromisoformat(raw[:19])
        return d.strftime("%b %d, %Y at %I:%M %p")
    except Exception:
        return raw[:10]


def _short_date(raw: str) -> str:
    if not raw:
        return ""
    try:
        d = datetime.fromisoformat(raw[:19])
        return d.strftime("%b %d, %Y")
    except Exception:
        return raw[:10]


def render_notes(user_id: str) -> None:
    st.markdown(_NOTES_CSS, unsafe_allow_html=True)

    viewing_id = st.session_state.get("viewing_note_id")
    editing_id = st.session_state.get("editing_note_id")

    if viewing_id and not editing_id:
        _render_reading_view(user_id, viewing_id)
        return

    if editing_id:
        _render_edit_view(user_id, editing_id)
        return

    _render_notes_list(user_id)


def _render_notes_list(user_id: str) -> None:
    """Main notes list with search, filter, pinned section."""

    search = st.text_input(
        "Search notes",
        placeholder="Search by title, content, or tag...",
        label_visibility="collapsed",
        key="notes_search",
    )

    conn = get_connection()
    if search:
        s = f"%{search.lower()}%"
        notes = conn.execute(
            "SELECT * FROM notes WHERE user_id=? "
            "AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?) "
            "ORDER BY is_pinned DESC, updated_at DESC",
            (user_id, s, s, s),
        ).fetchall()
    else:
        notes = conn.execute(
            "SELECT * FROM notes WHERE user_id=? ORDER BY is_pinned DESC, updated_at DESC",
            (user_id,),
        ).fetchall()
    conn.close()
    notes = [dict(n) for n in notes]

    # Tag filter
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
        tag_sel = st.selectbox("Filter by tag", options=tag_list, label_visibility="collapsed", key="notes_tag_filter")
        if tag_sel != "All tags":
            selected_tag = tag_sel
            notes = [n for n in notes if selected_tag in (n.get("tags") or "")]

    # Header row
    col_cnt, col_tpl, col_new = st.columns([3, 1, 1])
    col_cnt.markdown(
        f'<p style="font-size:0.8rem;color:#64748b;margin:0.2rem 0">'
        f'{len(notes)} note{"s" if len(notes) != 1 else ""}</p>',
        unsafe_allow_html=True,
    )
    with col_tpl:
        show_tpl = st.button("📋 Template", use_container_width=True, key="tpl_btn")
    with col_new:
        show_form = st.button("✏️ New", use_container_width=True, key="new_note_btn")

    # Template picker
    if show_tpl or st.session_state.get("show_template_picker"):
        st.session_state["show_template_picker"] = True
        st.markdown('<p class="section-head">Choose a Template</p>', unsafe_allow_html=True)
        tpl_cols = st.columns(2)
        for i, (name, tpl) in enumerate(_TEMPLATES.items()):
            with tpl_cols[i % 2]:
                if st.button(f"📋 {name}", use_container_width=True, key=f"tpl_{name}"):
                    st.session_state["show_template_picker"] = False
                    st.session_state["show_note_form"] = True
                    st.session_state["tpl_title"] = name
                    st.session_state["tpl_content"] = tpl["content"]
                    st.session_state["tpl_tags"] = tpl["tags"]
                    st.rerun()

    # New note form
    if show_form or st.session_state.get("show_note_form"):
        st.session_state["show_note_form"] = True
        _render_create_form(user_id)

    st.markdown("---")

    if not notes:
        st.info(
            "No notes yet.\n\n"
            "Try asking orryon: *'note: thinking about switching banks'*\n"
            "or use the **✏️ New** or **📋 Template** buttons above."
        )
        return

    # Split pinned vs unpinned
    pinned = [n for n in notes if n.get("is_pinned")]
    unpinned = [n for n in notes if not n.get("is_pinned")]

    if pinned:
        st.markdown('<p class="section-head">📌 Pinned</p>', unsafe_allow_html=True)
        for note in pinned:
            _render_note_card(note, is_pinned=True)

    if unpinned:
        if pinned:
            st.markdown('<p class="section-head">All Notes</p>', unsafe_allow_html=True)
        for note in unpinned:
            _render_note_card(note, is_pinned=False)


def _render_note_card(note: dict, is_pinned: bool) -> None:
    content = note.get("content") or ""
    lines = content.strip().split("\n")
    preview_lines = [l for l in lines if l.strip() and not l.strip().startswith("#")][:2]
    preview = " ".join(preview_lines)[:140]
    if len(content) > 140:
        preview += "..."

    tags_raw = note.get("tags") or ""
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
    tag_html = " ".join(f'<span class="note-tag">{t}</span>' for t in tags[:5])

    mood = note.get("mood") or ""
    mood_emoji, mood_label = _MOOD_MAP.get(mood, ("", ""))
    mood_html = f'<span class="note-mood-badge">{mood_emoji} {mood_label}</span>' if mood_emoji else ""

    linked_goal = note.get("linked_goal") or ""
    linked_account = note.get("linked_account") or ""
    link_html = ""
    if linked_goal:
        link_html += f'<span class="note-link-badge">🎯 {linked_goal}</span>'
    if linked_account:
        link_html += f'<span class="note-link-badge">💰 {linked_account}</span>'

    date_str = _short_date(note.get("updated_at") or note.get("created_at") or "")
    wc = _word_count(content)
    pin_html = '<span class="note-pin">📌</span>' if is_pinned else ""
    pinned_cls = "pinned" if is_pinned else ""

    col_card, col_actions = st.columns([6, 1])
    with col_card:
        st.markdown(
            f"""<div class="note-card {pinned_cls}">
              <div class="note-title-row">
                <span class="note-title">{note['title']}</span>
                {pin_html}
              </div>
              <div class="note-preview">{preview}</div>
              <div class="note-footer">
                {tag_html} {mood_html} {link_html}
                <span class="note-date">{date_str}</span>
                <span class="note-wc">{wc} words</span>
              </div>
            </div>""",
            unsafe_allow_html=True,
        )
    with col_actions:
        if st.button("📖", key=f"view_{note['id']}", help="Read"):
            st.session_state["viewing_note_id"] = note["id"]
            st.session_state["editing_note_id"] = None
            st.rerun()
        if st.button("✏️", key=f"edit_{note['id']}", help="Edit"):
            st.session_state["editing_note_id"] = note["id"]
            st.session_state["viewing_note_id"] = None
            st.rerun()


def _render_reading_view(user_id: str, note_id: str) -> None:
    """Full reading pane with rendered markdown."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM notes WHERE id=? AND user_id=?", (note_id, user_id)).fetchone()
    conn.close()
    if not row:
        st.warning("Note not found.")
        st.session_state["viewing_note_id"] = None
        return
    note = dict(row)

    col_back, col_actions = st.columns([1, 3])
    with col_back:
        if st.button("← Back", use_container_width=True, key="note_back"):
            st.session_state["viewing_note_id"] = None
            st.rerun()
    with col_actions:
        ac1, ac2, ac3 = st.columns(3)
        with ac1:
            if st.button("✏️ Edit", use_container_width=True, key="note_to_edit"):
                st.session_state["editing_note_id"] = note_id
                st.session_state["viewing_note_id"] = None
                st.rerun()
        with ac2:
            is_pinned = note.get("is_pinned", 0)
            pin_label = "Unpin" if is_pinned else "📌 Pin"
            if st.button(pin_label, use_container_width=True, key="note_pin_toggle"):
                update_row("notes", {"is_pinned": 0 if is_pinned else 1}, {"id": note_id})
                st.rerun()
        with ac3:
            if st.button("🗑 Delete", use_container_width=True, key="note_delete_read"):
                delete_row("notes", {"id": note_id})
                st.session_state["viewing_note_id"] = None
                st.rerun()

    content = note.get("content") or ""
    tags_raw = note.get("tags") or ""
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
    mood = note.get("mood") or ""
    mood_emoji, mood_label = _MOOD_MAP.get(mood, ("", ""))
    linked_goal = note.get("linked_goal") or ""
    linked_account = note.get("linked_account") or ""

    # Meta line
    meta_parts = []
    meta_parts.append(_format_date(note.get("updated_at") or note.get("created_at") or ""))
    meta_parts.append(f"{_word_count(content)} words")
    meta_parts.append(_reading_time(content))
    if mood_emoji:
        meta_parts.append(f"{mood_emoji} {mood_label}")
    if linked_goal:
        meta_parts.append(f"🎯 {linked_goal}")
    if linked_account:
        meta_parts.append(f"💰 {linked_account}")

    tag_html = " ".join(f'<span class="note-tag">{t}</span>' for t in tags)

    st.markdown(
        f"""<div class="reading-pane">
          <div class="reading-title">{note['title']}</div>
          <div class="reading-meta">
            {'  ·  '.join(meta_parts)}
          </div>
          <div>{tag_html}</div>
        </div>""",
        unsafe_allow_html=True,
    )

    st.markdown(content)


def _render_edit_view(user_id: str, note_id: str) -> None:
    """Full edit form for an existing note."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM notes WHERE id=? AND user_id=?", (note_id, user_id)).fetchone()
    conn.close()
    if not row:
        st.warning("Note not found.")
        st.session_state["editing_note_id"] = None
        return
    note = dict(row)

    col_back, _ = st.columns([1, 5])
    with col_back:
        if st.button("← Back", use_container_width=True, key="edit_back"):
            st.session_state["editing_note_id"] = None
            st.rerun()

    goals = fetch_rows("goals", {"user_id": user_id})
    goal_names = [""] + [g["name"] for g in goals if not g.get("is_completed")]

    with st.form("edit_note_form"):
        e_title = st.text_input("Title", value=note["title"], key="e_title")
        e_content = st.text_area("Content (supports Markdown)", value=note.get("content") or "", height=300, key="e_content")

        col_t, col_m = st.columns(2)
        with col_t:
            e_tags = st.text_input("Tags (comma-separated)", value=note.get("tags") or "", key="e_tags")
        with col_m:
            mood_options = list(_MOOD_MAP.keys())
            mood_labels = [f"{v[0]} {v[1]}" if v[0] else "No mood" for v in _MOOD_MAP.values()]
            current_mood = note.get("mood") or ""
            mood_idx = mood_options.index(current_mood) if current_mood in mood_options else 0
            e_mood = st.selectbox("Mood", options=mood_options, format_func=lambda x: f"{_MOOD_MAP[x][0]} {_MOOD_MAP[x][1]}" if _MOOD_MAP[x][0] else "No mood", index=mood_idx, key="e_mood")

        col_g, col_p = st.columns(2)
        with col_g:
            current_goal = note.get("linked_goal") or ""
            goal_idx = goal_names.index(current_goal) if current_goal in goal_names else 0
            e_goal = st.selectbox("Link to Goal", options=goal_names, index=goal_idx, key="e_goal")
        with col_p:
            is_pinned = st.checkbox("📌 Pin this note", value=bool(note.get("is_pinned")), key="e_pin")

        c1, c2, c3 = st.columns(3)
        saved = c1.form_submit_button("Save", type="primary", use_container_width=True)
        cancelled = c2.form_submit_button("Cancel", use_container_width=True)
        deleted = c3.form_submit_button("🗑 Delete", use_container_width=True)

        if saved and e_title:
            update_row("notes", {
                "title": e_title, "content": e_content, "tags": e_tags,
                "mood": e_mood, "linked_goal": e_goal, "is_pinned": 1 if is_pinned else 0,
                "updated_at": _now_iso(),
            }, {"id": note_id})
            st.session_state["editing_note_id"] = None
            st.rerun()
        elif cancelled:
            st.session_state["editing_note_id"] = None
            st.rerun()
        elif deleted:
            delete_row("notes", {"id": note_id})
            st.session_state["editing_note_id"] = None
            st.rerun()

    # Live markdown preview
    if e_content:
        with st.expander("Markdown Preview", expanded=False):
            st.markdown(e_content)


def _render_create_form(user_id: str) -> None:
    """New note creation form with template support."""
    goals = fetch_rows("goals", {"user_id": user_id})
    goal_names = [""] + [g["name"] for g in goals if not g.get("is_completed")]

    tpl_title = st.session_state.pop("tpl_title", "")
    tpl_content = st.session_state.pop("tpl_content", "")
    tpl_tags = st.session_state.pop("tpl_tags", "")

    with st.form("new_note_form", clear_on_submit=True):
        n_title = st.text_input("Title", value=tpl_title, placeholder="Note title...", key="nn_title")
        n_content = st.text_area("Content (supports Markdown)", value=tpl_content, placeholder="Start writing... (Markdown supported: **bold**, *italic*, ## headings, - lists)", height=250, key="nn_content")

        col_t, col_m = st.columns(2)
        with col_t:
            n_tags = st.text_input("Tags (comma-separated)", value=tpl_tags, placeholder="e.g. finance, ideas, health", key="nn_tags")
        with col_m:
            mood_options = list(_MOOD_MAP.keys())
            n_mood = st.selectbox("Mood (optional)", options=mood_options, format_func=lambda x: f"{_MOOD_MAP[x][0]} {_MOOD_MAP[x][1]}" if _MOOD_MAP[x][0] else "No mood", key="nn_mood")

        col_g, col_p = st.columns(2)
        with col_g:
            n_goal = st.selectbox("Link to Goal (optional)", options=goal_names, key="nn_goal")
        with col_p:
            n_pinned = st.checkbox("📌 Pin this note", key="nn_pin")

        c1, c2 = st.columns(2)
        submitted = c1.form_submit_button("Save Note", type="primary", use_container_width=True)
        cancelled = c2.form_submit_button("Cancel", use_container_width=True)

        if submitted and n_title:
            now_iso = _now_iso()
            insert_row("notes", {
                "id": _uid(), "user_id": user_id,
                "title": n_title, "content": n_content, "tags": n_tags,
                "mood": n_mood, "linked_goal": n_goal, "linked_account": "",
                "is_pinned": 1 if n_pinned else 0,
                "created_at": now_iso, "updated_at": now_iso,
            })
            st.session_state["show_note_form"] = False
            st.session_state["show_template_picker"] = False
            st.success(f"Saved: {n_title}")
            st.rerun()
        elif cancelled:
            st.session_state["show_note_form"] = False
            st.session_state["show_template_picker"] = False
            st.rerun()
