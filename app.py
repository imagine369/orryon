"""
app.py — Streamlit frontend for guddd Personal Finance Dashboard.

Run with:
    streamlit run app.py

Layout
──────
  Sidebar     : quick stats, data controls, settings
  Tab: Chat   : multi-agent chat interface with quick-query buttons
  Tab: Dashboard : net worth donut, spending bar, goal progress, upcoming events
  Tab: Budget : treemap, subscription detection, transaction table
  Tab: Forecast : cash flow, Monte Carlo, scenario simulator
  Tab: Schedule : upcoming events, add bill reminders, quick event creator
  Tab: Notes  : journal, search, new note form, AI summary
  Tab: Reports : CSV export, debt payoff calculator, AI full report
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

# crewai requires Python 3.10+ — wrap gracefully so the dashboard still loads on 3.9
CREWAI_AVAILABLE = False
try:
    from crewai import Crew, Process
    from agents import (
        budget_agent,
        data_aggregator,
        forecasting_agent,
        insights_agent,
        net_worth_agent,
        notes_agent,
        orchestrator,
        scheduling_agent,
    )
    from tasks import route_query_to_tasks
    CREWAI_AVAILABLE = True
except Exception as _crewai_err:
    logger_pre = logging.getLogger(__name__)
    logger_pre.warning("crewai not available (%s). AI chat disabled.", _crewai_err)

from config import USER_ID
from db import fetch_rows
from tools import (
    add_bill_reminder,
    analyze_spending_trends,
    calculate_net_worth,
    create_calendar_event,
    detect_subscriptions,
    forecast_cash_flow,
    generate_csv_report,
    get_debt_payoff_plan,
    get_financial_recommendations,
    get_portfolio_performance,
    get_spending_by_category,
    list_upcoming_events,
    load_sample_data,
    run_monte_carlo_retirement,
    save_note,
    search_notes,
    simulate_scenario,
    summarize_notes,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# PAGE CONFIG
# ─────────────────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="guddd",
    page_icon="💰",
    layout="centered",
    initial_sidebar_state="collapsed",
)

# ── PWA: manifest + service worker ───────────────────────────────────────────
st.markdown("""
<link rel="manifest" href="/app/static/manifest.json">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="guddd">
<link rel="apple-touch-icon" href="/app/static/icon-192.png">
<meta name="theme-color" content="#000000">
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/app/static/sw.js', { scope: '/app/static/' })
        .then(function (reg) { console.log('[guddd] SW registered', reg.scope); })
        .catch(function (err) { console.warn('[guddd] SW failed', err); });
    });
  }
</script>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# GLOBAL CSS
# ─────────────────────────────────────────────────────────────────────────────

st.markdown(
    """
<style>
  /* ── Mobile viewport ── */
  meta[name="viewport"] { content: "width=device-width, initial-scale=1"; }

  /* ── Hide all Streamlit chrome ── */
  #MainMenu, footer { visibility: hidden; }
  [data-testid="stHeader"],
  [data-testid="stToolbar"],
  [data-testid="stDecoration"] { display: none !important; }
  [data-testid="stSidebar"] { display: none !important; }
  .block-container {
    padding-top: 1rem !important;
    padding-bottom: 2rem !important;
    padding-left: 1rem !important;
    padding-right: 1rem !important;
    max-width: 480px !important;
  }

  /* ── Hero ── */
  .hero-wrap {
    display: flex; flex-direction: column; align-items: center;
    text-align: center; padding: 0.5rem 0 1.5rem;
  }
  .hero-title {
    font-size: 2.6rem; font-weight: 800; letter-spacing: -1px;
    background: linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    margin: 0.5rem 0 0.2rem;
  }
  .hero-sub {
    font-size: 1rem; color: #8892a4; margin: 0 0 1.4rem;
  }
  .hero-cta {
    display: inline-block;
    background: linear-gradient(135deg, #00c9ff, #92fe9d);
    color: #000 !important; font-weight: 700; font-size: 1rem;
    padding: 0.75rem 2.2rem; border-radius: 50px;
    text-decoration: none; margin-top: 0.5rem;
    box-shadow: 0 4px 20px rgba(0,201,255,0.35);
  }

  /* ── Main header ── */
  .main-header {
    font-size: 1.5rem; font-weight: 700;
    background: linear-gradient(135deg, #00c9ff, #92fe9d);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    margin-bottom: 0.25rem;
  }

  /* ── Chat bubbles ── */
  .chat-user {
    background: #1e3a5f; border-radius: 18px 18px 4px 18px;
    padding: 0.75rem 1rem; margin: 0.4rem 0;
    border-left: 3px solid #00c9ff; font-size: 0.92rem;
  }
  .chat-ai {
    background: #1a2e1a; border-radius: 18px 18px 18px 4px;
    padding: 0.75rem 1rem; margin: 0.4rem 0;
    border-left: 3px solid #92fe9d; font-size: 0.92rem;
  }
  .badge {
    font-size: 0.68rem; padding: 2px 7px; border-radius: 20px;
    background: #2d3748; color: #a0aec0; margin-right: 4px;
  }

  /* ── Cards ── */
  .insight-card {
    background: #1a1a2e; border-radius: 10px; padding: 0.75rem;
    margin: 0.35rem 0; border-left: 3px solid #ffd700;
  }
  .goal-bar-wrap {
    background: #2d2d44; border-radius: 4px; height: 8px; margin: 6px 0;
  }

  /* ── Responsive tabs ── */
  .stTabs [data-baseweb="tab-list"] { gap: 2px; flex-wrap: wrap; }
  .stTabs [data-baseweb="tab"] { padding: 6px 10px; font-size: 0.78rem; }

  /* ── Buttons full-width on small screens ── */
  @media (max-width: 500px) {
    .stButton > button { width: 100% !important; }
  }
</style>
""",
    unsafe_allow_html=True,
)


# ─────────────────────────────────────────────────────────────────────────────
# SESSION STATE
# ─────────────────────────────────────────────────────────────────────────────

def _init_state() -> None:
    defaults = {
        "chat_history": [],
        "data_loaded": False,
        "last_sync": None,
        "screen": "home",   # home | signin | signup
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


_init_state()


# ─────────────────────────────────────────────────────────────────────────────
# AGENT RUNNER
# ─────────────────────────────────────────────────────────────────────────────

def run_agent_query(user_query: str) -> str:
    """
    Route a user query through the multi-agent system and return the result.
    Falls back to a helpful message if crewai / Ollama are not available.
    """
    if not CREWAI_AVAILABLE:
        return (
            "⚠️ **AI chat requires Python 3.10+** and a running LLM.\n\n"
            "**To enable it:**\n"
            "1. Install Python 3.10+ (via [python.org](https://python.org/downloads) or `brew install python@3.11`)\n"
            "2. Create a virtualenv: `python3.11 -m venv .venv && source .venv/bin/activate`\n"
            "3. Install deps: `pip install -r requirements.txt`\n"
            "4. Install Ollama: [ollama.com](https://ollama.com) → `ollama pull llama3.1`\n"
            "5. Re-launch: `streamlit run app.py`\n\n"
            "The **Dashboard, Budget, Forecast, Schedule, Notes, and Reports** tabs all work right now — explore them!"
        )
    try:
        tasks = route_query_to_tasks(user_query)
        needed_agents = list({t.agent for t in tasks if t.agent is not orchestrator})
        if not needed_agents:
            needed_agents = [data_aggregator]

        crew = Crew(
            agents=needed_agents,
            tasks=tasks,
            process=Process.sequential,
            verbose=True,
            memory=True,
        )
        result = crew.kickoff()
        return str(result)
    except Exception as exc:
        logger.error("Agent query error: %s", exc)
        return (
            f"**Error:** {exc}\n\n"
            "Tip: Make sure Ollama is running (`ollama serve`) and the model is pulled "
            "(`ollama pull llama3.1`). Or set `LLM_PROVIDER=grok` + `XAI_API_KEY` in your `.env`."
        )


def _guess_agent_label(query: str) -> str:
    q = query.lower()
    if any(k in q for k in ["schedule", "calendar", "remind", "event", "bill"]):
        return "Scheduling Agent"
    if any(k in q for k in ["note", "journal", "memo"]):
        return "Notes Agent"
    if any(k in q for k in ["retire", "monte carlo", "projection"]):
        return "Forecasting Agent"
    if any(k in q for k in ["net worth", "portfolio", "stock", "crypto"]):
        return "Net Worth Agent"
    if any(k in q for k in ["spend", "budget", "subscription"]):
        return "Budget Agent"
    if any(k in q for k in ["insight", "anomal", "recommend"]):
        return "Insights Agent"
    return "Orchestrator"


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD DATA HELPERS (direct tool calls — fast, no LLM overhead)
# ─────────────────────────────────────────────────────────────────────────────

def _nw() -> dict:
    return json.loads(calculate_net_worth(""))


def _spending(days: int = 30) -> dict:
    return json.loads(get_spending_by_category(json.dumps({"days": days})))


def _portfolio() -> dict:
    return json.loads(get_portfolio_performance(json.dumps({"fetch_live_prices": False})))


def _upcoming_events(days: int = 30) -> list:
    return json.loads(list_upcoming_events(json.dumps({"days": days}))).get("events", [])


def _recommendations() -> list:
    return json.loads(get_financial_recommendations("")).get("recommendations", [])


# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR
# ─────────────────────────────────────────────────────────────────────────────

with st.sidebar:
    st.markdown('<div class="main-header">💰 guddd</div>', unsafe_allow_html=True)
    st.caption("Local-first · Privacy-first · Multi-agent")
    st.divider()

    if st.session_state.data_loaded:
        nw_data = _nw()
        if "net_worth" in nw_data:
            st.metric("Net Worth", f"${nw_data['net_worth']:,.0f}")
            c1, c2 = st.columns(2)
            c1.metric("Assets", f"${nw_data.get('total_assets', 0):,.0f}")
            c2.metric("Liabilities", f"${nw_data.get('total_liabilities', 0):,.0f}")
        st.divider()

    st.subheader("Data Controls")
    col_load, col_sync = st.columns(2)
    with col_load:
        if st.button("📥 Load Sample", use_container_width=True):
            with st.spinner("Loading…"):
                res = json.loads(load_sample_data(""))
                if res.get("status") == "success":
                    st.session_state.data_loaded = True
                    st.session_state.last_sync = datetime.now().isoformat()
                    st.success("Done!")
                    st.rerun()
    with col_sync:
        if st.button("🔄 Sync", use_container_width=True,
                     disabled=not st.session_state.data_loaded):
            st.session_state.last_sync = datetime.now().isoformat()
            st.success("Synced!")

    if st.session_state.last_sync:
        st.caption(f"Last sync: {st.session_state.last_sync[:16]}")

    st.divider()
    with st.expander("⚙️ Settings"):
        llm_display = st.radio(
            "LLM Backend", ["Grok (xAI) — grok-latest", "Ollama (local, private)"],
            horizontal=False, label_visibility="collapsed",
        )
        if "Grok" in llm_display:
            st.info("Set `LLM_PROVIDER=grok` and `XAI_API_KEY` in `.env`. Get a key at console.x.ai")
        else:
            st.info("Set `LLM_PROVIDER=ollama` in `.env`. Ensure `ollama serve` is running.")
        st.caption(f"User ID: `{USER_ID}`")

    st.divider()
    st.caption("🔒 All data stored locally in `finance.db`.")
    st.caption("📁 Notes saved to `notes/` as markdown.")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN LAYOUT
# ─────────────────────────────────────────────────────────────────────────────

if not st.session_state.data_loaded:
    import base64 as _b64
    with open("assets/tribble.png", "rb") as _f:
        _traw = _f.read()
    _tribble_b64 = _b64.b64encode(_traw).decode()
    _tribble_mime = "jpeg" if _traw[:3] == b"\xff\xd8\xff" else "png"

    # Route query-param nav clicks (from fixed HTML buttons)
    _action = st.query_params.get("action", "")
    if _action in ("signin", "signup"):
        st.session_state.screen = _action
        st.query_params.clear()
        st.rerun()

    # ── Shared auth CSS ───────────────────────────────────────────────────
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
  /* auth page shared pill button */
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
  .or-divider{
    display:flex; align-items:center; gap:0.7rem;
    color:rgba(255,255,255,.35); font-size:0.85rem; margin:0.2rem 0;
  }
  .or-divider::before,.or-divider::after{
    content:''; flex:1; height:1px; background:rgba(255,255,255,.12);
  }
  .auth-footer{
    text-align:center; color:rgba(255,255,255,.38);
    font-size:0.82rem; margin-top:1.8rem;
  }
  .auth-footer span{color:#1d9bf0; cursor:pointer}

  /* ── Fixed top-right nav buttons ── */
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

    # ── Fixed Sign in / Sign up in top-right corner ───────────────────────
    st.markdown("""
<div class="fixed-topnav">
  <a href="?action=signin" class="btn-si">Sign in</a>
  <a href="?action=signup" class="btn-su">Sign up</a>
</div>
""", unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════════
    # SCREEN: SIGN IN
    # ═══════════════════════════════════════════════════════════════════════
    if st.session_state.screen == "signin":
        # top bar: close + logo
        _tc, _tlogo, _ = st.columns([1, 1, 1])
        with _tc:
            if st.button("✕", key="si_close"):
                st.session_state.screen = "home"; st.rerun()
        with _tlogo:
            st.markdown(
                f'<div style="text-align:center">'
                f'<img src="data:image/{_tribble_mime};base64,{_tribble_b64}" '
                f'style="width:32px;height:32px;border-radius:50%;object-fit:cover"/></div>',
                unsafe_allow_html=True)

        st.markdown("<br>", unsafe_allow_html=True)
        st.markdown("## Sign in to guddd")

        # social buttons
        st.markdown('<div class="auth-btn auth-btn-white">', unsafe_allow_html=True)
        if st.button("🔵  Sign in with Google", use_container_width=True, key="si_google"):
            load_sample_data(""); st.session_state.data_loaded = True
            st.session_state.last_sync = datetime.now().isoformat()
            st.session_state.screen = "home"; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="auth-btn auth-btn-white">', unsafe_allow_html=True)
        if st.button("🍎  Sign in with Apple", use_container_width=True, key="si_apple"):
            load_sample_data(""); st.session_state.data_loaded = True
            st.session_state.last_sync = datetime.now().isoformat()
            st.session_state.screen = "home"; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="or-divider">or</div>', unsafe_allow_html=True)

        st.markdown('<div class="auth-input">', unsafe_allow_html=True)
        email = st.text_input("", placeholder="Phone, email, or username",
                              label_visibility="collapsed", key="si_email")
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="auth-btn auth-btn-white">', unsafe_allow_html=True)
        if st.button("Next", use_container_width=True, key="si_next"):
            load_sample_data(""); st.session_state.data_loaded = True
            st.session_state.last_sync = datetime.now().isoformat()
            st.session_state.screen = "home"; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="auth-btn auth-btn-outline" style="margin-top:0.5rem">', unsafe_allow_html=True)
        st.button("Forgot password?", use_container_width=True, key="si_forgot")
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown(
            '<div class="auth-footer">Don\'t have an account? '
            '<span id="goto-signup">Sign up</span></div>', unsafe_allow_html=True)
        if st.button("→ Sign up instead", key="si_goto_signup",
                     help="Go to sign up"):
            st.session_state.screen = "signup"; st.rerun()
        st.stop()

    # ═══════════════════════════════════════════════════════════════════════
    # SCREEN: SIGN UP
    # ═══════════════════════════════════════════════════════════════════════
    if st.session_state.screen == "signup":
        _tc2, _tlogo2, _ = st.columns([1, 1, 1])
        with _tc2:
            if st.button("✕", key="su_close"):
                st.session_state.screen = "home"; st.rerun()
        with _tlogo2:
            st.markdown(
                f'<div style="text-align:center">'
                f'<img src="data:image/{_tribble_mime};base64,{_tribble_b64}" '
                f'style="width:32px;height:32px;border-radius:50%;object-fit:cover"/></div>',
                unsafe_allow_html=True)

        st.markdown("<br>", unsafe_allow_html=True)
        st.markdown("## Create your account")

        st.markdown('<div class="auth-btn auth-btn-white">', unsafe_allow_html=True)
        if st.button("🔵  Sign up with Google", use_container_width=True, key="su_google"):
            load_sample_data(""); st.session_state.data_loaded = True
            st.session_state.last_sync = datetime.now().isoformat()
            st.session_state.screen = "home"; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="auth-btn auth-btn-white">', unsafe_allow_html=True)
        if st.button("🍎  Sign up with Apple", use_container_width=True, key="su_apple"):
            load_sample_data(""); st.session_state.data_loaded = True
            st.session_state.last_sync = datetime.now().isoformat()
            st.session_state.screen = "home"; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="or-divider">or</div>', unsafe_allow_html=True)

        st.markdown('<div class="auth-input">', unsafe_allow_html=True)
        su_name  = st.text_input("", placeholder="Name", label_visibility="collapsed", key="su_name")
        su_email = st.text_input("", placeholder="Phone or email", label_visibility="collapsed", key="su_email")
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown('<div class="auth-btn auth-btn-white">', unsafe_allow_html=True)
        if st.button("Create account", use_container_width=True, key="su_create"):
            load_sample_data(""); st.session_state.data_loaded = True
            st.session_state.last_sync = datetime.now().isoformat()
            st.session_state.screen = "home"; st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

        st.markdown(
            '<div class="auth-footer">Already have an account? '
            '<span>Sign in</span></div>', unsafe_allow_html=True)
        if st.button("→ Sign in instead", key="su_goto_signin"):
            st.session_state.screen = "signin"; st.rerun()
        st.stop()

    # ═══════════════════════════════════════════════════════════════════════
    # SCREEN: HOME (Grok-style)
    # ═══════════════════════════════════════════════════════════════════════
    # ── Grok-style homepage ────────────────────────────────────────────────

    st.markdown(
        f"""
<style>
  /* ── Black background ── */
  [data-testid="stAppViewContainer"],
  [data-testid="stMain"],
  [data-testid="stHeader"],
  .stApp,
  section[data-testid="stMain"] > div {{
    background: #000 !important;
  }}
  #MainMenu, footer {{ visibility: hidden; }}
  [data-testid="stHeader"] {{ background: transparent !important; }}
  [data-testid="stSidebar"] {{ display: none !important; }}

  /* ── Full-height flex column ── */
  .block-container {{
    min-height: 100vh !important;
    display: flex !important;
    flex-direction: column !important;
    padding: 0.75rem 1rem 1rem !important;
    max-width: 480px !important;
    background: transparent !important;
  }}

  /* ── Top nav row ── */
  .nav-row {{
    display: flex; align-items: center;
    justify-content: space-between; width: 100%;
  }}
  .nav-icon {{
    width: 36px; height: 36px; border-radius: 10px;
    object-fit: cover; opacity: 0.85;
  }}
  .nav-btns {{ display: flex; gap: 0.45rem; align-items: center; }}

  /* Sign in – outlined */
  div[data-testid="column"]:nth-of-type(2) .stButton > button {{
    background: transparent !important;
    border: 1.5px solid rgba(255,255,255,0.45) !important;
    color: #fff !important;
    border-radius: 50px !important;
    padding: 0.5rem 1.3rem !important;
    font-size: 0.95rem !important; font-weight: 500 !important;
    width: auto !important; min-width: 0 !important;
    box-shadow: none !important; letter-spacing: 0.1px !important;
  }}
  div[data-testid="column"]:nth-of-type(2) .stButton > button:hover {{
    border-color: rgba(255,255,255,0.75) !important;
  }}

  /* Sign up – white filled */
  div[data-testid="column"]:nth-of-type(3) .stButton > button {{
    background: #fff !important;
    border: none !important;
    color: #000 !important;
    border-radius: 50px !important;
    padding: 0.5rem 1.3rem !important;
    font-size: 0.95rem !important; font-weight: 600 !important;
    width: auto !important; min-width: 0 !important;
    box-shadow: none !important; letter-spacing: 0.1px !important;
  }}
  div[data-testid="column"]:nth-of-type(3) .stButton > button:hover {{
    background: #e5e5e5 !important;
  }}

  /* ── Center hero ── */
  .hero-center {{
    position: fixed;
    top: calc(50% - 110px); left: 50%;
    transform: translate(-50%, -50%);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; gap: 1rem;
    z-index: 1;
  }}
  .hero-avatar {{
    width: 110px; height: 110px;
    border-radius: 50%; object-fit: cover;
  }}
  .hero-name {{
    font-size: 2rem; font-weight: 800;
    letter-spacing: 2px; color: #fff;
    text-transform: uppercase;
    margin-top: -10px;
  }}

  /* ── Chat input – Grok style ── */
  [data-testid="stBottom"] {{
    background: transparent !important;
    padding-bottom: 0.5rem !important;
  }}
  [data-testid="stChatInputContainer"] {{
    background: #1c1c1e !important;
    border: 1px solid rgba(255,255,255,0.10) !important;
    border-radius: 28px !important;
    padding: 0.15rem 0.5rem !important;
  }}
  [data-testid="stChatInputContainer"] textarea {{
    color: #fff !important;
    background: transparent !important;
    font-size: 1rem !important;
  }}
  [data-testid="stChatInputContainer"] textarea::placeholder {{
    color: rgba(255,255,255,0.38) !important;
  }}
  /* submit button → waveform circle */
  [data-testid="stChatInputSubmitButton"] > button {{
    background: #fff !important;
    border-radius: 50% !important;
    color: #000 !important;
    width: 2.2rem !important; height: 2.2rem !important;
    padding: 0 !important;
  }}

  /* ── Lift chat input, strip gray background ── */
  [data-testid="stBottom"],
  [data-testid="stBottom"] > div,
  [data-testid="stChatInput"],
  .stChatFloatingInputContainer {{
    background: transparent !important;
    padding-bottom: 3.8rem !important;
  }}

  /* ── Dictate pill: fixed just below chat input ── */
  .dictate-pill {{
    position: fixed; bottom: 2.4rem;
    left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 0.45rem;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 50px;
    padding: 0.38rem 1.1rem;
    color: rgba(255,255,255,0.65);
    font-size: 0.82rem;
    white-space: nowrap;
    z-index: 1000; cursor: default;
  }}

  /* ── Bottom note: fixed at very bottom ── */
  .bottom-note {{
    position: fixed; bottom: 0.6rem;
    left: 0; right: 0; text-align: center;
    font-size: 0.70rem;
    color: rgba(255,255,255,0.22);
    z-index: 1000; margin: 0;
  }}
</style>
""",
        unsafe_allow_html=True,
    )


    # ── Center: tribble avatar + app name ─────────────────────────────────
    st.markdown(
        f"""
        <div class="hero-center">
          <img src="data:image/{_tribble_mime};base64,{_tribble_b64}" class="hero-avatar" />
          <div class="hero-name">guddd</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        '<p class="bottom-note">By using guddd, all data stays on your device</p>',
        unsafe_allow_html=True,
    )
    st.stop()

# ── Post-login top bar: hamburger left, title center ─────────────────────
_app_l, _app_c, _app_r = st.columns([1, 4, 1])
with _app_l:
    with st.popover("☰"):
        st.markdown("**💰 guddd**")
        st.caption("Local-first · Private · Multi-agent")
        st.divider()
        if st.session_state.data_loaded:
            _nw_q = json.loads(calculate_net_worth(""))
            if "net_worth" in _nw_q:
                st.metric("Net Worth", f"${_nw_q['net_worth']:,.0f}")
                _c1, _c2 = st.columns(2)
                _c1.metric("Assets", f"${_nw_q.get('total_assets',0):,.0f}")
                _c2.metric("Liabilities", f"${_nw_q.get('total_liabilities',0):,.0f}")
            st.divider()
        if st.button("🔄 Sync", use_container_width=True):
            st.session_state.last_sync = datetime.now().isoformat()
            st.success("Synced!")
        st.divider()
        st.subheader("⚙️ Settings")
        _llm = st.radio("LLM Backend", ["Grok (xAI)", "Ollama (local)"],
                        label_visibility="collapsed")
        if "Grok" in _llm:
            st.caption("Set `LLM_PROVIDER=grok` + `XAI_API_KEY` in `.env`")
        else:
            st.caption("Set `LLM_PROVIDER=ollama` in `.env`")
        st.divider()
        st.caption("🔒 Data in `finance.db` · Notes in `notes/`")
        if st.button("← Sign out", use_container_width=True):
            st.session_state.data_loaded = False
            st.rerun()
with _app_c:
    st.markdown('<h1 class="main-header">💰 guddd</h1>', unsafe_allow_html=True)

# ── Post-login: Ask Guddd input + dictate pill ────────────────────────────
st.markdown("""
<style>
  [data-testid="stBottom"],[data-testid="stBottom"]>div,
  [data-testid="stChatInput"],.stChatFloatingInputContainer{
    background:transparent!important;
  }
  .app-dictate-pill{
    position:fixed; bottom:2.4rem;
    left:50%; transform:translateX(-50%);
    display:flex; align-items:center; gap:0.45rem;
    background:rgba(255,255,255,0.08);
    border:1px solid rgba(255,255,255,0.14);
    border-radius:50px; padding:0.38rem 1.1rem;
    color:rgba(255,255,255,0.65); font-size:0.82rem;
    white-space:nowrap; z-index:1000; cursor:default;
  }
</style>
""", unsafe_allow_html=True)
_app_query = st.chat_input("Ask Guddd…")
if _app_query:
    st.session_state.chat_history.append({"role": "user", "content": _app_query})
    st.rerun()
st.markdown('<div class="app-dictate-pill">🎙 New &nbsp;·&nbsp; Hold to dictate</div>',
            unsafe_allow_html=True)

(
    tab_chat, tab_dash, tab_budget,
    tab_forecast, tab_schedule, tab_notes, tab_reports,
) = st.tabs([
    "💬 Chat", "📊 Dashboard", "💳 Budget",
    "📈 Forecast", "📅 Schedule", "📝 Notes", "📋 Reports",
])


# ═════════════════════════════════════════════════════════════════════════════
# TAB: CHAT
# ═════════════════════════════════════════════════════════════════════════════

with tab_chat:
    st.subheader("Ask Your Finance AI")

    QUICK = [
        "What's my net worth?",
        "Show spending this month",
        "Run retirement projection",
        "Any unusual transactions?",
        "Schedule rent payment of $1800 due on the 1st",
        "Save a note: I want to cut dining out by 20%",
    ]
    qcols = st.columns(3)
    triggered = None
    for idx, q in enumerate(QUICK):
        if qcols[idx % 3].button(q, use_container_width=True, key=f"q{idx}"):
            triggered = q

    st.divider()

    chat_box = st.container(height=430)
    with chat_box:
        if not st.session_state.chat_history:
            st.markdown(
                "<div style='text-align:center;color:#666;padding:2rem'>"
                "<h3>👋 Welcome to guddd</h3>"
                "<p>Ask anything about your finances. Agents collaborate to answer.</p>"
                "<p><em>Try: &quot;What&#39;s my emergency fund status?&quot; or &quot;Schedule my car payment&quot;</em></p>"
                "</div>",
                unsafe_allow_html=True,
            )
        for msg in st.session_state.chat_history:
            if msg["role"] == "user":
                st.markdown(
                    f'<div class="chat-user">👤 <strong>You:</strong> {msg["content"]}</div>',
                    unsafe_allow_html=True,
                )
            else:
                badge = f'<span class="badge">🤖 {msg.get("agent", "AI")}</span>'
                st.markdown(
                    f'<div class="chat-ai">{badge}<br>{msg["content"]}</div>',
                    unsafe_allow_html=True,
                )

    with st.form("chat_form", clear_on_submit=True):
        user_input = st.text_area(
            "Your question",
            placeholder=(
                "e.g. 'What's my net worth?'  |  "
                "'Schedule Netflix renewal reminder'  |  "
                "'Save a note: increased 401k to 15%'"
            ),
            height=80,
            label_visibility="collapsed",
        )
        s_col, c_col = st.columns([5, 1])
        submitted = s_col.form_submit_button("Send 🚀", use_container_width=True, type="primary")
        cleared = c_col.form_submit_button("Clear", use_container_width=True)

    if cleared:
        st.session_state.chat_history = []
        st.rerun()

    to_process = triggered or (user_input.strip() if submitted and user_input.strip() else None)

    if to_process:
        st.session_state.chat_history.append({"role": "user", "content": to_process})
        with st.spinner("Consulting your financial agents…"):
            if not st.session_state.data_loaded:
                load_sample_data("")
                st.session_state.data_loaded = True
            response = run_agent_query(to_process)
        st.session_state.chat_history.append({
            "role": "assistant",
            "content": response,
            "agent": _guess_agent_label(to_process),
        })
        st.rerun()


# ═════════════════════════════════════════════════════════════════════════════
# TAB: DASHBOARD
# ═════════════════════════════════════════════════════════════════════════════

with tab_dash:
    st.subheader("Financial Dashboard")

    if not st.session_state.data_loaded:
        st.warning("Load data from the sidebar to populate the dashboard.")
    else:
        nw = _nw()
        spend = _spending(30)

        # ── Top metric row ──────────────────────────────────────────────────
        m1, m2, m3, m4, m5 = st.columns(5)
        m1.metric("Net Worth", f"${nw.get('net_worth', 0):,.0f}")
        m2.metric("Assets", f"${nw.get('total_assets', 0):,.0f}")
        m3.metric("Liabilities", f"${nw.get('total_liabilities', 0):,.0f}")
        m4.metric("30-Day Spending", f"${spend.get('total', 0):,.0f}")
        goals_db = fetch_rows("goals", {"user_id": USER_ID})
        m5.metric("Active Goals", str(len([g for g in goals_db if not g.get("is_completed")])))

        st.divider()
        left, right = st.columns([3, 2])

        with left:
            # Net worth donut
            st.subheader("Net Worth Breakdown")
            bd = nw.get("breakdown", {})
            labels = ["Liquid Cash", "Investments", "Real Estate"]
            vals = [bd.get("liquid", 0), bd.get("investments", 0), bd.get("real_estate", 0)]
            lv = [(l, v) for l, v in zip(labels, vals) if v > 0]
            if lv:
                fig_d = go.Figure(go.Pie(
                    labels=[x[0] for x in lv],
                    values=[x[1] for x in lv],
                    hole=0.55,
                    marker_colors=["#00c9ff", "#92fe9d", "#ffd700"],
                    textinfo="label+percent",
                    hovertemplate="<b>%{label}</b><br>$%{value:,.0f}<extra></extra>",
                ))
                fig_d.update_layout(
                    height=300, showlegend=True,
                    paper_bgcolor="rgba(0,0,0,0)", font_color="white",
                    annotations=[dict(
                        text=f"${nw.get('net_worth', 0):,.0f}",
                        x=0.5, y=0.5, font_size=13, showarrow=False,
                        font=dict(color="white", weight=700),
                    )],
                )
                st.plotly_chart(fig_d, use_container_width=True)

            # Spending bar
            st.subheader("Spending This Month")
            spending_items = spend.get("spending", [])
            if spending_items:
                df_sp = pd.DataFrame(spending_items).head(8)
                fig_b = go.Figure(go.Bar(
                    x=df_sp["category"], y=df_sp["total"],
                    marker_color=px.colors.qualitative.Set3[:len(df_sp)],
                    hovertemplate="<b>%{x}</b><br>$%{y:,.0f}<extra></extra>",
                ))
                fig_b.update_layout(
                    height=260, showlegend=False,
                    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                    font_color="white",
                    xaxis=dict(gridcolor="rgba(255,255,255,0.07)"),
                    yaxis=dict(gridcolor="rgba(255,255,255,0.07)"),
                )
                st.plotly_chart(fig_b, use_container_width=True)
            else:
                st.info("No spending data found for this period.")

        with right:
            # Savings goals
            st.subheader("Savings Goals")
            if goals_db:
                for g in goals_db[:5]:
                    pct = min(
                        (g["current_amount"] / g["target_amount"] * 100)
                        if g["target_amount"] else 0,
                        100,
                    )
                    color = "#92fe9d" if pct >= 75 else "#ffd700" if pct >= 40 else "#ff6b6b"
                    st.markdown(
                        f"<div style='margin-bottom:0.8rem'>"
                        f"<div style='display:flex;justify-content:space-between'>"
                        f"<b>{g['name']}</b>"
                        f"<span style='color:{color}'>{pct:.0f}%</span></div>"
                        f"<div class='goal-bar-wrap'>"
                        f"<div style='background:{color};width:{pct}%;height:100%;border-radius:4px'></div>"
                        f"</div>"
                        f"<small>${g['current_amount']:,.0f} / ${g['target_amount']:,.0f}</small>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
            else:
                st.info("No goals yet. Ask the AI to create savings goals.")

            # AI recommendations
            st.subheader("AI Insights")
            recs = _recommendations()
            for rec in recs[:4]:
                emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(
                    rec.get("priority", "low"), "🔵"
                )
                st.markdown(
                    f'<div class="insight-card">{emoji} <b>{rec.get("type","Insight").replace("_"," ").title()}</b>'
                    f'<br><small>{rec.get("message","")}</small></div>',
                    unsafe_allow_html=True,
                )

            # Upcoming events
            st.subheader("Upcoming Bills")
            events = _upcoming_events(30)
            if events:
                for e in events[:5]:
                    amt = f" — ${e['amount']:,.0f}" if e.get("amount") else ""
                    st.markdown(f"📅 **{e['event_date']}** {e['title']}{amt}")
            else:
                st.caption("No events. Add bill reminders in the Schedule tab.")


# ═════════════════════════════════════════════════════════════════════════════
# TAB: BUDGET
# ═════════════════════════════════════════════════════════════════════════════

with tab_budget:
    st.subheader("Budget & Spending Analysis")

    if not st.session_state.data_loaded:
        st.warning("Load data from the sidebar first.")
    else:
        period = st.select_slider("Analysis period", [7, 14, 30, 60, 90], value=30)
        spend = _spending(period)
        items = spend.get("spending", [])
        total = spend.get("total", 0)

        if items:
            b1, b2 = st.columns(2)
            with b1:
                st.metric(f"Total Spending ({period}d)", f"${total:,.0f}")
                df_sp = pd.DataFrame(items)
                fig_tree = px.treemap(
                    df_sp, path=["category"], values="total",
                    color="total", color_continuous_scale="RdYlGn_r",
                    title="Spending Treemap",
                )
                fig_tree.update_layout(
                    height=340, paper_bgcolor="rgba(0,0,0,0)", font_color="white",
                )
                st.plotly_chart(fig_tree, use_container_width=True)

            with b2:
                st.dataframe(
                    df_sp[["category", "total", "percentage"]].rename(
                        columns={"category": "Category", "total": "Amount ($)", "percentage": "%"}
                    ).style.format({"Amount ($)": "${:,.2f}", "%": "{:.1f}%"}),
                    use_container_width=True, height=280,
                )

            # Spending trend (month-over-month)
            st.divider()
            st.subheader("Month-over-Month Trends")
            trend_data = json.loads(analyze_spending_trends(json.dumps({"user_id": USER_ID})))
            insights = trend_data.get("insights", [])
            if insights:
                for ins in insights[:5]:
                    arrow = "📈" if ins["change_pct"] > 0 else "📉"
                    st.markdown(f"{arrow} {ins['insight']}")
            else:
                st.info("Not enough historical data for trend analysis yet.")
        else:
            st.info("No spending data for this period. Load more sample data or connect Plaid.")

        # Subscription detection
        st.divider()
        st.subheader("Subscription Audit")
        if st.button("🔍 Detect Subscriptions", type="primary"):
            with st.spinner("Analysing transactions…"):
                sub_res = json.loads(detect_subscriptions(""))
                subs = sub_res.get("subscriptions", [])
                monthly_total = sub_res.get("monthly_total", 0)
                if subs:
                    st.metric(
                        "Monthly Subscription Spend",
                        f"${monthly_total:,.2f}",
                        delta=f"${monthly_total * 12:,.0f}/year",
                    )
                    st.dataframe(
                        pd.DataFrame(subs)[["name", "amount", "frequency", "occurrences"]]
                        .style.format({"amount": "${:.2f}"}),
                        use_container_width=True,
                    )
                else:
                    st.info("No recurring subscriptions detected in current data.")

        # Transaction table
        st.divider()
        st.subheader("Recent Transactions")
        txns = fetch_rows("transactions", {"user_id": USER_ID}, limit=60)
        if txns:
            df_t = pd.DataFrame(txns)[["date", "description", "category", "amount", "merchant"]]
            df_t["amount"] = df_t["amount"].map("${:,.2f}".format)
            st.dataframe(df_t, use_container_width=True, height=280)
        else:
            st.info("No transactions in the database.")


# ═════════════════════════════════════════════════════════════════════════════
# TAB: FORECAST
# ═════════════════════════════════════════════════════════════════════════════

with tab_forecast:
    st.subheader("Financial Forecasting & Planning")

    f1, f2, f3 = st.tabs(["💵 Cash Flow", "🎲 Retirement (Monte Carlo)", "⚡ Scenario Simulator"])

    # ── Cash Flow ────────────────────────────────────────────────────────────
    with f1:
        st.subheader("Cash Flow Forecast")
        c1, c2 = st.columns(2)
        with c1:
            cf_income = st.number_input("Monthly Income ($)", value=7500, step=100, key="cf_inc")
            cf_expenses = st.number_input("Monthly Expenses ($)", value=4200, step=100, key="cf_exp")
        with c2:
            cf_months = st.slider("Months to forecast", 3, 24, 6, key="cf_mo")
            cf_balance = st.number_input("Current Balance ($)", value=4250, step=100, key="cf_bal")
        cf_savings_rate = st.slider("Extra savings rate (%)", 0, 50, 10, key="cf_sr") / 100

        if st.button("📈 Generate Forecast", type="primary", key="btn_cf"):
            cf_res = json.loads(forecast_cash_flow(json.dumps({
                "months": cf_months, "monthly_income": cf_income,
                "monthly_expenses": cf_expenses, "current_balance": cf_balance,
                "savings_rate": cf_savings_rate,
            })))
            proj = cf_res.get("projections", [])
            if proj:
                df_cf = pd.DataFrame(proj)
                fig_cf = go.Figure()
                fig_cf.add_trace(go.Scatter(
                    x=df_cf["month"], y=df_cf["projected_balance"],
                    mode="lines+markers", name="Balance",
                    line=dict(color="#92fe9d", width=2),
                    fill="tozeroy", fillcolor="rgba(146,254,157,0.08)",
                ))
                fig_cf.add_trace(go.Bar(
                    x=df_cf["month"], y=df_cf["net"],
                    name="Monthly Net", marker_color="#00c9ff", opacity=0.55,
                ))
                fig_cf.update_layout(
                    title="Projected Cash Flow", height=380,
                    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                    font_color="white",
                    xaxis=dict(gridcolor="rgba(255,255,255,0.07)"),
                    yaxis=dict(gridcolor="rgba(255,255,255,0.07)"),
                )
                st.plotly_chart(fig_cf, use_container_width=True)
                r1, r2 = st.columns(2)
                r1.metric("Monthly Surplus", f"${cf_res.get('monthly_surplus', 0):,.0f}")
                r2.metric("Annual Projection", f"${cf_res.get('annual_projection', 0):,.0f}")

    # ── Monte Carlo ──────────────────────────────────────────────────────────
    with f2:
        st.subheader("Retirement Monte Carlo Simulation")
        mc1, mc2 = st.columns(2)
        with mc1:
            mc_cur_age = st.number_input("Current Age", 18, 70, 30, key="mc_age")
            mc_ret_age = st.number_input("Retirement Age", 40, 80, 65, key="mc_ret")
            mc_savings = st.number_input("Current Savings ($)", value=332_430, step=1000, key="mc_sav")
        with mc2:
            mc_contrib = st.number_input("Monthly Contribution ($)", value=2000, step=100, key="mc_c")
            mc_return = st.slider("Expected Annual Return (%)", 3.0, 12.0, 7.0, 0.5, key="mc_r") / 100
            mc_target = st.number_input("Target Nest Egg ($)", value=2_000_000, step=50_000, key="mc_t")
        mc_sims = st.select_slider("Simulations", [100, 500, 1000, 2000], value=1000, key="mc_s")

        if st.button("🎲 Run Monte Carlo", type="primary", key="btn_mc"):
            with st.spinner(f"Running {mc_sims:,} scenarios…"):
                mc_res = json.loads(run_monte_carlo_retirement(json.dumps({
                    "current_age": mc_cur_age, "retirement_age": mc_ret_age,
                    "current_savings": mc_savings, "monthly_contribution": mc_contrib,
                    "annual_return_mean": mc_return, "annual_return_std": 0.15,
                    "target_nest_egg": mc_target, "simulations": mc_sims,
                })))

            if "error" in mc_res:
                st.error(mc_res["error"])
            else:
                prob = mc_res["probability_of_success"]
                r1, r2, r3, r4 = st.columns(4)
                r1.metric("Success Prob.", f"{prob:.1f}%",
                          delta="✓ Strong" if prob >= 80 else "Needs attention")
                r2.metric("Median Outcome", f"${mc_res['median_outcome']:,.0f}")
                r3.metric("Best Case (P90)", f"${mc_res['p90_outcome']:,.0f}")
                r4.metric("Worst Case (P10)", f"${mc_res['p10_outcome']:,.0f}")

                # Distribution visualisation
                rng = np.random.default_rng(42)
                sim_vals = rng.lognormal(
                    np.log(max(mc_res["median_outcome"], 1)), 0.55, mc_sims
                )
                fig_mc = go.Figure(go.Histogram(
                    x=sim_vals / 1_000_000, nbinsx=50,
                    name="Outcomes", marker_color="#00c9ff", opacity=0.7,
                ))
                fig_mc.add_vline(
                    x=mc_target / 1_000_000, line_dash="dash", line_color="#ff6b6b",
                    annotation_text=f"Target ${mc_target/1e6:.1f}M",
                    annotation_font_color="white",
                )
                fig_mc.update_layout(
                    title="Retirement Portfolio Distribution at Retirement",
                    xaxis_title="Portfolio Value at Retirement ($M)",
                    yaxis_title="Scenarios",
                    height=340, paper_bgcolor="rgba(0,0,0,0)",
                    plot_bgcolor="rgba(0,0,0,0)", font_color="white",
                )
                st.plotly_chart(fig_mc, use_container_width=True)

                if prob < 75:
                    adj = mc_contrib * (0.9 / max(prob / 100, 0.01))
                    st.warning(
                        f"To reach 90% success, consider increasing monthly "
                        f"contributions to ~${adj:,.0f}."
                    )

    # ── Scenario Simulator ───────────────────────────────────────────────────
    with f3:
        st.subheader("Financial Scenario Simulator")
        SCENARIO_LABELS = {
            "job_loss":      "🚨 Job Loss",
            "pay_cut_20pct": "📉 20% Pay Cut",
            "raise_15pct":   "📈 15% Raise",
            "large_expense": "💸 Large Unexpected Expense ($2k/mo)",
            "recession":     "🌩️ Economic Recession (−30% income)",
        }
        sc_scenario = st.selectbox(
            "Scenario", list(SCENARIO_LABELS.keys()),
            format_func=lambda k: SCENARIO_LABELS[k], key="sc_sel",
        )
        s1, s2 = st.columns(2)
        with s1:
            sc_inc = st.number_input("Monthly Income", value=7500, step=100, key="sc_i")
            sc_exp = st.number_input("Monthly Expenses", value=4200, step=100, key="sc_e")
        with s2:
            sc_sav = st.number_input("Current Savings ($)", value=22750, step=500, key="sc_s")
            sc_dur = st.slider("Duration (months)", 1, 24, 6, key="sc_d")

        if st.button("⚡ Simulate", type="primary", key="btn_sc"):
            sc_res = json.loads(simulate_scenario(json.dumps({
                "scenario": sc_scenario, "duration_months": sc_dur,
                "current_monthly_income": sc_inc,
                "current_monthly_expenses": sc_exp,
                "current_savings": sc_sav,
            })))
            st.markdown(f"**{sc_res.get('description', sc_scenario)}**")
            c1, c2, c3 = st.columns(3)
            c1.metric("Start Balance", f"${sc_res.get('starting_savings', 0):,.0f}")
            delta_bal = sc_res.get("ending_savings", 0) - sc_res.get("starting_savings", 0)
            c2.metric("End Balance", f"${sc_res.get('ending_savings', 0):,.0f}",
                      delta=f"${delta_bal:,.0f}")
            runway = sc_res.get("runway_months")
            c3.metric("Runway", f"{runway:.1f} mo" if runway else "N/A")

            timeline = sc_res.get("timeline", [])
            if timeline:
                df_sc = pd.DataFrame(timeline)
                pos = sc_scenario == "raise_15pct"
                color = "#92fe9d" if pos else "#ff6b6b"
                fill_color = "rgba(146,254,157,0.08)" if pos else "rgba(255,107,107,0.08)"
                fig_sc = go.Figure(go.Scatter(
                    x=df_sc["month"], y=df_sc["balance"],
                    mode="lines+markers", line=dict(color=color, width=2),
                    fill="tozeroy", fillcolor=fill_color,
                ))
                fig_sc.add_hline(y=0, line_dash="dash", line_color="white", opacity=0.4)
                fig_sc.update_layout(
                    title=f"Balance Over {sc_dur} Months", height=290,
                    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                    font_color="white",
                )
                st.plotly_chart(fig_sc, use_container_width=True)


# ═════════════════════════════════════════════════════════════════════════════
# TAB: SCHEDULE
# ═════════════════════════════════════════════════════════════════════════════

with tab_schedule:
    st.subheader("Financial Calendar & Bill Reminders")

    sc_left, sc_right = st.columns([2, 1])

    with sc_left:
        st.subheader("Upcoming Events")
        days_ahead = st.slider("Show events in next N days", 7, 90, 30, key="sched_days")
        events = _upcoming_events(days_ahead)
        if events:
            for ev in events:
                type_emoji = {"bill_due": "💳", "review": "📊",
                              "reminder": "🔔", "goal_deadline": "🎯"}.get(
                    ev.get("event_type", ""), "📅"
                )
                amt = f" — **${ev.get('amount', 0):,.0f}**" if ev.get("amount") else ""
                rec = " 🔄" if ev.get("is_recurring") else ""
                with st.expander(f"{type_emoji} {ev['event_date']} — {ev['title']}{amt}{rec}"):
                    st.write(ev.get("description") or "No description.")
                    if ev.get("is_synced_to_google"):
                        st.success("✓ Synced to Google Calendar")
        else:
            st.info("No upcoming events. Add bill reminders on the right.")
        st.divider()
        st.caption("Or ask the Chat: *'Schedule my rent of $1800 due on the 1st every month'*")

    with sc_right:
        st.subheader("Add Bill Reminder")
        with st.form("bill_form"):
            b_name = st.text_input("Bill Name", placeholder="Rent, Netflix…")
            b_amt = st.number_input("Amount ($)", min_value=0.0, step=1.0, key="b_amt")
            b_day = st.number_input("Due Day of Month", 1, 28, 1, key="b_day")
            b_rec = st.checkbox("Recurring Monthly", value=True)
            if st.form_submit_button("Add Reminder 🔔", type="primary"):
                res = json.loads(add_bill_reminder(json.dumps({
                    "bill_name": b_name, "amount": b_amt,
                    "due_day": b_day, "is_recurring": b_rec,
                })))
                if res.get("status") == "created":
                    st.success(f"Reminder added for **{b_name}**!")
                    st.rerun()
                else:
                    st.error(res.get("error", "Unknown error"))

        st.divider()
        st.subheader("Quick Event")
        with st.form("event_form"):
            ev_title = st.text_input("Title", key="ev_t")
            ev_date = st.date_input("Date", key="ev_d")
            ev_type = st.selectbox("Type", ["reminder", "review", "goal_deadline", "bill_due"], key="ev_type")
            ev_desc = st.text_area("Notes", height=70, key="ev_desc")
            if st.form_submit_button("Create Event 📅", type="primary"):
                res = json.loads(create_calendar_event(json.dumps({
                    "title": ev_title,
                    "date": ev_date.strftime("%Y-%m-%d"),
                    "event_type": ev_type,
                    "description": ev_desc,
                })))
                if res.get("status") == "created":
                    st.success("Event created!")
                    st.rerun()
                else:
                    st.error(res.get("error", "Unknown error"))


# ═════════════════════════════════════════════════════════════════════════════
# TAB: NOTES
# ═════════════════════════════════════════════════════════════════════════════

with tab_notes:
    st.subheader("Financial Notes & Journal")

    n_left, n_right = st.columns([2, 1])

    with n_left:
        search_q = st.text_input("🔍 Search notes", placeholder="savings, goal, investment…")
        if search_q:
            res = json.loads(search_notes(search_q))
            notes_show = res.get("notes", [])
            st.caption(f"Found {res.get('count', 0)} note(s)")
        else:
            notes_show = fetch_rows("notes", {"user_id": USER_ID}, limit=20)

        if notes_show:
            for note in notes_show:
                with st.expander(f"📝 {note['title']} — {(note.get('created_at') or '')[:10]}"):
                    st.markdown(note.get("content") or "")
                    tags = note.get("tags", "")
                    if tags:
                        for tag in tags.split(","):
                            st.markdown(f"`{tag.strip()}`")
                    if note.get("linked_goal"):
                        st.caption(f"Linked goal: `{note['linked_goal']}`")
        else:
            st.info("No notes yet. Start journaling below or ask the Chat.")

    with n_right:
        st.subheader("New Note")
        with st.form("note_form"):
            n_title = st.text_input("Title", placeholder="Budget review — March 2026")
            n_content = st.text_area("Content", height=140,
                                     placeholder="Write thoughts, decisions, or reflections…")
            n_tags = st.text_input("Tags (comma-separated)", placeholder="savings, goal, review")
            goals_list = fetch_rows("goals", {"user_id": USER_ID})
            goal_opts = ["None"] + [g["name"] for g in goals_list]
            linked_goal_name = st.selectbox("Link to Goal", goal_opts)
            linked_goal_id = next(
                (g["id"] for g in goals_list if g["name"] == linked_goal_name), ""
            )
            if st.form_submit_button("Save Note 💾", type="primary"):
                res = json.loads(save_note(json.dumps({
                    "title": n_title, "content": n_content,
                    "tags": n_tags, "linked_goal": linked_goal_id,
                })))
                if res.get("status") == "saved":
                    st.success(f"Saved! ID: `{res.get('note_id', '')}`")
                    st.rerun()
                else:
                    st.error(res.get("error", "Unknown error"))

        st.divider()
        if st.button("📋 Summarise Recent Notes (AI)", use_container_width=True):
            with st.spinner("Summarising…"):
                sum_res = json.loads(summarize_notes(json.dumps({"days": 30})))
                summaries = sum_res.get("summaries", [])
                if summaries:
                    st.write(f"**{sum_res.get('total_notes', 0)} notes — last 30 days:**")
                    for s in summaries:
                        st.markdown(f"- **{s['title']}** ({s['date']}): {s['preview']}")
                else:
                    st.info("No notes in the last 30 days.")


# ═════════════════════════════════════════════════════════════════════════════
# TAB: REPORTS
# ═════════════════════════════════════════════════════════════════════════════

with tab_reports:
    st.subheader("Reports & Exports")

    if not st.session_state.data_loaded:
        st.warning("Load data from the sidebar first.")
    else:
        r_left, r_right = st.columns(2)

        with r_left:
            st.subheader("CSV Export")
            rtype = st.selectbox("Report Type", ["transactions", "spending", "net_worth"],
                                 key="rtype")
            d1, d2 = st.columns(2)
            start_d = d1.date_input("Start", value=datetime.now() - timedelta(days=90), key="rstart")
            end_d = d2.date_input("End", value=datetime.now(), key="rend")

            if st.button("📊 Generate CSV", type="primary", key="btn_csv"):
                res = json.loads(generate_csv_report(json.dumps({
                    "report_type": rtype,
                    "start_date": start_d.strftime("%Y-%m-%d"),
                    "end_date": end_d.strftime("%Y-%m-%d"),
                })))
                if res.get("status") == "generated":
                    fpath = res.get("file", "")
                    st.success(f"Generated: `{fpath}` ({res.get('rows', 0)} rows)")
                    if os.path.exists(fpath):
                        with open(fpath, "rb") as fh:
                            st.download_button(
                                "⬇️ Download CSV", data=fh.read(),
                                file_name=os.path.basename(fpath),
                                mime="text/csv", type="primary",
                            )
                else:
                    st.error(res.get("error", "Generation failed"))

        with r_right:
            st.subheader("Debt Payoff Calculator")
            st.caption("Avalanche vs Snowball — which saves more?")

            debts_json = st.text_area("Debts (JSON list)", height=120, value=json.dumps([
                {"name": "Credit Card", "balance": 2340.50, "interest_rate": 0.22, "min_payment": 70},
                {"name": "Student Loan", "balance": 15000, "interest_rate": 0.065, "min_payment": 180},
            ], indent=2), key="debts_json")
            extra_pmt = st.number_input("Extra Monthly Payment ($)", value=200, step=50, key="extra_pmt")

            if st.button("Calculate Payoff Plan 💳", type="primary", key="btn_debt"):
                try:
                    debts = json.loads(debts_json)
                    res = json.loads(get_debt_payoff_plan(json.dumps({
                        "debts": debts, "extra_monthly_payment": extra_pmt,
                    })))
                    st.metric("Total Debt", f"${res.get('total_debt', 0):,.2f}")
                    av = res.get("avalanche_method", {})
                    sw = res.get("snowball_method", {})
                    dc1, dc2 = st.columns(2)
                    with dc1:
                        st.markdown("**🏔 Avalanche** (highest APR first)")
                        st.write(f"Months: **{av.get('months_to_payoff', 0)}**")
                        st.write(f"Interest: **${av.get('total_interest_paid', 0):,.0f}**")
                    with dc2:
                        st.markdown("**❄️ Snowball** (smallest balance first)")
                        st.write(f"Months: **{sw.get('months_to_payoff', 0)}**")
                        st.write(f"Interest: **${sw.get('total_interest_paid', 0):,.0f}**")
                    savings = res.get("interest_savings_with_avalanche", 0)
                    if savings > 0:
                        st.success(f"Avalanche saves you **${savings:,.0f}** in interest over Snowball.")
                except json.JSONDecodeError:
                    st.error("Invalid JSON in debts field.")

        # AI full report
        st.divider()
        st.subheader("AI-Generated Financial Summary")
        if st.button(
            "🤖 Generate Full Financial Report (AI)",
            type="secondary", use_container_width=True, key="btn_ai_report",
        ):
            with st.spinner("Generating comprehensive report… (30–90 s depending on LLM speed)"):
                ai_report = run_agent_query(
                    "Generate a comprehensive financial health report covering: "
                    "1) Net worth summary with breakdown, "
                    "2) Monthly spending analysis with top categories, "
                    "3) Investment portfolio performance, "
                    "4) Goal progress for all active goals, "
                    "5) Top 3 priority recommendations with estimated financial impact. "
                    "Format clearly with section headers."
                )
            st.markdown(ai_report)
