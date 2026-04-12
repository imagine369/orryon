"""
ui/breathe.py — Calm-inspired guided breathing widget for orryon.

Box breathing pattern (4-4-4-4):
  Inhale 4 s → Hold 4 s → Exhale 4 s → Hold 4 s  × 3 cycles (48 s total)

Pure CSS / JS — zero database calls, zero Streamlit reruns during animation.
"""
from __future__ import annotations

import streamlit as st


# ── CSS template ──────────────────────────────────────────────────────────────
# __WID__ is replaced with a unique id so keyframe names don't collide when the
# widget is rendered more than once in the same Streamlit page.

_CSS_TMPL = """<style>
@keyframes bo-orb-__WID__ {
  0%,100% {
    transform: scale(1.00);
    box-shadow: 0 0 28px rgba(56,189,248,.45), 0 0 10px rgba(56,189,248,.18);
  }
  25%,50% {
    transform: scale(1.60);
    box-shadow: 0 0 70px rgba(56,189,248,.88), 0 0 150px rgba(56,189,248,.20);
  }
}
@keyframes bo-r1-__WID__ {
  0%,100% { transform: scale(1.00); opacity: .22; }
  25%,50%  { transform: scale(1.56); opacity: .55; }
}
@keyframes bo-r2-__WID__ {
  0%,100% { transform: scale(1.00); opacity: .08; }
  25%,50%  { transform: scale(1.90); opacity: .20; }
}
@keyframes bo-bg-__WID__ {
  0%,100% { opacity: .10; transform: translate(-50%,-50%) scale(1.0); }
  25%,50%  { opacity: .28; transform: translate(-50%,-50%) scale(1.4); }
}
@media (prefers-reduced-motion: reduce) {
  .bo-anim-__WID__ { animation: none !important; }
}
</style>"""


# ── HTML template ─────────────────────────────────────────────────────────────
# Placeholders replaced at render time:
#   __WID__     → short unique widget id
#   __LABEL__   → subtitle line shown above the orb

_HTML_TMPL = """
<div style="
  background: linear-gradient(160deg, #040916 0%, #071222 58%, #050d1c 100%);
  border-radius: 20px;
  padding: 2.6rem 1.5rem 2.2rem;
  text-align: center;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(56,189,248,.10);
  margin: 0 0 1.1rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
">

  <!-- Ambient background pulse -->
  <div class="bo-anim-__WID__" style="
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%);
    width: 360px; height: 360px; border-radius: 50%;
    background: radial-gradient(circle, rgba(56,189,248,.26) 0%, transparent 68%);
    pointer-events: none;
    animation: bo-bg-__WID__ 16s ease-in-out 3 forwards;
  "></div>

  <!-- Tag line -->
  <div style="
    font-size: .65rem; letter-spacing: 2.8px; text-transform: uppercase;
    color: rgba(255,255,255,.20); margin-bottom: .5rem;
  ">Box Breathing · 4 – 4 – 4 – 4</div>

  <div style="
    font-size: .80rem; color: rgba(255,255,255,.36);
    margin-bottom: 2.6rem; line-height: 1.55;
    max-width: 240px; margin-left: auto; margin-right: auto;
  ">__LABEL__</div>

  <!-- Animation frame -->
  <div style="
    position: relative; display: inline-flex;
    align-items: center; justify-content: center;
    width: 220px; height: 220px;
  ">

    <!-- Outer ring -->
    <div class="bo-anim-__WID__" style="
      position: absolute; width: 220px; height: 220px; border-radius: 50%;
      border: 1px solid rgba(56,189,248,.28);
      animation: bo-r2-__WID__ 16s ease-in-out 3 forwards;
    "></div>

    <!-- Middle ring -->
    <div class="bo-anim-__WID__" style="
      position: absolute; width: 164px; height: 164px; border-radius: 50%;
      border: 1.5px solid rgba(56,189,248,.46);
      animation: bo-r1-__WID__ 16s ease-in-out 3 forwards;
    "></div>

    <!-- Main orb -->
    <div id="bo-orb-__WID__" class="bo-anim-__WID__" style="
      width: 102px; height: 102px; border-radius: 50%;
      background: radial-gradient(circle at 36% 32%,
        #bae6fd 0%, #38bdf8 40%, #0284c7 76%, #0c4a6e 100%);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 3px;
      position: relative; z-index: 2;
      animation: bo-orb-__WID__ 16s ease-in-out 3 forwards;
    ">
      <span id="bo-action-__WID__" style="
        font-size: .68rem; font-weight: 700; letter-spacing: 1.6px;
        text-transform: uppercase; color: rgba(255,255,255,.90);
        transition: color .5s ease;
      ">Inhale</span>
      <span id="bo-count-__WID__" style="
        font-size: 1.65rem; font-weight: 800; color: #fff; line-height: 1;
      ">4</span>
    </div>
  </div>

  <!-- Cycle counter -->
  <div style="margin-top: 2.2rem;">
    <span id="bo-cycle-__WID__" style="font-size: .72rem; color: rgba(255,255,255,.22);">
      Cycle 1 of 3
    </span>
  </div>

  <!-- Done state (hidden until all cycles complete) -->
  <div id="bo-done-__WID__" style="display: none; margin-top: 2rem; padding: 0 .5rem;">
    <div style="font-size: 1.05rem; color: #86efac; font-weight: 700; margin-bottom: .4rem;">
      ✓ Well done
    </div>
    <div style="font-size: .80rem; color: rgba(255,255,255,.30); line-height: 1.55;">
      3 cycles complete. Take a quiet moment before you continue.
    </div>
    <button
      onclick="boRestart__WID__()"
      style="
        margin-top: 1.3rem;
        background: rgba(56,189,248,.10);
        border: 1px solid rgba(56,189,248,.28);
        color: #7dd3fc; border-radius: 50px;
        padding: .40rem 1.3rem;
        font-size: .78rem; font-weight: 600;
        cursor: pointer; letter-spacing: .4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        transition: background .15s;
      "
      onmouseover="this.style.background='rgba(56,189,248,.20)'"
      onmouseout="this.style.background='rgba(56,189,248,.10)'"
    >Start again</button>
  </div>

<script>
(function() {
  var WID         = '__WID__';
  var PHASES      = [
    { name: 'Inhale', color: '#7dd3fc' },
    { name: 'Hold',   color: '#c4b5fd' },
    { name: 'Exhale', color: '#86efac' },
    { name: 'Hold',   color: '#94a3b8' }
  ];
  var PHASE_TICKS  = 4;
  var TOTAL_CYCLES = 3;
  var tick         = 0;
  var isDone       = false;
  var iid          = null;

  var elAction = document.getElementById('bo-action-' + WID);
  var elCount  = document.getElementById('bo-count-'  + WID);
  var elCycle  = document.getElementById('bo-cycle-'  + WID);
  var elDone   = document.getElementById('bo-done-'   + WID);

  if (!elAction) return;

  function update() {
    if (isDone) return;
    var cycleLen = PHASE_TICKS * PHASES.length;   // 16
    var cycle    = Math.floor(tick / cycleLen);

    if (cycle >= TOTAL_CYCLES) {
      isDone = true;
      clearInterval(iid);
      elAction.style.display = 'none';
      elCount.style.display  = 'none';
      elCycle.style.display  = 'none';
      elDone.style.display   = 'block';
      return;
    }

    var tickInCycle = tick % cycleLen;
    var phaseIdx    = Math.floor(tickInCycle / PHASE_TICKS);
    var countDown   = PHASE_TICKS - (tickInCycle % PHASE_TICKS);
    var phase       = PHASES[phaseIdx];

    elAction.textContent = phase.name;
    elAction.style.color = phase.color;
    elCount.textContent  = countDown;
    elCycle.textContent  = 'Cycle ' + (cycle + 1) + ' of ' + TOTAL_CYCLES;

    tick++;
  }

  function resetAnims() {
    document.querySelectorAll('.bo-anim-' + WID).forEach(function(el) {
      el.style.animation = 'none';
      void el.offsetWidth;   // force reflow so animation restarts
      el.style.animation = '';
    });
  }

  window['boRestart' + WID] = function() {
    isDone = false;
    tick   = 0;
    elAction.style.display = '';
    elCount.style.display  = '';
    elCycle.style.display  = '';
    elDone.style.display   = 'none';
    resetAnims();
    clearInterval(iid);
    update();
    iid = setInterval(update, 1000);
  };

  update();
  iid = setInterval(update, 1000);
})();
</script>
</div>
"""


def render_breathe_widget(widget_id: str = "main", label: str = "") -> None:
    """Render the Calm-style breathing animation widget.

    Args:
        widget_id: Short unique string used to namespace CSS animations and
                   element IDs.  Use different values if the widget appears
                   more than once on the same page.
        label:     Optional subtitle shown above the orb.  Falls back to the
                   default "Follow the circle…" copy when empty.
    """
    if not label:
        label = "Follow the circle — breathe in as it grows, out as it shrinks."

    css  = _CSS_TMPL.replace("__WID__", widget_id)
    html = (
        _HTML_TMPL
        .replace("__WID__",   widget_id)
        .replace("__LABEL__", label)
    )
    st.markdown(css + html, unsafe_allow_html=True)
