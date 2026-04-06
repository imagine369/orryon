"""
app.py — orryon v1  |  Your personal Finance + Daily Life OS.

Run:
    streamlit run app.py

Architecture:
  Landing page  : Grok-style hero, OTP sign-in/sign-up
  Post-login    : 5 tabs (Dashboard · Budget · Forecast · Schedule · Notes)
                  + persistent "Ask orryon" floating chat input
  AI brain      : core/grok_agent.py → direct xAI Grok API with tool calling
  Data          : SQLite via db.py — fully local, zero cloud
"""

from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime

import streamlit as st

from config import APP_URL, USER_ID, XAI_API_KEY
from db import (
    create_verification_code,
    fetch_rows,
    get_or_create_user_by_email,
    load_chat_history,
    save_chat_message,
    verify_code,
)
from email_sender import send_verification_code

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# PAGE CONFIG
# ─────────────────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="orryon",
    page_icon="💰",
    layout="centered",
    initial_sidebar_state="collapsed",
)

# PWA manifest + service worker
st.markdown("""
<link rel="manifest" href="/app/static/manifest.json">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="orryon">
<link rel="apple-touch-icon" href="/app/static/icon-192.png">
<meta name="theme-color" content="#000000">
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/app/static/sw.js', { scope: '/app/static/' })
        .then(function (reg) { console.log('[orryon] SW registered', reg.scope); })
        .catch(function (err) { console.warn('[orryon] SW failed', err); });
    });
  }
</script>
""", unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────────────────
# SESSION STATE
# ─────────────────────────────────────────────────────────────────────────────

def _init_state() -> None:
    defaults = {
        "chat_history": [],
        "data_loaded": False,
        "last_sync": None,
        "screen": "home",
        "user_id": None,
        "display_name": "",
        "auth_error": "",
        "auth_step": "email",
        "auth_pending_email": "",
        "auth_code_sent": False,
        "auth_dev_code": "",
        "orryon_last_message": "",
        "orryon_actions": [],
        "show_chat_history": False,
        "active_tab": 0,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


_init_state()


# ─────────────────────────────────────────────────────────────────────────────
# PRE-LOGIN  (landing + auth)
# ─────────────────────────────────────────────────────────────────────────────

if not st.session_state.data_loaded:

    # Load avatar once
    _avatar_path = "assets/tribble.png"
    if os.path.exists(_avatar_path):
        with open(_avatar_path, "rb") as _f:
            _raw = _f.read()
        _b64 = base64.b64encode(_raw).decode()
        _mime = "jpeg" if _raw[:3] == b"\xff\xd8\xff" else "png"
    else:
        _b64, _mime = "", "png"

    # Handle ?action= query param from top-nav links
    _action = st.query_params.get("action", "")
    if _action in ("signin", "signup"):
        st.session_state.screen = "signin"
        st.session_state.auth_step = "email"
        st.session_state.auth_error = ""
        st.query_params.clear()
        st.rerun()

    # ── Shared pre-login CSS ─────────────────────────────────────────────────
    st.markdown("""
<style>
  [data-testid="stAppViewContainer"],[data-testid="stMain"],
  [data-testid="stHeader"],.stApp,section[data-testid="stMain"]>div{background:#000!important}
  #MainMenu,footer{visibility:hidden}
  [data-testid="stHeader"]{display:none!important}
  [data-testid="stSidebar"]{display:none!important}
  [data-testid="stToolbar"]{display:none!important}
  [data-testid="stDecoration"]{display:none!important}
  .block-container{
    min-height:100vh!important; display:flex!important; flex-direction:column!important;
    padding:0.75rem 1rem 1rem!important; max-width:480px!important;
    background:transparent!important;
  }
  .auth-btn>button{
    width:100%!important; border-radius:50px!important;
    padding:0.72rem 0!important; font-size:0.97rem!important;
    font-weight:600!important; box-shadow:none!important;
  }
  .auth-btn-white>button{background:#fff!important;border:none!important;color:#000!important}
  .auth-btn-white>button:hover{background:#e8e8e8!important}
  .auth-btn-outline>button{background:transparent!important;border:1.5px solid rgba(255,255,255,0.35)!important;color:#fff!important}
  .auth-btn-outline>button:hover{border-color:rgba(255,255,255,.7)!important}
  .auth-input input{
    background:#111!important; color:#fff!important;
    border:1px solid rgba(255,255,255,.20)!important;
    border-radius:6px!important; font-size:0.97rem!important;
  }
  .auth-input input:focus{border-color:rgba(255,255,255,.55)!important}
  .fixed-topnav {
    position: fixed; top: 0.75rem; right: 0.9rem;
    display: flex; gap: 0.45rem; z-index: 9999;
    align-items: center;
  }
  .fixed-topnav a {
    text-decoration: none; border-radius: 50px;
    padding: 0.48rem 1.15rem; font-size: 0.93rem;
    font-weight: 600; cursor: pointer; letter-spacing: 0.1px;
  }
  .fixed-topnav a.btn-si {
    background: transparent;
    border: 1.5px solid rgba(255,255,255,0.40);
    color: #fff;
  }
  .fixed-topnav a.btn-si:hover { border-color: rgba(255,255,255,0.75); }
  .fixed-topnav a.btn-su {
    background: #fff; border: none; color: #000;
  }
  .fixed-topnav a.btn-su:hover { background: #e5e5e5; }
</style>
""", unsafe_allow_html=True)

    # Fixed Sign in / Sign up buttons
    st.markdown("""
<div class="fixed-topnav">
  <a href="?action=signin" class="btn-si">Sign in</a>
  <a href="?action=signup" class="btn-su">Sign up</a>
</div>
""", unsafe_allow_html=True)

    # ── SCREEN: SIGN IN / SIGN UP ────────────────────────────────────────────
    if st.session_state.screen == "signin":
        _tc, _tlogo, _ = st.columns([1, 1, 1])
        with _tc:
            if st.button("✕", key="si_close"):
                st.session_state.screen = "home"
                st.session_state.auth_step = "email"
                st.session_state.auth_pending_email = ""
                st.session_state.auth_error = ""
                st.session_state.auth_dev_code = ""
                st.rerun()
        with _tlogo:
            if _b64:
                st.markdown(
                    f'<div style="text-align:center">'
                    f'<img src="data:image/{_mime};base64,{_b64}" '
                    f'style="width:32px;height:32px;border-radius:50%;object-fit:cover"/></div>',
                    unsafe_allow_html=True,
                )

        st.markdown("<br>", unsafe_allow_html=True)

        # Step 1: email
        if st.session_state.auth_step == "email":
            st.markdown("## Sign in to orryon")
            st.markdown(
                '<p style="color:#888;font-size:0.9rem;margin:0 0 1.2rem;">'
                "Enter your email — we'll send a verification code."
                "</p>",
                unsafe_allow_html=True,
            )
            st.markdown('<div class="auth-input">', unsafe_allow_html=True)
            otp_email = st.text_input(
                "Email address", placeholder="you@example.com",
                label_visibility="collapsed", key="otp_email_input",
            )
            st.markdown('</div>', unsafe_allow_html=True)
            st.markdown(
                '<p style="font-size:0.75rem;color:#555;margin:0.4rem 0 1rem;">'
                "Works with Gmail · Outlook · iCloud · Yahoo · any email"
                "</p>",
                unsafe_allow_html=True,
            )
            if st.session_state.auth_error:
                st.error(st.session_state.auth_error)
            st.markdown('<div class="auth-btn auth-btn-white">', unsafe_allow_html=True)
            if st.button("Send code →", use_container_width=True, key="otp_send"):
                _email_val = otp_email.strip().lower()
                if not _email_val or "@" not in _email_val:
                    st.session_state.auth_error = "Please enter a valid email address."
                    st.rerun()
                else:
                    _code = create_verification_code(_email_val)
                    _sent = send_verification_code(_email_val, _code)
                    st.session_state.auth_pending_email = _email_val
                    st.session_state.auth_step = "code"
                    st.session_state.auth_error = ""
                    st.session_state.auth_code_sent = _sent
                    st.session_state.auth_dev_code = "" if _sent else _code
                    st.rerun()
            st.markdown('</div>', unsafe_allow_html=True)

        # Step 2: OTP code
        else:
            _pending = st.session_state.auth_pending_email
            st.markdown("## Check your email")
            if st.session_state.auth_code_sent:
                st.markdown(
                    f'<p style="color:#888;font-size:0.9rem;margin:0 0 1.2rem;">'
                    f"Code sent to <strong style='color:#fff'>{_pending}</strong>.<br>"
                    f"Check your inbox and enter the 6-digit code below."
                    f"</p>",
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    '<p style="color:#888;font-size:0.9rem;margin:0 0 0.6rem;">'
                    "SMTP not configured — your code is shown below (dev mode)."
                    "</p>",
                    unsafe_allow_html=True,
                )
                st.markdown(
                    f'<div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;'
                    f'padding:16px;text-align:center;margin-bottom:1rem;">'
                    f'<span style="font-size:2rem;font-weight:700;letter-spacing:8px;color:#fff;">'
                    f'{st.session_state.auth_dev_code}</span>'
                    f'<p style="color:#555;font-size:0.75rem;margin:8px 0 0;">'
                    f'Dev mode — set SMTP in .env to send real emails</p>'
                    f'</div>',
                    unsafe_allow_html=True,
                )

            st.markdown('<div class="auth-input">', unsafe_allow_html=True)
            otp_code = st.text_input(
                "Verification code", placeholder="6-digit code",
                label_visibility="collapsed", key="otp_code_input",
                max_chars=6,
            )
            st.markdown('</div>', unsafe_allow_html=True)
            if st.session_state.auth_error:
                st.error(st.session_state.auth_error)
            st.markdown('<div class="auth-btn auth-btn-white">', unsafe_allow_html=True)
            if st.button("Verify →", use_container_width=True, key="otp_verify"):
                _code_val = otp_code.strip()
                if not _code_val or len(_code_val) != 6:
                    st.session_state.auth_error = "Please enter the 6-digit code."
                    st.rerun()
                elif verify_code(_pending, _code_val):
                    _user = get_or_create_user_by_email(_pending)
                    st.session_state.auth_error = ""
                    st.session_state.auth_step = "email"
                    st.session_state.auth_pending_email = ""
                    st.session_state.auth_dev_code = ""
                    st.session_state.user_id = _user["id"]
                    st.session_state.display_name = _user["display_name"]
                    st.session_state.chat_history = load_chat_history(_user["id"])
                    # Seed sample data on first login
                    existing_txns = fetch_rows("transactions", {"user_id": _user["id"]})
                    if not existing_txns:
                        from core.tools import seed_sample_data
                        seed_sample_data(_user["id"])
                    st.session_state.data_loaded = True
                    st.session_state.last_sync = datetime.now().isoformat()
                    st.session_state.screen = "home"
                    st.rerun()
                else:
                    st.session_state.auth_error = "Invalid or expired code. Please try again."
                    st.rerun()
            st.markdown('</div>', unsafe_allow_html=True)
            st.markdown('<div class="auth-btn auth-btn-outline" style="margin-top:0.5rem">', unsafe_allow_html=True)
            if st.button("← Resend / use different email", use_container_width=True, key="otp_back"):
                st.session_state.auth_step = "email"
                st.session_state.auth_error = ""
                st.session_state.auth_dev_code = ""
                st.rerun()
            st.markdown('</div>', unsafe_allow_html=True)

        st.stop()

    # ── SCREEN: HOME (landing page) ──────────────────────────────────────────
    st.markdown(f"""
<style>
  [data-testid="stAppViewContainer"],[data-testid="stMain"],
  [data-testid="stHeader"],.stApp,section[data-testid="stMain"]>div{{background:#000!important}}
  #MainMenu,footer{{visibility:hidden}}
  [data-testid="stHeader"]{{display:none!important}}
  [data-testid="stSidebar"]{{display:none!important}}
  .block-container{{
    min-height:100vh!important; display:flex!important; flex-direction:column!important;
    padding:0.75rem 1rem 1rem!important; max-width:480px!important;
    background:transparent!important;
  }}
  .hero-center{{
    position:fixed; top:calc(50% - 120px); left:50%;
    transform:translate(-50%,-50%);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    text-align:center; gap:0.6rem; z-index:1;
  }}
  .hero-avatar{{width:110px;height:110px;border-radius:50%;object-fit:cover}}
  .hero-name{{
    font-size:2rem;font-weight:800;letter-spacing:2px;
    color:#fff;text-transform:uppercase;margin-top:-8px;
  }}
  .hero-tagline{{
    font-size:0.88rem;color:rgba(255,255,255,0.45);
    max-width:280px;line-height:1.5;margin-top:2px;
  }}
  [data-testid="stBottom"]{{background:transparent!important;padding-bottom:0.5rem!important}}
  [data-testid="stChatInputContainer"]{{
    background:#1c1c1e!important;
    border:1px solid rgba(255,255,255,0.10)!important;
    border-radius:28px!important; padding:0.15rem 0.5rem!important;
  }}
  [data-testid="stChatInputContainer"] textarea{{color:#fff!important;background:transparent!important;font-size:1rem!important}}
  [data-testid="stChatInputContainer"] textarea::placeholder{{color:rgba(255,255,255,0.38)!important}}
  [data-testid="stChatInputSubmitButton"]>button{{
    background:#fff!important;border-radius:50%!important;color:#000!important;
    width:2.2rem!important;height:2.2rem!important;padding:0!important;
  }}
  [data-testid="stBottom"],[data-testid="stBottom"]>div,
  [data-testid="stChatInput"],.stChatFloatingInputContainer{{
    background:transparent!important;padding-bottom:3.8rem!important;
  }}
  .bottom-note{{
    position:fixed;bottom:0.6rem;left:0;right:0;text-align:center;
    font-size:0.70rem;color:rgba(255,255,255,0.22);z-index:1000;margin:0;
  }}
</style>
""", unsafe_allow_html=True)

    if _b64:
        st.markdown(
            f"""<div class="hero-center">
              <img src="data:image/{_mime};base64,{_b64}" class="hero-avatar" />
              <div class="hero-name">orryon</div>
              <div class="hero-tagline">Your personal Finance + Daily Life OS.<br>Just tell orryon what to do.</div>
            </div>""",
            unsafe_allow_html=True,
        )

    # Landing page chat input — routes to sign-in
    _landing_query = st.chat_input("What can orryon help you with?")
    if _landing_query:
        st.session_state.screen = "signin"
        st.session_state.auth_step = "email"
        st.rerun()

    st.markdown(
        '<p class="bottom-note">By using orryon, all data stays on your device.</p>',
        unsafe_allow_html=True,
    )
    st.stop()


# ─────────────────────────────────────────────────────────────────────────────
# POST-LOGIN APP
# ─────────────────────────────────────────────────────────────────────────────

_active_uid = st.session_state.get("user_id") or USER_ID
_display_name = st.session_state.get("display_name", "")

# ── Global app CSS ────────────────────────────────────────────────────────────
st.markdown("""
<style>
  /* ── Base ── */
  [data-testid="stAppViewContainer"],[data-testid="stMain"],.stApp,
  section[data-testid="stMain"]>div{background:#0a0a10!important}
  #MainMenu,footer{visibility:hidden}
  [data-testid="stHeader"]{display:none!important}
  [data-testid="stSidebar"]{display:none!important}
  [data-testid="stToolbar"]{display:none!important}
  [data-testid="stDecoration"]{display:none!important}
  .block-container{
    padding-top:0.5rem!important; padding-bottom:6rem!important;
    padding-left:1rem!important; padding-right:1rem!important;
    max-width:700px!important;
  }

  /* ── Tabs ── */
  .stTabs [data-baseweb="tab-list"]{
    background:#111118!important; border-radius:12px; padding:3px; gap:2px;
    border:1px solid rgba(255,255,255,0.07);
  }
  .stTabs [data-baseweb="tab"]{
    border-radius:9px!important; padding:6px 14px!important;
    font-size:0.83rem!important; font-weight:500!important;
    color:rgba(255,255,255,0.5)!important; background:transparent!important;
  }
  .stTabs [aria-selected="true"]{
    background:rgba(255,255,255,0.08)!important;
    color:#fff!important;
  }
  .stTabs [data-baseweb="tab-highlight"]{display:none!important}
  .stTabs [data-baseweb="tab-border"]{display:none!important}

  /* ── Metrics ── */
  [data-testid="stMetricValue"]{font-size:1.4rem!important;font-weight:700!important}

  /* ── Buttons ── */
  .stButton>button{
    border-radius:10px!important;
    border:1px solid rgba(255,255,255,0.12)!important;
    background:rgba(255,255,255,0.05)!important;
    color:#fff!important; font-weight:500!important;
  }
  .stButton>button[kind="primary"]{
    background:linear-gradient(135deg,#00c9ff,#92fe9d)!important;
    border:none!important; color:#000!important; font-weight:700!important;
  }

  /* ── Floating orryon chat input ── */
  [data-testid="stBottom"]{
    background:rgba(10,10,16,0.92)!important;
    backdrop-filter:blur(12px)!important;
    border-top:1px solid rgba(255,255,255,0.07)!important;
    padding:0.5rem 1rem 0.6rem!important;
  }
  [data-testid="stChatInputContainer"]{
    background:#1c1c1e!important;
    border:1px solid rgba(255,255,255,0.12)!important;
    border-radius:28px!important; padding:0.1rem 0.5rem!important;
  }
  [data-testid="stChatInputContainer"] textarea{
    color:#fff!important; background:transparent!important;
    font-size:0.95rem!important;
  }
  [data-testid="stChatInputContainer"] textarea::placeholder{
    color:rgba(255,255,255,0.35)!important;
  }
  [data-testid="stChatInputSubmitButton"]>button{
    background:linear-gradient(135deg,#00c9ff,#92fe9d)!important;
    border-radius:50%!important;color:#000!important;
    width:2.1rem!important;height:2.1rem!important;padding:0!important;
  }

  /* ── orryon response banner ── */
  .orryon-response{
    background:linear-gradient(135deg,rgba(0,201,255,0.08),rgba(146,254,157,0.06));
    border:1px solid rgba(0,201,255,0.2); border-radius:14px;
    padding:0.9rem 1.1rem; margin:0 0 0.75rem;
    font-size:0.88rem; line-height:1.55; color:#e2e8f0;
  }
  .orryon-badge{
    display:inline-flex; align-items:center; gap:0.3rem;
    background:rgba(0,201,255,0.12); border-radius:20px;
    padding:2px 10px; font-size:0.72rem; color:#00c9ff;
    font-weight:600; margin-bottom:0.45rem;
  }

  /* ── Chat history ── */
  .chat-bubble-user{
    background:#1e3a5f; border-radius:16px 16px 4px 16px;
    padding:0.65rem 0.9rem; margin:0.3rem 0;
    border-left:3px solid #00c9ff; font-size:0.87rem;
  }
  .chat-bubble-ai{
    background:#131a1a; border-radius:16px 16px 16px 4px;
    padding:0.65rem 0.9rem; margin:0.3rem 0;
    border-left:3px solid #92fe9d; font-size:0.87rem;
  }

  /* ── Inputs ── */
  .stTextInput input,.stTextArea textarea,.stNumberInput input,.stSelectbox select{
    background:#131320!important; border:1px solid rgba(255,255,255,0.12)!important;
    border-radius:8px!important; color:#fff!important;
  }
  .stDateInput input{background:#131320!important;color:#fff!important}

  /* ── Expander ── */
  .streamlit-expanderHeader{font-size:0.86rem!important}

  /* ── Dataframe ── */
  .stDataFrame{font-size:0.82rem!important}
</style>
""", unsafe_allow_html=True)


# ── Top bar ───────────────────────────────────────────────────────────────────
_avatar_path = "assets/tribble.png"
if os.path.exists(_avatar_path):
    with open(_avatar_path, "rb") as _f:
        _raw = _f.read()
    _b64 = base64.b64encode(_raw).decode()
    _mime = "jpeg" if _raw[:3] == b"\xff\xd8\xff" else "png"
    _avatar_html = f'<img src="data:image/{_mime};base64,{_b64}" style="width:32px;height:32px;border-radius:50%;object-fit:cover"/>'
else:
    _avatar_html = "💰"

col_logo, col_title, col_menu = st.columns([1, 5, 1])
with col_logo:
    st.markdown(_avatar_html, unsafe_allow_html=True)
with col_title:
    st.markdown(
        '<h2 style="margin:0;font-size:1.25rem;font-weight:800;'
        'background:linear-gradient(135deg,#00c9ff,#92fe9d);'
        '-webkit-background-clip:text;-webkit-text-fill-color:transparent;">orryon</h2>',
        unsafe_allow_html=True,
    )
with col_menu:
    with st.popover("☰"):
        st.markdown(f"👤 **{_display_name or 'You'}**")
        st.caption("orryon · Local-first · Private")
        st.divider()
        if not XAI_API_KEY:
            st.warning("⚠️ XAI_API_KEY not set — orryon AI disabled")
            st.caption("Add your key at [console.x.ai](https://console.x.ai)")
        else:
            st.success("✅ Grok AI connected")
        st.divider()
        st.caption("🔒 All data in `finance.db`")
        st.caption(f"Model: `{os.getenv('GROK_MODEL', 'grok-3-mini')}`")
        st.divider()
        if st.button("← Sign out", use_container_width=True):
            for key in ["data_loaded", "user_id", "display_name", "chat_history",
                        "orryon_last_message", "orryon_actions"]:
                if key in st.session_state:
                    del st.session_state[key]
            st.session_state.screen = "home"
            st.rerun()


# ── orryon last response banner ───────────────────────────────────────────────
if st.session_state.get("orryon_last_message"):
    st.markdown(
        f'<div class="orryon-response">'
        f'<div class="orryon-badge">✦ orryon</div><br>'
        f'{st.session_state.orryon_last_message}'
        f'</div>',
        unsafe_allow_html=True,
    )
    col_dismiss, col_history = st.columns([3, 1])
    with col_dismiss:
        if st.button("✕ Dismiss", key="dismiss_resp", use_container_width=False):
            st.session_state.orryon_last_message = ""
            st.rerun()
    with col_history:
        if st.button(
            "🕐 History" if not st.session_state.show_chat_history else "Hide",
            key="toggle_hist",
            use_container_width=True,
        ):
            st.session_state.show_chat_history = not st.session_state.show_chat_history
            st.rerun()

# Chat history
if st.session_state.show_chat_history and st.session_state.chat_history:
    with st.expander("Conversation history", expanded=True):
        recent = st.session_state.chat_history[-20:]
        for msg in recent:
            if msg["role"] == "user":
                st.markdown(
                    f'<div class="chat-bubble-user">👤 {msg["content"]}</div>',
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    f'<div class="chat-bubble-ai">✦ orryon: {msg.get("content","")}</div>',
                    unsafe_allow_html=True,
                )


# ── 5 TABS ────────────────────────────────────────────────────────────────────
tab_dash, tab_budget, tab_forecast, tab_schedule, tab_notes = st.tabs([
    "📊 Dashboard",
    "💳 Budget",
    "📈 Forecast",
    "📅 Schedule",
    "📝 Notes",
])

with tab_dash:
    from ui.dashboard import render_dashboard
    render_dashboard(_active_uid)

with tab_budget:
    from ui.budget import render_budget
    render_budget(_active_uid)

with tab_forecast:
    from ui.forecast import render_forecast
    render_forecast(_active_uid)

with tab_schedule:
    from ui.schedule import render_schedule
    render_schedule(_active_uid)

with tab_notes:
    from ui.notes import render_notes
    render_notes(_active_uid)


# ── FLOATING "ASK ORRYON" INPUT ───────────────────────────────────────────────
# st.chat_input renders as a sticky bottom bar — it's always visible across all tabs.
_user_input = st.chat_input("Ask orryon anything…")

if _user_input:
    # Save user message
    _user_msg = {"role": "user", "content": _user_input}
    st.session_state.chat_history.append(_user_msg)
    save_chat_message(_active_uid, _user_msg)

    # Run orryon
    with st.spinner("orryon is thinking…"):
        try:
            from core.grok_agent import run_orryon
            result = run_orryon(
                user_message=_user_input,
                user_id=_active_uid,
                chat_history=st.session_state.chat_history[:-1],  # exclude the just-added msg
                user_name=_display_name or "there",
            )
        except Exception as exc:
            logger.error("run_orryon failed: %s", exc)
            result = {
                "message": f"Something went wrong: {exc}",
                "actions_taken": [],
                "tabs_to_refresh": [],
                "error": str(exc),
            }

    # Save orryon response
    _ai_msg = {"role": "assistant", "content": result["message"]}
    st.session_state.chat_history.append(_ai_msg)
    save_chat_message(_active_uid, _ai_msg)

    # Surface response + trigger re-render
    st.session_state.orryon_last_message = result["message"]
    st.session_state.orryon_actions = result.get("actions_taken", [])
    st.session_state.show_chat_history = False  # auto-hide history on new message
    st.rerun()
