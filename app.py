"""
app.py — orryon v1  |  Your intelligent personal concierge.

Run:
    streamlit run app.py

Architecture:
  Landing page  : Grok-style hero, OTP sign-in/sign-up
  Post-login    : 6 tabs (Dashboard · Budget · Forecast · Schedule · Goals · Notes)
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
        "lp_sending": False,
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

    # ── LANDING CSS ───────────────────────────────────────────────────────────
    st.markdown(f"""
<style>
  [data-testid="stAppViewContainer"],[data-testid="stMain"],
  [data-testid="stHeader"],.stApp,section[data-testid="stMain"]>div{{background:#000!important}}
  #MainMenu,footer{{visibility:hidden}}
  [data-testid="stHeader"]{{display:none!important}}
  [data-testid="stSidebar"]{{display:none!important}}
  .block-container{{
    padding:0 1.1rem 6rem!important;
    max-width:480px!important;
    background:transparent!important;
  }}
  /* ── Pill: the horizontal block that contains the input + send button ── */
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"]){{
    background:#1c1c1e!important;
    border:1px solid rgba(255,255,255,0.10)!important;
    border-radius:28px!important;
    padding:0 0.4rem 0 1rem!important;
    align-items:center!important;
    gap:0!important;
    max-width:420px;
    margin:0 auto;
  }}
  /* strip input chrome */
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"]{{flex:1!important;min-width:0!important;}}
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] label{{display:none!important}}
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] div[data-baseweb]{{
      background:transparent!important;border:none!important;box-shadow:none!important;
    }}
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] input{{
      background:transparent!important;border:none!important;box-shadow:none!important;
      color:#fff!important;font-size:1rem!important;
      padding:0.58rem 0.2rem!important;caret-color:#fff;
    }}
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] input::placeholder{{
      color:rgba(255,255,255,0.38)!important;
    }}
  /* send button column — no padding */
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stColumn"]:last-child{{
      padding:0!important;flex:0 0 auto!important;width:auto!important;
    }}
  /* the ● button — 50% of original (1.1rem × 1.1rem) */
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stButton"] button{{
      background:#fff!important;border:none!important;color:#000!important;
      border-radius:50%!important;
      width:1.55rem!important;height:1.55rem!important;
      min-height:unset!important;padding:0!important;
      font-size:0.7rem!important;line-height:1!important;
      transition:background 0.15s,transform 0.15s!important;
    }}
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stButton"] button:hover{{
      background:#d4d4d4!important;transform:scale(1.08)!important;
    }}
  /* Stop / Review bar above pill */
  .lp-action-bar{{
    display:flex;align-items:center;gap:0.55rem;
    max-width:420px;margin:0 auto 0.45rem;
    justify-content:flex-end;
  }}
  .lp-action-bar .stop-btn>button{{
    background:transparent!important;border:none!important;
    color:rgba(255,255,255,0.55)!important;
    font-size:0.82rem!important;font-weight:500!important;
    padding:0.2rem 0.5rem!important;min-height:unset!important;
    border-radius:6px!important;
  }}
  .lp-action-bar .stop-btn>button:hover{{color:#fff!important;background:rgba(255,255,255,0.06)!important;}}
  .lp-action-bar .review-btn>button{{
    background:rgba(255,255,255,0.08)!important;
    border:1px solid rgba(255,255,255,0.15)!important;
    color:#fff!important;font-size:0.82rem!important;font-weight:600!important;
    padding:0.2rem 0.75rem!important;min-height:unset!important;
    border-radius:6px!important;
  }}
  .lp-action-bar .review-btn>button:hover{{background:rgba(255,255,255,0.14)!important;}}
  /* ── Upload animation ── */
  @keyframes arrowUp{{
    0%  {{transform:translateY(0);opacity:1;}}
    60% {{transform:translateY(-10px);opacity:0;}}
    100%{{transform:translateY(-10px);opacity:0;}}
  }}
  @keyframes btnShrink{{
    0%  {{transform:scale(1);opacity:1;}}
    60% {{transform:scale(0.7);opacity:0.5;}}
    100%{{transform:scale(0.5);opacity:0;}}
  }}
  @keyframes pillFade{{
    0%  {{opacity:1;}}
    100%{{opacity:0.35;}}
  }}
  .lp-sending-pill{{
    background:#1c1c1e;border:1px solid rgba(255,255,255,0.10);
    border-radius:28px;padding:0 0.4rem 0 1rem;
    max-width:420px;margin:0 auto;
    display:flex;align-items:center;gap:0;
    animation:pillFade 0.45s ease forwards;
  }}
  .lp-sending-pill .sending-text{{
    flex:1;color:rgba(255,255,255,0.38);font-size:1rem;padding:0.58rem 0.2rem;
  }}
  .lp-sending-pill .sending-btn{{
    width:1.55rem;height:1.55rem;background:#fff;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    overflow:hidden;position:relative;flex-shrink:0;
    animation:btnShrink 0.45s ease forwards;
  }}
  .lp-sending-pill .sending-btn span{{
    font-size:0.7rem;color:#000;
    animation:arrowUp 0.45s ease forwards;
  }}
  /* Section divider */
  .lp-divider{{
    border:none;border-top:1px solid rgba(255,255,255,0.07);
    margin:3.5rem 0 3rem;
  }}
  /* How It Works steps */
  .hiw-step{{
    display:flex;align-items:flex-start;gap:1rem;
    padding:1.1rem 0;border-bottom:1px solid rgba(255,255,255,0.07);
  }}
  .hiw-num{{
    min-width:34px;height:34px;border-radius:50%;
    background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);
    display:flex;align-items:center;justify-content:center;
    font-weight:700;font-size:0.9rem;color:#fff;flex-shrink:0;margin-top:1px;
  }}
  .hiw-title{{margin:0 0 3px;font-size:0.95rem;font-weight:700;color:#fff;}}
  .hiw-desc{{margin:0;font-size:0.83rem;color:rgba(255,255,255,0.42);line-height:1.55;}}
  /* Example cards */
  .ex-card{{
    background:#0f0f0f;border:1px solid rgba(255,255,255,0.09);
    border-radius:12px;padding:0.88rem 1.1rem;
    font-size:0.93rem;color:#e2e8f0;
    margin-bottom:0.6rem;line-height:1.4;
  }}
  .ex-card::before{{content:'"';color:rgba(255,255,255,0.22);margin-right:1px;}}
  .ex-card::after{{content:'"';color:rgba(255,255,255,0.22);margin-left:1px;}}
  /* CTA button */
  .lp-cta>button{{
    width:100%!important;border-radius:50px!important;
    padding:0.78rem 0!important;font-size:1rem!important;
    font-weight:700!important;box-shadow:none!important;
    background:#fff!important;border:none!important;color:#000!important;
  }}
  .lp-cta>button:hover{{background:#e8e8e8!important}}
  /* Feature list */
  .feat-row{{
    display:flex;align-items:center;gap:0.8rem;padding:0.6rem 0;
    border-bottom:1px solid rgba(255,255,255,0.06);
    font-size:0.88rem;color:rgba(255,255,255,0.62);
  }}
  .feat-icon{{font-size:1rem;min-width:26px;text-align:center;}}
  .bottom-note{{
    text-align:center;font-size:0.70rem;
    color:rgba(255,255,255,0.16);margin-top:2rem;
  }}
</style>
""", unsafe_allow_html=True)

    # ─── HERO ────────────────────────────────────────────────────────────────
    st.markdown("<div style='height:4.5rem'></div>", unsafe_allow_html=True)

    if _b64:
        st.markdown(
            f'<div style="display:flex;justify-content:center;margin-bottom:1.3rem;">'
            f'<img src="data:image/{_mime};base64,{_b64}" '
            f'style="width:96px;height:96px;border-radius:50%;object-fit:cover;"/></div>',
            unsafe_allow_html=True,
        )

    st.markdown(
        '<h1 style="text-align:center;font-size:2.2rem;font-weight:800;letter-spacing:2px;'
        'color:#fff;text-transform:uppercase;margin:0 0 0.45rem;">orryon</h1>',
        unsafe_allow_html=True,
    )
    st.markdown(
        '<p style="text-align:center;font-size:1.05rem;font-weight:600;'
        'color:rgba(255,255,255,0.75);margin:0 0 0.55rem;line-height:1.45;">'
        'Your intelligent personal concierge</p>',
        unsafe_allow_html=True,
    )
    st.markdown(
        '<p style="text-align:center;font-size:0.88rem;color:rgba(255,255,255,0.36);'
        'max-width:300px;margin:0 auto 1.8rem;line-height:1.65;">'
        'Just talk to him naturally — whether you\'re adding an expense, planning your week, tracking goals, or organizing your daily life. Orryon understands you and takes care of the rest.</p>',
        unsafe_allow_html=True,
    )

    # ── Sending animation (plays for one frame before redirect) ─────────────
    if st.session_state.get("lp_sending"):
        st.markdown(
            '<div class="lp-sending-pill">'
            '<span class="sending-text">Sending…</span>'
            '<div class="sending-btn"><span>↑</span></div>'
            '</div>',
            unsafe_allow_html=True,
        )
        import time as _t; _t.sleep(0.45)
        st.session_state.lp_sending = False
        st.session_state.screen    = "signin"
        st.session_state.auth_step = "email"
        st.rerun()

    # ── Stop / Review bar (shown when input has content) ─────────────────────
    _lp_current = st.session_state.get("lp_q", "")
    if _lp_current.strip():
        st.markdown('<div class="lp-action-bar">', unsafe_allow_html=True)
        _acol1, _acol2, _aspace = st.columns([1, 1.2, 3])
        with _acol1:
            st.markdown('<div class="stop-btn">', unsafe_allow_html=True)
            if st.button("Stop", key="lp_stop"):
                st.session_state.lp_q = ""
                st.rerun()
            st.markdown('</div>', unsafe_allow_html=True)
        with _acol2:
            st.markdown('<div class="review-btn">', unsafe_allow_html=True)
            with st.popover("Review →"):
                st.markdown(
                    f'<div style="background:#1c1c1e;border:1px solid rgba(255,255,255,0.1);'
                    f'border-radius:12px;padding:1rem 1.1rem;font-size:0.95rem;color:#e2e8f0;'
                    f'line-height:1.55;margin-bottom:0.8rem;">{_lp_current}</div>',
                    unsafe_allow_html=True,
                )
                if st.button("Send →", key="lp_review_confirm", use_container_width=True):
                    st.session_state.lp_sending = True
                    st.rerun()
            st.markdown('</div>', unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)

    # ── Pill: text input + ● send button ─────────────────────────────────────
    _pill_l, _pill_r = st.columns([20, 1])
    with _pill_l:
        st.text_input(
            "q", placeholder="What can orryon help you with?",
            label_visibility="collapsed", key="lp_q",
        )
    with _pill_r:
        if st.button("↑", key="lp_send_btn"):
            if st.session_state.get("lp_q", "").strip():
                st.session_state.lp_sending = True
            else:
                st.session_state.screen    = "signin"
                st.session_state.auth_step = "email"
            st.rerun()

    # ─── SECTION: HOW IT WORKS ───────────────────────────────────────────────
    st.markdown('<hr class="lp-divider">', unsafe_allow_html=True)
    st.markdown(
        '<p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.5px;'
        'color:rgba(255,255,255,0.28);text-align:center;margin:0 0 1.3rem;">How it works</p>',
        unsafe_allow_html=True,
    )
    st.markdown(
        '<h2 style="font-size:1.5rem;font-weight:800;color:#fff;margin:0 0 0.4rem;">'
        'Your all-in-one intelligent personal concierge</h2>',
        unsafe_allow_html=True,
    )

    _steps = [
        ("1", "Just tell Orryon what you need",
         "Speak naturally — “Add coffee and breakfast $9.50”, “Help me save $4000 for a vacation by December”, or “Doctor appointment next Tuesday at 10am”."),
        ("2", "Orryon understands and acts",
         "He takes care of the details — adding expenses, updating your schedule, tracking goals, and keeping your daily life organized."),
        ("3", "Everything updates automatically",
         "Your Dashboard, Budget, Forecast, Schedule, and Goals stay perfectly in sync in real time."),
        ("4", "Ask anything, get real answers",
         '“How much did I spend on dining this week?” “How close am I to my vacation goal?” Orryon gives you clear, helpful answers from your actual data.'),
    ]
    for num, title, desc in _steps:
        st.markdown(
            f'<div class="hiw-step">'
            f'<div class="hiw-num">{num}</div>'
            f'<div><p class="hiw-title">{title}</p><p class="hiw-desc">{desc}</p></div>'
            f'</div>',
            unsafe_allow_html=True,
        )

    # ─── SECTION: REAL EXAMPLES ──────────────────────────────────────────────
    st.markdown('<hr class="lp-divider">', unsafe_allow_html=True)
    st.markdown(
        '<p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.5px;'
        'color:rgba(255,255,255,0.28);text-align:center;margin:0 0 1.3rem;">Real examples</p>',
        unsafe_allow_html=True,
    )
    st.markdown(
        '<h2 style="font-size:1.5rem;font-weight:800;color:#fff;margin:0 0 0.4rem;">'
        "Here's what you can ask Orryon</h2>",
        unsafe_allow_html=True,
    )
    st.markdown(
        '<p style="font-size:0.87rem;color:rgba(255,255,255,0.38);margin:0 0 1.4rem;line-height:1.55;">'
        "No commands to learn. Just type like you're texting a friend.</p>",
        unsafe_allow_html=True,
    )

    for ex in [
        "Add coffee and breakfast $9.50",
        "Help me save $4000 for a vacation by December",
        "Add milk, eggs, bread, and chicken to my grocery list",
        "Doctor appointment on July 15 at 10am",
        "Give me a spending recap for this week",
    ]:
        st.markdown(f'<div class="ex-card">{ex}</div>', unsafe_allow_html=True)

    st.markdown(
        '<p style="font-size:0.82rem;color:rgba(255,255,255,0.32);margin:1.1rem 0 0;'
        'line-height:1.6;text-align:center;">'
        'Orryon understands natural language and automatically updates your budget, '
        'schedule, goals, and dashboard.</p>',
        unsafe_allow_html=True,
    )

    # ─── SECTION: GET STARTED CTA ────────────────────────────────────────────
    st.markdown('<hr class="lp-divider">', unsafe_allow_html=True)

    if _b64:
        st.markdown(
            f'<div style="display:flex;justify-content:center;margin-bottom:1.1rem;">'
            f'<img src="data:image/{_mime};base64,{_b64}" '
            f'style="width:54px;height:54px;border-radius:50%;object-fit:cover;opacity:0.85"/></div>',
            unsafe_allow_html=True,
        )

    st.markdown(
        '<h2 style="font-size:1.5rem;font-weight:800;color:#fff;margin:0 0 0.35rem;text-align:center;">'
        "You're ready to start</h2>",
        unsafe_allow_html=True,
    )
    st.markdown(
        '<p style="font-size:0.87rem;color:rgba(255,255,255,0.38);margin:0 0 1.8rem;'
        'line-height:1.6;text-align:center;">'
        'Free forever. All your data stays private on your device.</p>',
        unsafe_allow_html=True,
    )

    for icon, label in [
        ("💳", "Budget & expense tracking"),
        ("🎯", "Savings goals with progress"),
        ("📅", "Schedule, tasks & grocery list"),
        ("📊", "Smart spending recaps"),
        ("✦",  "Orryon — your intelligent personal concierge, always ready to help."),
    ]:
        st.markdown(
            f'<div class="feat-row">'
            f'<span class="feat-icon">{icon}</span>'
            f'<span>{label}</span></div>',
            unsafe_allow_html=True,
        )

    st.markdown("<div style='height:1.8rem'></div>", unsafe_allow_html=True)
    st.markdown('<div class="lp-cta">', unsafe_allow_html=True)
    if st.button("Create free account →", use_container_width=True, key="lp_final_cta"):
        st.session_state.screen = "signin"
        st.session_state.auth_step = "email"
        st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)

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

# ── Shared read-only view (finance_readonly token in URL) ─────────────────────
_qp = st.query_params
_share_token = _qp.get("share_token", "")
if _share_token and not st.session_state.get("user_id"):
    # Validate token and show read-only dashboard
    from db import get_connection as _gc
    _tc = _gc()
    _tok_row = _tc.execute(
        "SELECT user_id FROM share_tokens WHERE token=? AND is_active=1 AND view_type='finance_readonly'",
        (_share_token,),
    ).fetchone()
    _tc.close()
    if _tok_row:
        _active_uid = _tok_row["user_id"]
        st.markdown(
            '<div style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);'
            'border-radius:10px;padding:10px 14px;font-size:0.82rem;color:#a5b4fc;margin-bottom:8px;">'
            '👁️ <strong>Read-only view</strong> — This is a shared Finance Dashboard. Data is live but not editable.'
            '</div>',
            unsafe_allow_html=True,
        )
        from ui.dashboard import render_dashboard as _rdb
        _rdb(_active_uid)
        st.stop()
    else:
        st.error("Invalid or expired share link.")
        st.stop()

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
        st.markdown("**👁️ Shared View**")
        st.caption("Share a read-only link to your Dashboard with a partner or family member.")
        if st.button("🔗 Generate share link", use_container_width=True, key="gen_share"):
            import secrets as _sec
            from db import get_connection as _gc2, insert_row as _ins2
            _token = _sec.token_urlsafe(16)
            _gc3 = _gc2()
            _existing = _gc3.execute(
                "SELECT token FROM share_tokens WHERE user_id=? AND is_active=1 AND view_type='finance_readonly'",
                (_active_uid,),
            ).fetchone()
            _gc3.close()
            if _existing:
                _token = _existing["token"]
            else:
                _ins2("share_tokens", {
                    "id": str(__import__("uuid").uuid4()),
                    "user_id": _active_uid,
                    "token": _token,
                    "view_type": "finance_readonly",
                    "is_active": 1,
                    "created_at": datetime.now().isoformat(),
                })
            from config import APP_URL
            _share_url = f"{APP_URL}?share_token={_token}"
            st.code(_share_url, language=None)
            st.caption("Anyone with this link can view your Dashboard (read-only).")
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


# ── QUICK-ADD STRIP ──────────────────────────────────────────────────────────
# 4 small popover buttons for fast expense / task / grocery / note entry
_qa1, _qa2, _qa3, _qa4 = st.columns(4)

with _qa1:
    with st.popover("💸 Expense", use_container_width=True):
        st.markdown("**Quick Add Expense**")
        _qa_merchant = st.text_input("Merchant", placeholder="Starbucks", key="qa_merchant")
        _qa_amount = st.number_input("Amount ($)", min_value=0.01, step=1.0, key="qa_amount")
        _qa_cat = st.selectbox("Category", [
            "Food & Dining", "Groceries", "Transport", "Subscriptions",
            "Health & Fitness", "Shopping", "Rent & Housing", "Utilities",
            "Entertainment", "Travel", "Other"
        ], key="qa_cat")
        if st.button("Add", type="primary", use_container_width=True, key="qa_exp_submit"):
            if _qa_merchant and _qa_amount > 0:
                import json as _qjson
                from db import insert_row as _qi, get_connection as _qc
                from core.tools import _uid as _quid, _now_iso as _qnow
                from datetime import datetime as _qdt
                _qi("transactions", {
                    "id": _quid(), "user_id": _active_uid,
                    "date": _qdt.now().strftime("%Y-%m-%d"),
                    "amount": float(_qa_amount), "merchant": _qa_merchant,
                    "description": _qa_merchant, "category": _qa_cat,
                    "is_recurring": 0, "metadata": _qjson.dumps({}),
                })
                st.success(f"✅ ${_qa_amount:.2f} at {_qa_merchant}")
                st.rerun()

with _qa2:
    with st.popover("✅ Task", use_container_width=True):
        st.markdown("**Quick Add Task**")
        _qa_task = st.text_input("Task title", placeholder="Call dentist", key="qa_task")
        _qa_due = st.date_input("Due (optional)", value=None, key="qa_task_due")
        _qa_pri = st.selectbox("Priority", ["medium", "high", "low"], key="qa_task_pri")
        if st.button("Add", type="primary", use_container_width=True, key="qa_task_submit"):
            if _qa_task:
                from db import insert_row as _qi2
                from core.tools import _uid as _quid2, _now_iso as _qnow2
                _qi2("action_items", {
                    "id": _quid2(), "user_id": _active_uid,
                    "title": _qa_task, "description": "",
                    "priority": _qa_pri, "status": "open",
                    "due_date": _qa_due.strftime("%Y-%m-%d") if _qa_due else "",
                    "category": "personal", "created_by": "user",
                    "created_at": _qnow2(), "updated_at": _qnow2(),
                })
                st.success(f"✅ Task added!")
                st.rerun()

with _qa3:
    with st.popover("🛒 Grocery", use_container_width=True):
        st.markdown("**Quick Add to Grocery List**")
        _qa_item = st.text_input("Item name", placeholder="Milk, eggs…", key="qa_groc")
        _qa_qty = st.text_input("Quantity", value="1", key="qa_groc_qty")
        if st.button("Add", type="primary", use_container_width=True, key="qa_groc_submit"):
            if _qa_item:
                from db import insert_row as _qi3
                from core.tools import _uid as _quid3, _now_iso as _qnow3
                _qi3("grocery_items", {
                    "id": _quid3(), "user_id": _active_uid,
                    "name": _qa_item, "quantity": _qa_qty,
                    "estimated_price": 0, "is_checked": 0, "added_at": _qnow3(),
                })
                st.success(f"🛒 {_qa_item} added!")
                st.rerun()

with _qa4:
    with st.popover("📝 Note", use_container_width=True):
        st.markdown("**Quick Add Note**")
        _qa_ntitle = st.text_input("Title", placeholder="Reminder, idea…", key="qa_note_title")
        _qa_ncontent = st.text_area("Content", height=80, key="qa_note_content")
        if st.button("Save", type="primary", use_container_width=True, key="qa_note_submit"):
            if _qa_ntitle:
                from db import insert_row as _qi4
                from core.tools import _uid as _quid4, _now_iso as _qnow4
                _qi4("notes", {
                    "id": _quid4(), "user_id": _active_uid,
                    "title": _qa_ntitle, "content": _qa_ncontent,
                    "tags": "", "created_at": _qnow4(), "updated_at": _qnow4(),
                })
                st.success("📝 Note saved!")
                st.rerun()


# ── 6 TABS ────────────────────────────────────────────────────────────────────
tab_dash, tab_budget, tab_forecast, tab_schedule, tab_goals, tab_notes = st.tabs([
    "📊 Dashboard",
    "💳 Budget",
    "📈 Forecast",
    "📅 Schedule",
    "🎯 Goals",
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

with tab_goals:
    from ui.goals import render_goals
    render_goals(_active_uid)

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
