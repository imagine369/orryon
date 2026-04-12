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

# PWA manifest + service worker + install banner
st.markdown("""
<link rel="manifest" href="/app/static/manifest.json">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="orryon">
<link rel="apple-touch-icon" href="/app/static/icon-192.png">
<meta name="theme-color" content="#000000">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/app/static/sw.js')
        .then(function (reg) { console.log('[orryon] SW registered', reg.scope); })
        .catch(function (err) { console.warn('[orryon] SW failed', err); });
    });
  }
</script>

<!-- Install Banner -->
<div id="orryon-install-banner" style="
  display:none; position:fixed; bottom:0; left:0; right:0;
  background:rgba(8,8,18,0.97);
  backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
  border-top:1px solid rgba(255,255,255,0.09);
  padding:14px 16px 20px;
  z-index:99999; align-items:center; gap:12px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  box-shadow:0 -8px 32px rgba(0,0,0,0.6);
">
  <div style="
    width:42px; height:42px; border-radius:11px;
    background:#000; border:1px solid rgba(255,255,255,0.14);
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0; font-size:1.4rem;
  ">🌑</div>
  <div style="flex:1; min-width:0;">
    <div style="color:#f1f5f9; font-size:0.9rem; font-weight:700; margin-bottom:3px;">
      Install orryon
    </div>
    <div id="orryon-install-subtitle" style="color:#64748b; font-size:0.77rem; line-height:1.4;"></div>
  </div>
  <button id="orryon-install-btn" onclick="orryonTriggerInstall()" style="
    background:#fff; color:#000; border:none; border-radius:50px;
    padding:9px 20px; font-size:0.84rem; font-weight:700;
    cursor:pointer; flex-shrink:0; font-family:inherit;
    display:none;
  ">Install</button>
  <button onclick="orryonDismiss()" style="
    background:none; border:none; color:#475569;
    font-size:1.3rem; cursor:pointer; padding:4px 6px;
    flex-shrink:0; line-height:1; font-family:inherit;
  " aria-label="Dismiss">✕</button>
</div>

<script>
(function(){
  var PERM_KEY = 'orryon_install_dismissed';
  var SESS_KEY = 'orryon_install_shown';
  var _prompt  = null;

  function isIOS()        { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }
  function isAndroid()    { return /android/i.test(navigator.userAgent); }
  function isStandalone() {
    return window.matchMedia('(display-mode:standalone)').matches ||
           navigator.standalone === true;
  }
  function isDismissed()  { try { return !!localStorage.getItem(PERM_KEY); } catch(e){ return false; } }
  function wasShown()     { try { return !!sessionStorage.getItem(SESS_KEY); } catch(e){ return false; } }
  function markShown()    { try { sessionStorage.setItem(SESS_KEY,'1'); } catch(e){} }

  function showBanner(subtitle, showBtn) {
    if (isStandalone() || isDismissed() || wasShown()) return;
    var b  = document.getElementById('orryon-install-banner');
    var s  = document.getElementById('orryon-install-subtitle');
    var bt = document.getElementById('orryon-install-btn');
    if (!b) return;
    if (s)  s.textContent  = subtitle;
    if (bt) bt.style.display = showBtn ? 'inline-block' : 'none';
    b.style.display = 'flex';
    markShown();
  }

  window.orryonTriggerInstall = function() {
    if (_prompt) {
      _prompt.prompt();
      _prompt.userChoice.then(function(c){
        if (c.outcome === 'accepted') orryonDismiss();
        _prompt = null;
      });
    }
  };

  window.orryonDismiss = function() {
    var b = document.getElementById('orryon-install-banner');
    if (b) b.style.display = 'none';
    try { localStorage.setItem(PERM_KEY,'1'); } catch(e){}
  };

  /* Android — native install prompt */
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    _prompt = e;
    showBanner('Add to your home screen for instant access.', true);
  });

  /* iOS — manual share sheet instructions */
  if (isIOS() && !isStandalone()) {
    setTimeout(function(){
      showBanner('Tap the Share button \u2197 then \u201cAdd to Home Screen\u201d.', false);
    }, 1800);
  }

  /* Android fallback — if beforeinstallprompt never fires (e.g. already installed criteria not met) */
  if (isAndroid() && !isStandalone()) {
    setTimeout(function(){
      if (!_prompt) {
        showBanner('Tap \u22ee then \u201cAdd to Home Screen\u201d for quick access.', false);
      }
    }, 3000);
  }

  /* Clean up banner if user installs via browser UI */
  window.addEventListener('appinstalled', function(){ orryonDismiss(); });
})();
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
        "orryon_undo_info": None,
        "show_chat_history": False,
        "active_tab": 0,
        "lp_sending": False,
        "show_onboarding": False,
        "app_view": "home",  # "home" | "dash_panel" | "settings_panel" | "full_dash"
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
                    f'padding:16px;text-align:center;margin-bottom:1rem;overflow-x:auto;">'
                    f'<span style="font-size:clamp(1.4rem,6vw,2rem);font-weight:700;'
                    f'letter-spacing:clamp(3px,2vw,8px);color:#fff;word-break:break-all;">'
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
                    existing_txns = fetch_rows("transactions", {"user_id": _user["id"]})
                    if not existing_txns:
                        from core.tools import seed_sample_data
                        seed_sample_data(_user["id"])
                        st.session_state.show_onboarding = True
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
  h1 a, h2 a, h3 a {{ display:none!important; }}
  [data-testid="StyledLinkIconContainer"] {{ display:none!important; }}
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
  .lp-cta-demo>button{{
    width:100%!important;border-radius:50px!important;
    padding:0.72rem 0!important;font-size:0.95rem!important;
    font-weight:600!important;box-shadow:none!important;
    background:transparent!important;
    border:1.5px solid rgba(255,255,255,0.25)!important;
    color:rgba(255,255,255,0.7)!important;
  }}
  .lp-cta-demo>button:hover{{border-color:rgba(255,255,255,0.55)!important;color:#fff!important}}
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
        "I'm your personal concierge. Whether you're tracking expenses, planning your week, working toward your goals, or organizing daily life, I've got you covered.</p>",
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
            "q", placeholder="What can I help you with?",
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
        ("1", "Just tell me what you need",
         "Speak naturally — “Add coffee and breakfast $9.50”, “Help me save $4000 for a vacation by December”, or “Doctor appointment next Tuesday at 10am”."),
        ("2", "I understand and take action",
         "I take care of the details — adding expenses, updating your schedule, tracking goals, and keeping your daily life organized."),
        ("3", "Everything updates automatically",
         "Your Dashboard, Budget, Forecast, Schedule, and Goals stay perfectly in sync in real time."),
        ("4", "Ask anything, get real answers",
         '“How much did I spend on dining this week?” “How close am I to my vacation goal?” I give you clear, helpful answers from your actual data.'),
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
        "Here's what you can ask me</h2>",
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
        'I understand natural language and automatically update your budget, '
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
        ("✦",  "I'm your intelligent personal concierge, always ready to help."),
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
    st.markdown('</div>', unsafe_allow_html=True)

    st.markdown(
        '<div style="text-align:center;margin-top:0.75rem;">'
        '<span style="font-size:0.78rem;color:rgba(255,255,255,0.28);">or</span>'
        '</div>',
        unsafe_allow_html=True,
    )
    st.markdown('<div class="lp-cta-demo" style="margin-top:0.5rem">', unsafe_allow_html=True)
    if st.button("Try the demo →", use_container_width=True, key="lp_demo"):
        _demo_email = "demo@orryon.app"
        _demo_user = get_or_create_user_by_email(_demo_email)
        st.session_state.user_id = _demo_user["id"]
        st.session_state.display_name = _demo_user["display_name"] or "Demo"
        st.session_state.chat_history = load_chat_history(_demo_user["id"])
        _demo_txns = fetch_rows("transactions", {"user_id": _demo_user["id"]})
        if not _demo_txns:
            from core.tools import seed_sample_data
            seed_sample_data(_demo_user["id"])
            st.session_state.show_onboarding = True
        st.session_state.data_loaded = True
        st.session_state.last_sync = datetime.now().isoformat()
        st.session_state.screen = "home"
        st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown(
        '<p class="bottom-note">By using orryon, all data stays on your device.</p>',
        unsafe_allow_html=True,
    )
    
    # X-inspired legal footer for landing page
    st.markdown("""
    <div style="margin-top:3rem;padding:1.5rem 0;border-top:1px solid rgba(255,255,255,0.08);
                font-size:0.68rem;color:#555;text-align:center;">
        orryon v1.0 • Not financial advice. Use at your own risk.<br>
        <a href="/app/static/privacy.html" target="_blank" style="color:#888;text-decoration:none;">Privacy</a> • 
        <a href="/app/static/terms.html" target="_blank" style="color:#888;text-decoration:none;">Terms</a> • 
        All data stays local on your device.
    </div>
    """, unsafe_allow_html=True)
    st.stop()


# ─────────────────────────────────────────────────────────────────────────────
# POST-LOGIN APP
# ─────────────────────────────────────────────────────────────────────────────

# Start notification scheduler (idempotent — only launches once)
if not st.session_state.get("_scheduler_started"):
    from core.scheduler import start_scheduler
    start_scheduler()
    st.session_state["_scheduler_started"] = True

_active_uid = st.session_state.get("user_id") or USER_ID
_display_name = st.session_state.get("display_name", "")
_app_view = st.session_state.get("app_view", "home")

# ── Shared read-only view ─────────────────────────────────────────────────────
_qp = st.query_params
_share_token = _qp.get("share_token", "")
if _share_token and not st.session_state.get("user_id"):
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
            '<div style="background:rgba(29,155,240,0.1);border:1px solid rgba(29,155,240,0.25);'
            'border-radius:10px;padding:10px 14px;font-size:0.82rem;color:#1d9bf0;margin-bottom:8px;">'
            '👁️ <strong>Read-only view</strong> — Shared Finance Dashboard.'
            '</div>',
            unsafe_allow_html=True,
        )
        from ui.dashboard import render_dashboard as _rdb
        _rdb(_active_uid)
        st.stop()
    else:
        st.error("Invalid or expired share link.")
        st.stop()

# ── Avatar ────────────────────────────────────────────────────────────────────
_avatar_path = "assets/tribble.png"
if os.path.exists(_avatar_path):
    with open(_avatar_path, "rb") as _f:
        _raw = _f.read()
    _b64 = base64.b64encode(_raw).decode()
    _mime = "jpeg" if _raw[:3] == b"\xff\xd8\xff" else "png"
    _avatar_sm = (
        f'<img src="data:image/{_mime};base64,{_b64}" '
        f'style="width:30px;height:30px;border-radius:50%;object-fit:cover"/>'
    )
    _avatar_lg = (
        f'<img src="data:image/{_mime};base64,{_b64}" '
        f'style="width:82px;height:82px;border-radius:50%;object-fit:cover"/>'
    )
else:
    _b64, _mime = "", "png"
    _avatar_sm = '<span style="font-size:1.4rem">💰</span>'
    _avatar_lg = '<span style="font-size:4rem">💰</span>'

# ── Global CSS ─────────────────────────────────────────────────────────────────
# Pre-build the home-pill CSS block to avoid f-string brace-escaping issues
_home_pill_css = """
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"]) {
    background:#1c1c1e!important;
    border:1px solid rgba(255,255,255,0.09)!important;
    border-radius:999px!important;
    padding:0.3rem 0.3rem 0.3rem 1.1rem!important;
    align-items:center!important;
    gap:0!important;
    max-width:520px;
    margin:1.8rem auto 0;
  }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] { flex:1!important; min-width:0!important; }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] label { display:none!important }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] div[data-baseweb] {
      background:transparent!important;border:none!important;box-shadow:none!important;
    }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] input {
      background:transparent!important;border:none!important;
      outline:none!important;box-shadow:none!important;
      color:#fff!important;font-size:1rem!important;
      padding:0.6rem 0.2rem!important;caret-color:#fff;
    }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stTextInput"] input::placeholder {
      color:rgba(255,255,255,0.35)!important;
    }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stColumn"]:last-child {
      padding:0!important;flex:0 0 auto!important;width:auto!important;
    }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stButton"] button {
      background:#fff!important;border:none!important;outline:none!important;
      box-shadow:none!important;color:#000!important;border-radius:50%!important;
      width:2.2rem!important;height:2.2rem!important;
      min-height:unset!important;padding:0!important;
      font-size:0.85rem!important;line-height:1!important;
      transition:background 0.15s,transform 0.1s!important;
    }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stButton"] button:hover { background:#ddd!important; transform:scale(1.06)!important; }
  [data-testid="stHorizontalBlock"]:has([data-testid="stTextInput"])
    [data-testid="stButton"] button:focus { outline:none!important;box-shadow:none!important; }
""" if _app_view == "home" else ""

st.markdown(f"""
<style>
  /* ── Base ── */
  [data-testid="stAppViewContainer"],[data-testid="stMain"],.stApp,
  section[data-testid="stMain"]>div{{background:#000!important}}
  #MainMenu,footer{{visibility:hidden}}
  [data-testid="stHeader"]{{display:none!important}}
  [data-testid="stSidebar"]{{display:none!important}}
  [data-testid="stToolbar"]{{display:none!important}}
  [data-testid="stDecoration"]{{display:none!important}}
  .block-container{{
    padding:0 1rem {"2rem" if _app_view == "home" else "5.5rem"}!important;
    max-width:{"680px" if _app_view == "full_dash" else "540px"}!important;
    background:transparent!important;
  }}

  /* Hide floating chat bar on home — input lives in the center instead */
  {"[data-testid='stBottom']{display:none!important}" if _app_view == "home" else ""}

  /* Hide Streamlit heading anchor links */
  h1 a, h2 a, h3 a {{ display:none!important; }}
  [data-testid="StyledLinkIconContainer"] {{ display:none!important; }}

  /* ── Home center pill — same :has() technique as landing page ── */
  {_home_pill_css}

  /* Slide-in from right for panels */
  @keyframes slideInRight {{
    from {{ transform: translateX(72px); opacity: 0; }}
    to   {{ transform: translateX(0);    opacity: 1; }}
  }}
  {"" if _app_view in ("home","full_dash") else
   ".block-container { animation: slideInRight 0.24s cubic-bezier(0.32,0.72,0,1) both; }"}

  /* Nav buttons — placeholder; real overrides placed after .stButton block below */

  /* Suggestion chips */
  .chip {{
    display:inline-block; background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.09); border-radius:20px;
    padding:0.42rem 1rem; font-size:0.85rem; color:rgba(255,255,255,0.55);
    margin:0.22rem 0.18rem; cursor:default;
  }}

  /* Panel sections */
  .panel-title {{
    font-size:1.45rem; font-weight:800; color:#fff; margin:0 0 1.1rem;
  }}
  .section-label {{
    font-size:0.68rem; text-transform:uppercase; letter-spacing:1px;
    color:rgba(255,255,255,0.28); margin:0 0 0.4rem;
  }}
  .stat-card {{
    background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07);
    border-radius:12px; padding:0.85rem 1rem;
  }}
  .stat-label {{ font-size:0.7rem; color:rgba(255,255,255,0.38); text-transform:uppercase; letter-spacing:0.8px; margin:0 0 0.25rem; }}
  .stat-value {{ font-size:1.55rem; font-weight:700; color:#fff; margin:0; }}
  .stat-sub   {{ font-size:0.72rem; color:rgba(255,255,255,0.3); margin:0.15rem 0 0; }}
  .row-item {{
    display:flex; align-items:center; gap:0.65rem; padding:0.55rem 0;
    border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.84rem;
  }}
  .row-title {{ color:#fff; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
  .row-sub   {{ color:rgba(255,255,255,0.35); font-size:0.76rem; flex-shrink:0; }}
  .row-amt   {{ color:#fff; font-weight:600; flex-shrink:0; }}

  /* Tabs (full_dash) */
  .stTabs [data-baseweb="tab-list"] {{
    background:#111!important; border-radius:12px; padding:3px; gap:2px;
    border:1px solid rgba(255,255,255,0.07);
  }}
  .stTabs [data-baseweb="tab"] {{
    border-radius:9px!important; padding:6px 12px!important;
    font-size:0.82rem!important; font-weight:500!important;
    color:rgba(255,255,255,0.45)!important; background:transparent!important;
  }}
  .stTabs [aria-selected="true"] {{
    background:rgba(29,155,240,0.13)!important; color:#1d9bf0!important;
  }}
  .stTabs [data-baseweb="tab-highlight"]{{display:none!important}}
  .stTabs [data-baseweb="tab-border"]{{display:none!important}}

  /* Metrics */
  [data-testid="stMetricValue"]{{font-size:1.35rem!important;font-weight:700!important;color:#fff!important}}
  [data-testid="stMetricLabel"]{{color:rgba(255,255,255,0.45)!important;font-size:0.75rem!important}}

  /* Buttons (general — pill send buttons override these) */
  .stButton>button {{
    border-radius:10px!important;
    border:1px solid rgba(255,255,255,0.1)!important;
    background:rgba(255,255,255,0.04)!important;
    color:#fff!important;
    font-weight:500!important;
    outline:none!important;
    box-shadow:none!important;
  }}
  .stButton>button:focus {{outline:none!important;box-shadow:none!important;}}
  .stButton>button[kind="primary"] {{
    background:#1d9bf0!important; border:none!important;
    color:#fff!important; font-weight:700!important;
  }}
  .stButton>button[kind="primary"]:hover {{ background:#1a8cd8!important; }}

  /* Nav buttons — defined AFTER .stButton so transparent/no-border wins */
  .nav-btn>button {{
    background:transparent!important; border:none!important; box-shadow:none!important;
    color:rgba(255,255,255,0.75)!important; font-size:1.35rem!important;
    font-weight:400!important; padding:0.25rem 0.5rem!important;
    border-radius:8px!important; min-height:unset!important; line-height:1!important;
  }}
  .nav-btn>button:hover {{ color:#fff!important; background:transparent!important; border:none!important; transform:scale(1.1); }}
  .nav-btn-active>button {{ color:#fff!important; background:transparent!important; border:none!important; }}
  .nav-btn-active>button:hover {{ background:transparent!important; }}

  /* ── Floating chat bar — identical pill to home input ── */
  [data-testid="stBottom"] {{
    background:rgba(0,0,0,0.85)!important;
    backdrop-filter:blur(20px)!important;
    border-top:none!important;
    padding:0.55rem 0 0.9rem!important;
  }}
  [data-testid="stChatInputContainer"] {{
    background:#1c1c1e!important;
    border:1px solid rgba(255,255,255,0.09)!important;
    border-radius:999px!important;
    padding:0.3rem 0.3rem 0.3rem 1.1rem!important;
    box-shadow:none!important;
  }}
  [data-testid="stChatInputContainer"] textarea {{
    color:#fff!important;
    background:transparent!important;
    font-size:1rem!important;
    padding:0.6rem 0!important;
    line-height:1.5!important;
    resize:none!important;
    border:none!important;
    outline:none!important;
    box-shadow:none!important;
  }}
  [data-testid="stChatInputContainer"] textarea::placeholder {{
    color:rgba(255,255,255,0.35)!important;
  }}
  [data-testid="stChatInputSubmitButton"]>button {{
    background:#fff!important;
    border:none!important;
    outline:none!important;
    box-shadow:none!important;
    border-radius:50%!important;
    width:2.2rem!important;height:2.2rem!important;
    min-width:2.2rem!important;min-height:unset!important;
    padding:0!important;
    color:#000!important;
    transition:background 0.15s,transform 0.1s!important;
  }}
  [data-testid="stChatInputSubmitButton"]>button:hover {{background:#ddd!important;transform:scale(1.06)!important;}}
  [data-testid="stChatInputSubmitButton"]>button:focus {{outline:none!important;box-shadow:none!important;}}

  /* orryon response */
  .orryon-response {{
    background:rgba(29,155,240,0.07); border:1px solid rgba(29,155,240,0.18);
    border-radius:14px; padding:0.9rem 1.1rem; margin:0 0 0.75rem;
    font-size:0.88rem; line-height:1.55; color:#e2e8f0;
  }}
  .orryon-badge {{
    display:inline-flex; align-items:center; gap:0.3rem;
    background:rgba(29,155,240,0.14); border-radius:20px;
    padding:2px 10px; font-size:0.72rem; color:#1d9bf0;
    font-weight:600; margin-bottom:0.45rem;
  }}

  /* Chat bubbles */
  .chat-bubble-user {{
    background:rgba(29,155,240,0.1); border-radius:16px 16px 4px 16px;
    padding:0.65rem 0.9rem; margin:0.3rem 0;
    border-left:3px solid #1d9bf0; font-size:0.87rem;
  }}
  .chat-bubble-ai {{
    background:#111; border-radius:16px 16px 16px 4px;
    padding:0.65rem 0.9rem; margin:0.3rem 0;
    border-left:3px solid rgba(255,255,255,0.12); font-size:0.87rem;
  }}

  /* Inputs */
  .stTextInput input,.stTextArea textarea,.stNumberInput input {{
    background:#111!important; border:1px solid rgba(255,255,255,0.1)!important;
    border-radius:8px!important; color:#fff!important;
  }}
  .stSelectbox [data-baseweb="select"] div {{
    background:#111!important; color:#fff!important;
    border-color:rgba(255,255,255,0.1)!important;
  }}
  .stDateInput input {{ background:#111!important; color:#fff!important; }}
  .streamlit-expanderHeader {{ font-size:0.86rem!important; }}
  .stDataFrame {{ font-size:0.82rem!important; }}

  /* ── Responsive breakpoints ──────────────────────────── */

  /* Tablet (≤ 1024px) */
  @media (max-width:1024px) {{
    .block-container {{
      padding-left:1rem!important;
      padding-right:1rem!important;
    }}
    /* Soften wide max-width for full dash on tablets */
    .block-container {{ max-width:100%!important; }}
  }}

  /* Mobile (≤ 640px) */
  @media (max-width:640px) {{
    /* Container edge-to-edge with breathing room */
    .block-container {{
      padding:0 0.75rem!important;
      max-width:100%!important;
    }}

    /* Home pill – full width */
    .home-pill [data-testid="stHorizontalBlock"] {{
      max-width:100%!important;
      margin-left:0!important;
      margin-right:0!important;
    }}

    /* Larger touch targets for pill send & chat submit buttons */
    .home-pill [data-testid="stButton"] button,
    [data-testid="stChatInputSubmitButton"]>button {{
      width:2.75rem!important;
      height:2.75rem!important;
      min-width:2.75rem!important;
      font-size:0.95rem!important;
    }}

    /* Floating chat bar bottom padding (notch-safe) */
    [data-testid="stBottom"] {{
      padding:0.5rem 0.5rem calc(0.9rem + env(safe-area-inset-bottom, 0px)) !important;
    }}
    [data-testid="stChatInputContainer"] {{
      padding:0.35rem 0.35rem 0.35rem 1rem!important;
    }}

    /* Quick-add strip: 2 × 2 grid on mobile */
    [data-testid="stColumns"]:has([data-testid="stColumn"]:nth-child(4)) {{
      flex-wrap:wrap!important;
    }}
    [data-testid="stColumns"]:has([data-testid="stColumn"]:nth-child(4)) [data-testid="stColumn"] {{
      flex:0 0 50%!important;
      min-width:0!important;
    }}

    /* Chat bubbles – slightly smaller padding */
    .chat-bubble-user, .chat-bubble-ai {{
      padding:0.5rem 0.75rem!important;
      font-size:0.9rem!important;
    }}

    /* Orryon response card */
    .orryon-response {{
      padding:0.75rem 0.85rem!important;
      font-size:0.9rem!important;
    }}

    /* Suggestion chips – allow wrapping */
    .chip {{
      font-size:0.8rem!important;
      padding:0.3rem 0.75rem!important;
    }}

    /* Nav buttons (Dashboard / Settings) – shrink text */
    .nav-btn>button {{
      font-size:0.82rem!important;
      padding:0.25rem 0.5rem!important;
    }}

    /* Tabs – allow horizontal scroll instead of cramping */
    [data-baseweb="tab-list"] {{
      overflow-x:auto!important;
      flex-wrap:nowrap!important;
      -webkit-overflow-scrolling:touch!important;
      scrollbar-width:none!important;
    }}
    [data-baseweb="tab-list"]::-webkit-scrollbar {{ display:none!important; }}
    [data-baseweb="tab"] {{
      white-space:nowrap!important;
      flex-shrink:0!important;
      font-size:0.8rem!important;
      padding:5px 10px!important;
    }}

    /* Legal / footer text – raise minimum size */
    .home-footer, .lp-footer {{
      font-size:0.75rem!important;
    }}

    /* Section headings scale down */
    h1 {{ font-size:1.6rem!important; }}
    h2 {{ font-size:1.25rem!important; }}

    /* Metric values */
    [data-testid="stMetricValue"] {{ font-size:1.1rem!important; }}

    /* Reduce panel slide distance on mobile */
    @keyframes slideInRight {{
      from {{ transform: translateX(28px); opacity: 0; }}
      to   {{ transform: translateX(0);    opacity: 1; }}
    }}
  }}

  /* Hide Streamlit error traceback action links */
  [class*="ExceptionTracebackActions"],
  [class*="exceptionTracebackActions"],
  [data-testid="stExceptionTracebackActions"] {{
    display: none !important;
  }}

  /* Reduced-motion accessibility */
  @media (prefers-reduced-motion: reduce) {{
    @keyframes slideInRight {{ from {{ opacity:0; }} to {{ opacity:1; }} }}
    * {{ animation-duration:0.01ms!important; transition-duration:0.01ms!important; }}
  }}

  /* Large desktop (≥ 1440px) – let content breathe */
  @media (min-width:1440px) {{
    .block-container {{
      max-width:{"820px" if _app_view == "full_dash" else "600px"}!important;
    }}
  }}

</style>
""", unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────────────────
# HOME VIEW  —  Grok-style chat-first screen
# ─────────────────────────────────────────────────────────────────────────────
if _app_view == "home":

    # ── Top nav ───────────────────────────────────────────────────────────────
    _n_gap, _n_dash, _n_set = st.columns([8, 1.3, 1.2])
    with _n_dash:
        st.markdown('<div class="nav-btn">', unsafe_allow_html=True)
        if st.button("⊞", key="nav_to_dash"):
            st.session_state.app_view = "dash_panel"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)
    with _n_set:
        st.markdown('<div class="nav-btn">', unsafe_allow_html=True)
        if st.button("⚙️", key="nav_to_settings"):
            st.session_state.app_view = "settings_panel"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    # ── Onboarding banner ────────────────────────────────────────────────────
    if st.session_state.get("show_onboarding"):
        st.markdown("""
<div style="background:rgba(29,155,240,0.08);border:1px solid rgba(29,155,240,0.2);
border-radius:14px;padding:1.1rem 1.2rem;margin:0.5rem 0 1rem;">
<h3 style="margin:0 0 0.25rem;font-size:1.05rem;color:#fff;">Welcome to orryon ✦</h3>
<p style="color:rgba(255,255,255,0.5);font-size:0.86rem;margin:0 0 0.7rem;line-height:1.5;">
Just type naturally below — I'll handle the rest.</p>
<div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
<span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);
border-radius:8px;padding:0.28rem 0.55rem;font-size:0.8rem;color:rgba(255,255,255,0.7);">💸 "Coffee $6.50"</span>
<span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);
border-radius:8px;padding:0.28rem 0.55rem;font-size:0.8rem;color:rgba(255,255,255,0.7);">📅 "Dentist Tuesday 10am"</span>
<span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);
border-radius:8px;padding:0.28rem 0.55rem;font-size:0.8rem;color:rgba(255,255,255,0.7);">🎯 "Save $5k for vacation"</span>
</div>
</div>
""", unsafe_allow_html=True)
        if st.button("Got it — let's go!", type="primary", key="dismiss_onboarding"):
            st.session_state.show_onboarding = False
            st.rerun()

    # ── AI response card ─────────────────────────────────────────────────────
    if st.session_state.get("orryon_last_message"):
        st.markdown(
            '<div class="orryon-response"><div class="orryon-badge">✦ orryon</div></div>',
            unsafe_allow_html=True,
        )
        st.markdown(st.session_state.orryon_last_message)
        _btn_cols = [3, 1, 1] if st.session_state.get("orryon_undo_info") else [3, 1]
        _bcols = st.columns(_btn_cols)
        with _bcols[0]:
            if st.button("✕ Dismiss", key="dismiss_resp"):
                st.session_state.orryon_last_message = ""
                st.session_state.orryon_undo_info = None
                st.rerun()
        with _bcols[1]:
            if st.button("🕐 History" if not st.session_state.show_chat_history else "Hide", key="toggle_hist"):
                st.session_state.show_chat_history = not st.session_state.show_chat_history
                st.rerun()
        if st.session_state.get("orryon_undo_info") and len(_bcols) > 2:
            with _bcols[2]:
                if st.button("↩ Undo", key="undo_action"):
                    _undo = st.session_state.orryon_undo_info
                    from db import delete_row as _del_undo
                    _del_undo(_undo["table"], {"id": _undo["id"]})
                    st.session_state.orryon_last_message = f"↩ Undone: {_undo.get('label','last action')}"
                    st.session_state.orryon_undo_info = None
                    st.rerun()
        if st.session_state.show_chat_history and st.session_state.chat_history:
            st.markdown(
                '<div style="max-height:300px;overflow-y:auto;padding:0.5rem;'
                'border:1px solid rgba(255,255,255,0.06);border-radius:12px;'
                'background:#0a0a0a;margin-bottom:0.75rem;">',
                unsafe_allow_html=True,
            )
            for _msg in st.session_state.chat_history[-24:]:
                if _msg["role"] == "user":
                    st.markdown(f'<div class="chat-bubble-user">👤 {_msg["content"]}</div>', unsafe_allow_html=True)
                else:
                    st.markdown(f'<div class="chat-bubble-ai">✦ {_msg.get("content","")}</div>', unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)

    else:
        # ── Hero (no response yet) ────────────────────────────────────────────
        st.markdown(
            f'<div style="display:flex;flex-direction:column;align-items:center;'
            f'justify-content:center;padding:4rem 0 1.8rem;text-align:center;">'
            f'{_avatar_lg}'
            f'<h1 style="font-size:2rem;font-weight:800;letter-spacing:3px;'
            f'text-transform:uppercase;color:#fff;margin:1.1rem 0 0;">orryon</h1>'
            f'</div>',
            unsafe_allow_html=True,
        )
        # ── Centered pill input ───────────────────────────────────────────────
        st.markdown('<div class="home-pill">', unsafe_allow_html=True)
        _hp_l, _hp_r = st.columns([20, 1])
        with _hp_l:
            st.text_input("", placeholder="Ask me anything…",
                          label_visibility="collapsed", key="home_q")
        with _hp_r:
            _hp_send = st.button("↑", key="home_send_btn")
        st.markdown('</div>', unsafe_allow_html=True)

        if _hp_send and st.session_state.get("home_q", "").strip():
            st.session_state["_home_pending"] = st.session_state.home_q
            st.rerun()

        st.markdown("<div style='height:1.2rem'></div>", unsafe_allow_html=True)
        for _chip in [
            "💸 Add an expense",
            "📅 What's on my schedule?",
            "🎯 How are my goals looking?",
            "📊 Show me this week's spending",
        ]:
            st.markdown(f'<span class="chip">{_chip}</span>', unsafe_allow_html=True)

    _stream_area = st.empty()

    # ── Process home pill submission ──────────────────────────────────────────
    if st.session_state.get("_home_pending"):
        _home_msg = st.session_state.pop("_home_pending")
        _user_msg_h = {"role": "user", "content": _home_msg, "created_at": datetime.now().isoformat()}
        st.session_state.chat_history.append(_user_msg_h)
        save_chat_message(_active_uid, _user_msg_h)
        _full_resp_h = ""
        try:
            from core.grok_agent import run_orryon_stream
            with _stream_area.container():
                st.markdown('<div class="orryon-badge" style="margin-bottom:0.3rem">✦ orryon</div>',
                            unsafe_allow_html=True)
                _ts_h = st.empty()
                _rd_h = st.empty()
                for _ev in run_orryon_stream(
                    user_message=_home_msg, user_id=_active_uid,
                    chat_history=st.session_state.chat_history[:-1],
                    user_name=_display_name or "there",
                ):
                    if _ev["type"] == "token":
                        _full_resp_h += _ev["content"]
                        _rd_h.markdown(_full_resp_h + "▍")
                    elif _ev["type"] == "tool":
                        _ts_h.caption(f"✦ {_ev['label']}…")
                    elif _ev["type"] == "done":
                        _full_resp_h = _ev.get("message", _full_resp_h)
                        st.session_state.orryon_undo_info = _ev.get("undo_info")
                        _ts_h.empty(); _rd_h.markdown(_full_resp_h)
                    elif _ev["type"] == "error":
                        _full_resp_h = _ev["message"]
                        _ts_h.empty(); _rd_h.markdown(_full_resp_h)
        except Exception as _exc:
            logger.error("home pill AI failed: %s", _exc)
            _full_resp_h = f"Something went wrong: {_exc}"
        _stream_area.empty()
        _ai_msg_h = {"role": "assistant", "content": _full_resp_h, "created_at": datetime.now().isoformat()}
        st.session_state.chat_history.append(_ai_msg_h)
        save_chat_message(_active_uid, _ai_msg_h)
        st.session_state.orryon_last_message = _full_resp_h
        st.session_state.show_chat_history = False
        st.rerun()

    # ── Footer ────────────────────────────────────────────────────────────────
    st.markdown(
        '<div style="margin-top:3rem;padding-top:1.2rem;border-top:1px solid rgba(255,255,255,0.05);'
        'font-size:0.67rem;color:rgba(255,255,255,0.18);text-align:center;">'
        'orryon v1.0 &nbsp;•&nbsp;'
        '<a href="/app/static/privacy.html" target="_blank" style="color:rgba(255,255,255,0.3);text-decoration:none;">Privacy</a>'
        ' &nbsp;•&nbsp; '
        '<a href="/app/static/terms.html" target="_blank" style="color:rgba(255,255,255,0.3);text-decoration:none;">Terms</a>'
        '</div>',
        unsafe_allow_html=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD PANEL  —  slides in from right
# ─────────────────────────────────────────────────────────────────────────────
elif _app_view == "dash_panel":

    # ── Nav ───────────────────────────────────────────────────────────────────
    _pn_back, _pn_gap, _pn_full = st.columns([1.4, 5, 3.2])
    with _pn_back:
        st.markdown('<div class="nav-btn">', unsafe_allow_html=True)
        if st.button("← Back", key="dash_back"):
            st.session_state.app_view = "home"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)
    with _pn_full:
        if st.button("Open full Dashboard →", type="primary", key="dash_open_full"):
            st.session_state.app_view = "full_dash"
            st.rerun()

    st.markdown('<p class="panel-title">Dashboard</p>', unsafe_allow_html=True)

    # ── Fetch quick stats ─────────────────────────────────────────────────────
    from datetime import date as _date_cls
    _today = _date_cls.today()
    _month_start = _today.replace(day=1).isoformat()

    from db import get_connection as _dash_gc, get_balance as _dash_get_balance
    _dc = _dash_gc()

    _balance = _dash_get_balance(_active_uid)

    _month_row = _dc.execute(
        "SELECT COALESCE(SUM(amount),0) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0", (_active_uid, _month_start),
    ).fetchone()
    _month_spend = float(_month_row["total"]) if _month_row else 0.0

    _cats = _dc.execute(
        "SELECT category, SUM(amount) as total FROM transactions "
        "WHERE user_id=? AND date>=? AND amount>0 "
        "GROUP BY category ORDER BY total DESC LIMIT 3",
        (_active_uid, _month_start),
    ).fetchall()

    _recent_txns = _dc.execute(
        "SELECT merchant, amount, date FROM transactions "
        "WHERE user_id=? ORDER BY date DESC, rowid DESC LIMIT 5",
        (_active_uid,),
    ).fetchall()

    _next_evt = _dc.execute(
        "SELECT title, event_date, event_time FROM events "
        "WHERE user_id=? AND event_date>=? ORDER BY event_date, event_time LIMIT 1",
        (_active_uid, _today.isoformat()),
    ).fetchone()

    _goals_row = _dc.execute(
        "SELECT COUNT(*) as c FROM goals WHERE user_id=? AND status='active'", (_active_uid,)
    ).fetchone()
    _dc.close()

    # ── Stats ─────────────────────────────────────────────────────────────────
    _sc1, _sc2 = st.columns(2)
    with _sc1:
        st.markdown(
            f'<div class="stat-card"><p class="stat-label">Net Balance</p>'
            f'<p class="stat-value">${_balance:,.2f}</p></div>',
            unsafe_allow_html=True,
        )
    with _sc2:
        st.markdown(
            f'<div class="stat-card"><p class="stat-label">This Month</p>'
            f'<p class="stat-value">${_month_spend:,.2f}</p>'
            f'<p class="stat-sub">spent</p></div>',
            unsafe_allow_html=True,
        )

    st.markdown("<div style='height:1rem'></div>", unsafe_allow_html=True)

    # ── Top categories ────────────────────────────────────────────────────────
    if _cats:
        st.markdown('<p class="section-label">Top Categories</p>', unsafe_allow_html=True)
        for _cat in _cats:
            st.markdown(
                f'<div class="row-item">'
                f'<span class="row-title">{_cat["category"]}</span>'
                f'<span class="row-amt">${float(_cat["total"]):,.2f}</span></div>',
                unsafe_allow_html=True,
            )
        st.markdown("<div style='height:0.65rem'></div>", unsafe_allow_html=True)

    # ── Recent transactions ───────────────────────────────────────────────────
    if _recent_txns:
        st.markdown('<p class="section-label">Recent</p>', unsafe_allow_html=True)
        for _txn in _recent_txns:
            st.markdown(
                f'<div class="row-item">'
                f'<span class="row-title">{_txn["merchant"]}</span>'
                f'<span class="row-sub">{(_txn["date"] or "")[:10]}</span>'
                f'<span class="row-amt">-${float(_txn["amount"]):,.2f}</span></div>',
                unsafe_allow_html=True,
            )
        st.markdown("<div style='height:0.65rem'></div>", unsafe_allow_html=True)

    # ── Next event ────────────────────────────────────────────────────────────
    if _next_evt:
        _evt_time_str = f" · {_next_evt['event_time']}" if _next_evt.get("event_time") else ""
        st.markdown(
            f'<div style="background:rgba(250,204,21,0.07);border:1px solid rgba(250,204,21,0.22);'
            f'border-radius:10px;padding:0.65rem 0.9rem;font-size:0.84rem;margin-bottom:0.65rem;">'
            f'<span style="color:rgba(255,255,255,0.35);font-size:0.68rem;text-transform:uppercase;letter-spacing:1px;">Next Up</span><br>'
            f'<span style="color:#fff;font-weight:600;">{_next_evt["title"]}</span>'
            f'<span style="color:rgba(255,255,255,0.38);"> · {(_next_evt["event_date"] or "")[:10]}{_evt_time_str}</span>'
            f'</div>',
            unsafe_allow_html=True,
        )

    # ── Active goals count ────────────────────────────────────────────────────
    _gc_n = int(_goals_row["c"]) if _goals_row else 0
    if _gc_n:
        st.markdown(
            f'<div class="row-item">'
            f'<span class="row-title">🎯 Active Goals</span>'
            f'<span style="background:rgba(29,155,240,0.15);color:#1d9bf0;border-radius:20px;'
            f'padding:2px 9px;font-size:0.77rem;font-weight:600;">{_gc_n}</span></div>',
            unsafe_allow_html=True,
        )

    _stream_area = st.empty()


# ─────────────────────────────────────────────────────────────────────────────
# SETTINGS PANEL  —  slides in from right
# ─────────────────────────────────────────────────────────────────────────────
elif _app_view == "settings_panel":

    _sp_back, _sp_gap = st.columns([1.4, 8])
    with _sp_back:
        st.markdown('<div class="nav-btn">', unsafe_allow_html=True)
        if st.button("← Back", key="settings_back"):
            st.session_state.app_view = "home"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<p class="panel-title">Settings</p>', unsafe_allow_html=True)

    # User info row
    st.markdown(
        f'<div style="display:flex;align-items:center;gap:0.7rem;padding:0.65rem 0;'
        f'border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:1rem;">'
        f'{_avatar_sm}'
        f'<div><p style="margin:0;font-weight:700;color:#fff;">{_display_name or "You"}</p>'
        f'<p style="margin:0;font-size:0.76rem;color:rgba(255,255,255,0.3);">Local-first · Private</p></div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    if not XAI_API_KEY:
        st.warning("⚠️ XAI_API_KEY not set — AI disabled. Add at [console.x.ai](https://console.x.ai)")
    else:
        st.success("✅ Grok AI connected")

    st.markdown("---")
    st.markdown("**🔔 Notifications**")

    from db import get_connection as _gc_notif, update_row as _upd_notif
    _nc = _gc_notif()
    _notif_row = _nc.execute(
        "SELECT default_reminder_minutes, daily_digest_enabled, daily_digest_time FROM users WHERE id=?",
        (_active_uid,),
    ).fetchone()
    _nc.close()

    _reminder_opts = {"None": 0, "10 min before": 10, "30 min before": 30,
                      "1 hour before": 60, "6 hours before": 360, "1 day before": 1440}
    _cur_rem = int(_notif_row["default_reminder_minutes"]) if _notif_row and _notif_row["default_reminder_minutes"] is not None else 30
    _cur_rem_lbl = next((k for k, v in _reminder_opts.items() if v == _cur_rem), "30 min before")
    _new_rem_lbl = st.selectbox("Default reminder", list(_reminder_opts.keys()),
                                index=list(_reminder_opts.keys()).index(_cur_rem_lbl),
                                key="notif_default_reminder")
    if _reminder_opts[_new_rem_lbl] != _cur_rem:
        _upd_notif("users", {"default_reminder_minutes": _reminder_opts[_new_rem_lbl]}, {"id": _active_uid})

    _digest_on = bool(_notif_row["daily_digest_enabled"]) if _notif_row and _notif_row["daily_digest_enabled"] is not None else True
    _new_digest = st.toggle("Daily morning digest", value=_digest_on, key="notif_digest_toggle")
    if _new_digest != _digest_on:
        _upd_notif("users", {"daily_digest_enabled": 1 if _new_digest else 0}, {"id": _active_uid})
    if _new_digest:
        _cur_dt = (_notif_row["daily_digest_time"] or "08:00") if _notif_row else "08:00"
        _dt_opts = ["06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00"]
        _new_dt = st.selectbox("Digest time", _dt_opts,
                               index=_dt_opts.index(_cur_dt) if _cur_dt in _dt_opts else 4,
                               key="notif_digest_time")
        if _new_dt != _cur_dt:
            _upd_notif("users", {"daily_digest_time": _new_dt}, {"id": _active_uid})

    from config import SMTP_ENABLED as _smtp_on
    st.caption("✅ Email reminders active" if _smtp_on else "⚠️ SMTP not configured — set in .env")

    st.markdown("---")
    st.markdown("**📊 Weekly Reports**")
    _nc_wr = _gc_notif()
    _wr_row = _nc_wr.execute("SELECT weekly_report_enabled FROM users WHERE id=?", (_active_uid,)).fetchone()
    _nc_wr.close()
    _wr_on = bool(_wr_row["weekly_report_enabled"]) if _wr_row and _wr_row["weekly_report_enabled"] is not None else True
    _new_wr = st.toggle("Weekly email report", value=_wr_on, key="notif_weekly_toggle")
    if _new_wr != _wr_on:
        _upd_notif("users", {"weekly_report_enabled": 1 if _new_wr else 0}, {"id": _active_uid})

    st.markdown("---")
    st.markdown("**💱 Currency**")
    _currency_opts = ["USD","EUR","GBP","CAD","AUD","JPY","CHF","CNY","INR","BRL"]
    _cur_currency = st.session_state.get("user_currency", "USD")
    _new_currency = st.selectbox("Display currency", _currency_opts,
                                 index=_currency_opts.index(_cur_currency) if _cur_currency in _currency_opts else 0,
                                 key="currency_selector")
    if _new_currency != _cur_currency:
        st.session_state["user_currency"] = _new_currency

    st.markdown("---")
    st.markdown("**👁️ Shared View**")
    st.caption("Share a read-only link to your Dashboard.")
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
                "user_id": _active_uid, "token": _token,
                "view_type": "finance_readonly", "is_active": 1,
                "created_at": datetime.now().isoformat(),
            })
        st.code(f"{APP_URL}?share_token={_token}", language=None)

    st.markdown("---")
    st.markdown("**📦 Data Export**")
    if st.button("⬇️ Export All Data (ZIP)", use_container_width=True, key="export_all"):
        import shutil, zipfile, tempfile
        from db import get_connection as _gc_exp
        from config import DB_PATH
        with tempfile.TemporaryDirectory() as _tmpdir:
            _db_copy = os.path.join(_tmpdir, "finance.db")
            shutil.copy2(DB_PATH, _db_copy)
            _json_path = os.path.join(_tmpdir, "data.json")
            _cexp = _gc_exp()
            _tables = [r["name"] for r in _cexp.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()]
            _export_data = {}
            for _tbl in _tables:
                _cols = [r[1] for r in _cexp.execute(f"PRAGMA table_info({_tbl})").fetchall()]
                if "user_id" in _cols:
                    _rows = _cexp.execute(f"SELECT * FROM {_tbl} WHERE user_id=?", (_active_uid,)).fetchall()
                elif _tbl == "users":
                    _rows = _cexp.execute(f"SELECT * FROM {_tbl} WHERE id=?", (_active_uid,)).fetchall()
                else:
                    continue
                _export_data[_tbl] = [dict(r) for r in _rows]
            _cexp.close()
            with open(_json_path, "w") as _jf:
                json.dump(_export_data, _jf, indent=2, default=str)
            _zip_path = os.path.join(_tmpdir, "orryon_export.zip")
            with zipfile.ZipFile(_zip_path, "w", zipfile.ZIP_DEFLATED) as _zf:
                _zf.write(_db_copy, "finance.db")
                _zf.write(_json_path, "data.json")
            with open(_zip_path, "rb") as _zr:
                st.download_button("💾 Download ZIP", data=_zr.read(),
                                   file_name="orryon_export.zip", mime="application/zip",
                                   use_container_width=True)

    st.markdown("---")
    st.caption(f"Model: `{os.getenv('GROK_MODEL', 'grok-3-mini')}` · All data in `finance.db`")
    if st.button("← Sign out", use_container_width=True, key="sign_out"):
        for _k in ["data_loaded","user_id","display_name","chat_history",
                   "orryon_last_message","orryon_actions","app_view"]:
            if _k in st.session_state:
                del st.session_state[_k]
        st.session_state.screen = "home"
        st.rerun()

    _stream_area = st.empty()


# ─────────────────────────────────────────────────────────────────────────────
# FULL DASHBOARD  —  all 6 tabs
# ─────────────────────────────────────────────────────────────────────────────
elif _app_view == "full_dash":

    # ── Top nav ───────────────────────────────────────────────────────────────
    _fd_back, _fd_gap, _fd_dash, _fd_set = st.columns([1, 6, 1.5, 1.3])
    with _fd_back:
        st.markdown('<div class="nav-btn">', unsafe_allow_html=True)
        if st.button("←", key="full_back"):
            st.session_state.app_view = "home"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)
    with _fd_dash:
        st.markdown('<div class="nav-btn nav-btn-active">', unsafe_allow_html=True)
        if st.button("⊞", key="full_dash_nav"):
            st.session_state.app_view = "dash_panel"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)
    with _fd_set:
        st.markdown('<div class="nav-btn">', unsafe_allow_html=True)
        if st.button("⚙️", key="full_set_nav"):
            st.session_state.app_view = "settings_panel"
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    # ── Global search ─────────────────────────────────────────────────────────
    _search_q = st.text_input("", placeholder="🔍  Search transactions, events, tasks, goals…",
                               label_visibility="collapsed", key="global_search")
    if _search_q and _search_q.strip():
        _sq = _search_q.strip().lower()
        _search_conn = __import__("db").get_connection()
        _s_txns = _search_conn.execute(
            "SELECT 'transaction' as type, merchant as title, date, amount FROM transactions "
            "WHERE user_id=? AND (LOWER(merchant) LIKE ? OR LOWER(category) LIKE ?) LIMIT 5",
            (_active_uid, f"%{_sq}%", f"%{_sq}%"),
        ).fetchall()
        _s_events = _search_conn.execute(
            "SELECT 'event' as type, title, event_date as date FROM events "
            "WHERE user_id=? AND LOWER(title) LIKE ? LIMIT 5",
            (_active_uid, f"%{_sq}%"),
        ).fetchall()
        _s_tasks = _search_conn.execute(
            "SELECT 'task' as type, title, due_date as date FROM action_items "
            "WHERE user_id=? AND LOWER(title) LIKE ? LIMIT 5",
            (_active_uid, f"%{_sq}%"),
        ).fetchall()
        _s_notes = _search_conn.execute(
            "SELECT 'note' as type, title, created_at as date FROM notes "
            "WHERE user_id=? AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?) LIMIT 5",
            (_active_uid, f"%{_sq}%", f"%{_sq}%"),
        ).fetchall()
        _s_goals = _search_conn.execute(
            "SELECT 'goal' as type, name as title FROM goals "
            "WHERE user_id=? AND LOWER(name) LIKE ? LIMIT 5",
            (_active_uid, f"%{_sq}%"),
        ).fetchall()
        _search_conn.close()
        _type_badges = {"transaction":"💸","event":"📅","task":"✅","note":"📝","goal":"🎯"}
        _all_results = list(_s_txns)+list(_s_events)+list(_s_tasks)+list(_s_notes)+list(_s_goals)
        if _all_results:
            for _sr in _all_results[:12]:
                _badge = _type_badges.get(_sr["type"],"•")
                _extra = f" — ${float(_sr['amount']):,.2f}" if "amount" in _sr.keys() and _sr["amount"] else ""
                _dstr = f" · {(_sr.get('date') or '')[:10]}" if _sr.get("date") else ""
                st.markdown(
                    f'<div style="display:flex;align-items:center;gap:8px;padding:4px 0;'
                    f'border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.83rem;">'
                    f'<span>{_badge}</span>'
                    f'<span style="flex:1;color:#e2e8f0;">{_sr["title"]}{_extra}</span>'
                    f'<span style="color:rgba(255,255,255,0.3);font-size:0.74rem;">{_sr["type"]}{_dstr}</span>'
                    f'</div>', unsafe_allow_html=True,
                )
        else:
            st.caption(f"No results for '{_search_q}'")

    # ── orryon response banner ────────────────────────────────────────────────
    if st.session_state.get("orryon_last_message"):
        st.markdown(
            '<div class="orryon-response"><div class="orryon-badge">✦ orryon</div></div>',
            unsafe_allow_html=True,
        )
        st.markdown(st.session_state.orryon_last_message)
        _btn_cols2 = [3,1,1] if st.session_state.get("orryon_undo_info") else [3,1]
        _bcols2 = st.columns(_btn_cols2)
        with _bcols2[0]:
            if st.button("✕ Dismiss", key="dismiss_resp_fd"):
                st.session_state.orryon_last_message = ""
                st.session_state.orryon_undo_info = None
                st.rerun()
        with _bcols2[1]:
            if st.button("🕐 History" if not st.session_state.show_chat_history else "Hide", key="toggle_hist_fd"):
                st.session_state.show_chat_history = not st.session_state.show_chat_history
                st.rerun()
        if st.session_state.get("orryon_undo_info") and len(_bcols2) > 2:
            with _bcols2[2]:
                if st.button("↩ Undo", key="undo_fd"):
                    _undo2 = st.session_state.orryon_undo_info
                    from db import delete_row as _del_undo2
                    _del_undo2(_undo2["table"], {"id": _undo2["id"]})
                    st.session_state.orryon_last_message = f"↩ Undone: {_undo2.get('label','last action')}"
                    st.session_state.orryon_undo_info = None
                    st.rerun()
    if st.session_state.show_chat_history and st.session_state.chat_history:
        st.markdown(
            '<div style="max-height:300px;overflow-y:auto;padding:0.5rem;'
            'border:1px solid rgba(255,255,255,0.06);border-radius:12px;'
            'background:#0a0a0a;margin-bottom:0.75rem;">',
            unsafe_allow_html=True,
        )
        for _msg2 in st.session_state.chat_history[-24:]:
            if _msg2["role"] == "user":
                st.markdown(f'<div class="chat-bubble-user">👤 {_msg2["content"]}</div>', unsafe_allow_html=True)
            else:
                st.markdown(f'<div class="chat-bubble-ai">✦ {_msg2.get("content","")}</div>', unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)

    # ── Quick-add strip ───────────────────────────────────────────────────────
    _qa1, _qa2, _qa3, _qa4 = st.columns(4)
    with _qa1:
        with st.popover("Expense", use_container_width=True):
            st.markdown("**Quick Add Expense**")
            _qa_merchant = st.text_input("Merchant", placeholder="Starbucks", key="qa_merchant")
            _qa_amount   = st.number_input("Amount ($)", min_value=0.01, step=1.0, key="qa_amount")
            _qa_cat      = st.selectbox("Category", ["Food & Dining","Groceries","Transport",
                           "Subscriptions","Health & Fitness","Shopping","Rent & Housing",
                           "Utilities","Entertainment","Travel","Other"], key="qa_cat")
            _qa_receipt  = st.file_uploader("Receipt (optional)", type=["png","jpg","jpeg","pdf"], key="qa_receipt")
            _qa_split    = st.toggle("Split expense", key="qa_split_toggle")
            if _qa_split:
                _qa_split_with  = st.text_input("Split with", placeholder="e.g. Kirk", key="qa_split_with")
                _qa_split_count = st.number_input("Total people", min_value=2, max_value=20, value=2, key="qa_split_count")
            if st.button("Add", type="primary", use_container_width=True, key="qa_exp_submit"):
                if _qa_merchant and _qa_amount > 0:
                    import json as _qjson
                    from db import insert_row as _qi, adjust_balance as _adj_bal
                    from core.tools import _uid as _quid
                    from datetime import datetime as _qdt
                    from config import ATTACHMENTS_DIR as _qa_att_dir
                    _att_path = ""
                    if _qa_receipt is not None:
                        _att_fname = f"{_quid()}_{_qa_receipt.name}"
                        _att_path = os.path.join(_qa_att_dir, _att_fname)
                        with open(_att_path, "wb") as _af:
                            _af.write(_qa_receipt.getvalue())
                    _log_amount = float(_qa_amount)
                    _meta = {}
                    if _qa_split:
                        _log_amount = round(float(_qa_amount) / int(_qa_split_count), 2)
                        _meta = {"split_total": float(_qa_amount), "split_with": _qa_split_with, "split_count": int(_qa_split_count)}
                    _qi("transactions", {
                        "id": _quid(), "user_id": _active_uid,
                        "date": _qdt.now().strftime("%Y-%m-%d"),
                        "amount": _log_amount, "merchant": _qa_merchant,
                        "description": _qa_merchant, "category": _qa_cat,
                        "is_recurring": 0, "metadata": _qjson.dumps(_meta),
                        "attachment_path": _att_path,
                    })
                    _adj_bal(_active_uid, -_log_amount)
                    st.success(f"✅ ${_qa_amount:.2f} at {_qa_merchant}")
                    st.rerun()
    with _qa2:
        with st.popover("Task", use_container_width=True):
            st.markdown("**Quick Add Task**")
            _qa_task = st.text_input("Task title", placeholder="Call dentist", key="qa_task")
            _qa_due  = st.date_input("Due (optional)", value=None, key="qa_task_due")
            _qa_pri  = st.selectbox("Priority", ["medium","high","low"], key="qa_task_pri")
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
                    st.success("✅ Task added!")
                    st.rerun()
    with _qa3:
        with st.popover("Grocery", use_container_width=True):
            st.markdown("**Quick Add to Grocery List**")
            _qa_item = st.text_input("Item name", placeholder="Milk, eggs…", key="qa_groc")
            _qa_qty  = st.text_input("Quantity", value="1", key="qa_groc_qty")
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
        with st.popover("Note", use_container_width=True):
            st.markdown("**Quick Add Note**")
            _qa_ntitle   = st.text_input("Title", placeholder="Reminder, idea…", key="qa_note_title")
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

    if st.session_state.get("show_onboarding"):
        st.markdown("""
<div style="background:rgba(29,155,240,0.08);border:1px solid rgba(29,155,240,0.2);
border-radius:14px;padding:1.1rem 1.2rem;margin-bottom:1rem;">
<h3 style="margin:0 0 0.25rem;font-size:1rem;color:#fff;">Welcome to orryon ✦</h3>
<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin:0 0 0.6rem;">
Type naturally in the chat below — I'll handle everything.</p>
</div>
""", unsafe_allow_html=True)
        if st.button("Got it!", type="primary", key="dismiss_onboarding_fd"):
            st.session_state.show_onboarding = False
            st.rerun()

    _stream_area = st.empty()

    # ── 6 Tabs ────────────────────────────────────────────────────────────────
    tab_dash, tab_budget, tab_forecast, tab_schedule, tab_goals, tab_notes = st.tabs([
        "📊 Dashboard", "💳 Budget", "📈 Forecast",
        "📅 Schedule", "🎯 Goals", "📝 Notes",
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

    st.markdown("""<script>
(function(){
  var KEY='orryon_active_tab';
  function setup(){
    var tabs=window.parent.document.querySelectorAll('button[data-baseweb="tab"]');
    if(!tabs||!tabs.length){setTimeout(setup,100);return;}
    var saved=sessionStorage.getItem(KEY);
    if(saved!==null){var idx=parseInt(saved);if(idx>0&&idx<tabs.length)tabs[idx].click();sessionStorage.removeItem(KEY);}
    tabs.forEach(function(t,i){t.addEventListener('click',function(){sessionStorage.setItem(KEY,i);});});
  }
  setup();
})();
</script>""", unsafe_allow_html=True)


# ── CHAT INPUT  (always present) ──────────────────────────────────────────────
_user_input = st.chat_input("Ask me anything…")

if _user_input:
    if _app_view != "full_dash":
        st.session_state.app_view = "home"
    _user_msg = {"role": "user", "content": _user_input, "created_at": datetime.now().isoformat()}
    st.session_state.chat_history.append(_user_msg)
    save_chat_message(_active_uid, _user_msg)

    _full_response = ""
    _actions = []
    _tabs_to_refresh = []
    _undo_info = None

    try:
        from core.grok_agent import run_orryon_stream
        with _stream_area.container():
            st.markdown('<div class="orryon-badge" style="margin-bottom:0.3rem">✦ orryon</div>',
                        unsafe_allow_html=True)
            _tool_status = st.empty()
            _response_display = st.empty()
            for _event in run_orryon_stream(
                user_message=_user_input,
                user_id=_active_uid,
                chat_history=st.session_state.chat_history[:-1],
                user_name=_display_name or "there",
            ):
                if _event["type"] == "token":
                    _full_response += _event["content"]
                    _response_display.markdown(_full_response + "▍")
                elif _event["type"] == "tool":
                    _tool_status.caption(f"✦ {_event['label']}…")
                elif _event["type"] == "done":
                    _full_response = _event.get("message", _full_response)
                    _actions = _event.get("actions", [])
                    _tabs_to_refresh = _event.get("tabs", [])
                    _undo_info = _event.get("undo_info")
                    _tool_status.empty()
                    _response_display.markdown(_full_response)
                elif _event["type"] == "error":
                    _full_response = _event["message"]
                    _tool_status.empty()
                    _response_display.markdown(_full_response)
    except Exception as exc:
        logger.error("run_orryon_stream failed: %s", exc)
        _full_response = f"Something went wrong: {exc}"

    _stream_area.empty()

    _ai_msg = {"role": "assistant", "content": _full_response, "created_at": datetime.now().isoformat()}
    st.session_state.chat_history.append(_ai_msg)
    save_chat_message(_active_uid, _ai_msg)

    st.session_state.orryon_last_message = _full_response
    st.session_state.orryon_actions = _actions
    st.session_state.orryon_undo_info = _undo_info
    st.session_state.show_chat_history = False
    st.rerun()
