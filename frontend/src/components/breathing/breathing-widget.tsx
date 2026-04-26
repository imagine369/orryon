"use client";

/**
 * Breathing — fully local, fully free, fully self-contained.
 *
 * STRICT separation rule:
 *   This file MUST NOT import anything from `@/lib/subscription-service`,
 *   `@/lib/use-subscription`, or any module under `@/components/subscription`.
 *   If you need to add an upgrade nudge, do it through the `doneFooterSlot`
 *   prop on `<BreathingWidget>` — the *caller* supplies the subscription-aware
 *   UI. Breathing must keep working if the entire subscription folder is
 *   deleted.
 *
 * Belief: tools that support breathing, meditation, and human wellbeing
 * should be free for everyone. The philosophy footer below is part of the
 * product, not an upsell mechanism.
 */

import { useState, useEffect, useCallback, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PillButton } from "@/components/pill-cta";

// ── Shared constants ──────────────────────────────────────────────────────────

const BG        = "linear-gradient(180deg, #0d2535 0%, #112e40 45%, #0c2233 100%)";
const ORB_BG    = "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)";
const FONT      = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ── Tibetan bowl synthesizer ──────────────────────────────────────────────────

function playBowl() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const root = 196; // G3 — warm, grounding fundamental

    // Authentic inharmonic partials of a metal singing bowl
    const partials: { ratio: number; amp: number; decay: number }[] = [
      { ratio: 1,    amp: 0.32, decay: 14 },
      { ratio: 2.76, amp: 0.18, decay: 10 },
      { ratio: 5.40, amp: 0.09, decay: 7  },
      { ratio: 8.93, amp: 0.04, decay: 4  },
    ];

    // Brief metallic strike transient — bandpass-filtered noise
    const strikeBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
    const strikeData = strikeBuf.getChannelData(0);
    for (let i = 0; i < strikeData.length; i++) strikeData[i] = Math.random() * 2 - 1;
    const strikeNode = ctx.createBufferSource();
    strikeNode.buffer = strikeBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = root * 2.5;
    bp.Q.value = 1.8;
    const strikeGain = ctx.createGain();
    strikeGain.gain.setValueAtTime(0.18, now);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    strikeNode.connect(bp);
    bp.connect(strikeGain);
    strikeGain.connect(ctx.destination);
    strikeNode.start(now);
    strikeNode.stop(now + 0.1);

    // Slow vibrato LFO — 0.4 Hz, ±1.5 Hz depth
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.4;
    lfoGain.gain.value = 1.5;
    lfo.connect(lfoGain);
    lfo.start(now);
    lfo.stop(now + 15);

    // Tone partials
    partials.forEach(({ ratio, amp, decay }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = root * ratio;
      if (ratio === 1) lfoGain.connect(osc.frequency); // vibrato only on fundamental
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.012); // crisp attack
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.start(now);
      osc.stop(now + decay);
    });

    setTimeout(() => ctx.close(), 15500);
  } catch (_) { /* audio unavailable — fail silently */ }
}


const ghostBtn: CSSProperties = {
  background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)",
  color: "rgba(255,255,255,.70)", borderRadius: "8px", padding: "0.42rem 1.1rem",
  fontSize: "0.82rem", fontWeight: 500, cursor: "pointer", fontFamily: FONT,
};

// ── Shared layout shells ──────────────────────────────────────────────────────

function Session({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none min-h-0 overflow-y-auto"
      style={{
        background: BG,
        fontFamily: FONT,
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {children}
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute left-5 flex items-center gap-1 text-white/60 hover:text-white/90 transition-colors"
      style={{ top: "max(1.1rem, env(safe-area-inset-top, 1.1rem))", fontFamily: FONT }}
    >
      <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
      <span className="text-[0.82rem]">Back</span>
    </button>
  );
}

/**
 * DoneFooter
 *
 * Shown after a session completes. Breathing-owned content lives here
 * directly; anything that depends on the rest of the app (e.g. a paid
 * feature upsell) is rendered via the `extra` slot which the caller
 * provides at the top level. Breathing knows nothing about that slot's
 * contents — it just renders whatever React node is passed in.
 *
 * The "Thank you for taking care of your wellbeing. Breathing will
 * always be free." line is intentionally kept inside breathing because
 * it's a philosophical statement, not a subscription concern.
 */
function DoneFooter({
  label,
  onRestart,
  onBack,
  extra,
}: {
  label: string;
  onRestart: () => void;
  onBack: () => void;
  extra?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center mt-10 px-8 text-center"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))" }}
    >
      <p style={{ color: "rgba(255,255,255,.38)", fontSize: "1.1rem", fontWeight: 500, marginBottom: "0.35rem" }}>
        Well done
      </p>
      <p style={{ color: "rgba(255,255,255,.24)", fontSize: "0.82rem", lineHeight: 1.55, marginBottom: "1.5rem" }}>
        {label}
      </p>
      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={onRestart} style={ghostBtn}>Start again</button>
        <button onClick={onBack}    style={{ ...ghostBtn, background: "rgba(255,255,255,.06)" }}>Change</button>
      </div>

      {/* Wellbeing thank-you — pure breathing copy, no subscription
          knowledge. Stays even if the subscription module is removed. */}
      <div
        className="mt-9 max-w-[320px] flex flex-col items-center text-center"
        style={{ fontFamily: FONT }}
      >
        <p
          style={{
            color: "rgba(255,255,255,.50)",
            fontSize: "0.86rem",
            lineHeight: 1.6,
            marginBottom: "0.5rem",
          }}
        >
          Thank you for taking care of your wellbeing.
        </p>
        <p
          style={{
            color: "rgba(255,255,255,.32)",
            fontSize: "0.74rem",
            lineHeight: 1.6,
          }}
        >
          Breathing will always be free.
        </p>

        {/* External slot — caller decides what (if anything) to render
            below the wellbeing message. Breathing never inspects it. */}
        {extra ? <div className="mt-4 w-full">{extra}</div> : null}
      </div>
    </div>
  );
}

function remStr(secs: number) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} remaining`;
}

// ── Box Breathing session ─────────────────────────────────────────────────────

const BOX_PHASES = [
  { name: "inhale" },
  { name: "hold"   },
  { name: "exhale" },
  { name: "hold"   },
] as const;

const BOX_PHASE_TICKS = 4;
const BOX_CYCLE_LEN   = BOX_PHASE_TICKS * BOX_PHASES.length; // 16 s

function BoxSession({ totalSecs, onBack, doneFooterSlot }: { totalSecs: number; onBack: () => void; doneFooterSlot?: ReactNode }) {
  const [tick,    setTick]    = useState(0);
  const [done,    setDone]    = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 120); return () => clearTimeout(t); }, []);
  useEffect(() => { if (done) return; const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, [done]);
  useEffect(() => { if (!done && tick >= totalSecs) setDone(true); }, [tick, done, totalSecs]);

  const restart = useCallback(() => {
    setTick(0); setDone(false); setMounted(false);
    setTimeout(() => setMounted(true), 120);
  }, []);

  const phaseIdx  = Math.floor((tick % BOX_CYCLE_LEN) / BOX_PHASE_TICKS);
  const phase     = BOX_PHASES[phaseIdx];
  const remaining = Math.max(0, totalSecs - tick);
  const expanded  = mounted && !done && (phaseIdx === 0 || phaseIdx === 1);

  return (
    <Session>
      <BackBtn onClick={onBack} />

      {/* Ambient glow */}
      <div style={{
        position: "absolute", width: "88vw", height: "88vw",
        maxWidth: 400, maxHeight: 400, borderRadius: "50%",
        background: "radial-gradient(circle, hsla(200,42%,60%,.14) 0%, transparent 70%)", pointerEvents: "none",
        transform: `scale(${expanded ? 1.14 : 1.0})`,
        opacity: expanded ? 1 : 0.6,
        transition: "transform 4s ease-in-out, opacity 4s ease-in-out",
      }} />

      <p style={{ fontSize: "0.60rem", textTransform: "uppercase", letterSpacing: "2.5px", color: "rgba(255,255,255,.20)", marginBottom: "0.4rem" }}>
        Box Breathing · 4 – 4 – 4 – 4
      </p>
      <p style={{ fontSize: "0.76rem", color: "rgba(255,255,255,.24)", marginBottom: "1.8rem", maxWidth: 200, textAlign: "center", lineHeight: 1.55 }}>
        Follow the circle — breathe with it.
      </p>

      {/* Gradient ring + frosted orb */}
      <div style={{ position: "relative", width: "76vw", height: "76vw", maxWidth: 340, maxHeight: 340, transform: `scale(${expanded ? 1.20 : 1.0})`, transition: "transform 4s ease-in-out", zIndex: 2 }}>
        <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="box-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="hsl(200,62%,80%)" stopOpacity="0"    />
              <stop offset="25%"  stopColor="hsl(200,58%,75%)" stopOpacity="0.90" />
              <stop offset="50%"  stopColor="hsl(200,58%,78%)" stopOpacity="1"    />
              <stop offset="75%"  stopColor="hsl(200,58%,75%)" stopOpacity="0.90" />
              <stop offset="100%" stopColor="hsl(200,62%,80%)" stopOpacity="0"    />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="47" fill="none" stroke="url(#box-grad)" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "radial-gradient(circle, hsl(200,42%,58%) 0%, hsl(200,38%,42%) 50%, hsl(202,34%,26%) 100%)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          boxShadow: expanded ? "0 0 55px hsla(200,42%,50%,.35)" : "0 0 30px hsla(200,42%,50%,.16)",
          transition: "box-shadow 4s ease-in-out",
          display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {done ? (
            <span style={{ fontSize: "1.5rem", color: "rgba(255,255,255,.18)", fontWeight: 300 }}>✓</span>
          ) : (
            <>
              <span style={{ fontSize: "clamp(1.4rem,6vw,1.9rem)", fontWeight: 300, color: "rgba(255,255,255,.32)", letterSpacing: "2px" }}>
                {phase.name}
              </span>
              <span style={{ fontSize: "0.70rem", color: "rgba(255,255,255,.18)", letterSpacing: "0.5px" }}>
                {remStr(remaining)}
              </span>
            </>
          )}
        </div>
      </div>

      {done && <DoneFooter label="Session complete. Take a quiet moment." onRestart={restart} onBack={onBack} extra={doneFooterSlot} />}
    </Session>
  );
}

// ── Physiological Sigh session ────────────────────────────────────────────────

const SIGH_PHASES = [
  { name: "inhale", sub: "through your nose",              duration: 4, start: 0  },
  { name: "sniff",  sub: "short quick sniff",                 duration: 1, start: 4  },
  { name: "exhale", sub: "slowly through your mouth",       duration: 8, start: 5  },
  { name: "rest",   sub: "",                                duration: 1, start: 13 },
] as const;

const SIGH_CYCLE  = 14;   // sum of durations
const SIGH_COUNT  = 5;
const SIGH_TOTAL  = SIGH_CYCLE * SIGH_COUNT; // 70 s

function SighSession({ onBack, doneFooterSlot }: { onBack: () => void; doneFooterSlot?: ReactNode }) {
  const [tick,    setTick]    = useState(0);
  const [done,    setDone]    = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 120); return () => clearTimeout(t); }, []);
  useEffect(() => { if (done) return; const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, [done]);
  useEffect(() => { if (!done && tick >= SIGH_TOTAL) setDone(true); }, [tick, done]);

  const restart = useCallback(() => {
    setTick(0); setDone(false); setMounted(false);
    setTimeout(() => setMounted(true), 120);
  }, []);

  const tickInCycle = tick % SIGH_CYCLE;
  const phaseIdx    = SIGH_PHASES.findIndex(p => tickInCycle >= p.start && tickInCycle < p.start + p.duration);
  const safeIdx     = phaseIdx === -1 ? SIGH_PHASES.length - 1 : phaseIdx;
  const phase       = SIGH_PHASES[safeIdx];
  const sigNum      = Math.min(Math.floor(tick / SIGH_CYCLE) + 1, SIGH_COUNT);
  const remaining   = Math.max(0, SIGH_TOTAL - tick);

  const isInhale   = safeIdx === 0;
  const isSniff    = safeIdx === 1;
  const isExpanded = mounted && !done && (isInhale || isSniff);

  // Circle scales up on inhale, double-sniff pulses on sniff, contracts on exhale.
  const circleScale = isExpanded ? 1.20 : 1.0;
  const circleTr    = isSniff ? "none"
    : isInhale ? "transform 4s ease-in-out"
    : "transform 8s ease-in-out";
  const circleAnim  = isSniff ? "double-sniff 0.9s ease-out forwards" : "none";

  return (
    <Session>
      <BackBtn onClick={onBack} />

      <style>{`
        @keyframes double-sniff {
          0%   { transform: scale(1.20); }
          22%  { transform: scale(1.34); }
          40%  { transform: scale(1.22); }
          65%  { transform: scale(1.34); }
          100% { transform: scale(1.34); }
        }
      `}</style>

      {/* Ambient glow */}
      <div style={{
        position: "absolute", width: "88vw", height: "88vw",
        maxWidth: 400, maxHeight: 400, borderRadius: "50%",
        background: "radial-gradient(circle, hsla(200,42%,60%,.14) 0%, transparent 70%)", pointerEvents: "none",
        transform: `scale(${isExpanded ? 1.14 : 1.0})`,
        opacity: isExpanded ? 1 : 0.6,
        transition: circleTr,
      }} />

      <p style={{ fontSize: "0.60rem", textTransform: "uppercase", letterSpacing: "2.5px", color: "rgba(255,255,255,.20)", marginBottom: "0.4rem" }}>
        Double Inhale Quick Destress
      </p>
      <p style={{ fontSize: "0.76rem", color: "rgba(255,255,255,.24)", marginBottom: "1.8rem", maxWidth: 220, textAlign: "center", lineHeight: 1.55 }}>
        Inhale fully. Then force a sharp, powerful sniff to pack extra air into already-full lungs. Then a long, slow exhale.
      </p>

      {/* Circle */}
      <div style={{
        position: "relative", width: "76vw", height: "76vw", maxWidth: 340, maxHeight: 340,
        transform: `scale(${circleScale})`,
        transition: circleTr,
        animation: circleAnim,
        zIndex: 2,
      }}>
        <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="sigh-ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="hsl(200,62%,80%)" stopOpacity="0"    />
              <stop offset="25%"  stopColor="hsl(200,58%,75%)" stopOpacity="0.90" />
              <stop offset="50%"  stopColor="hsl(200,58%,78%)" stopOpacity="1"    />
              <stop offset="75%"  stopColor="hsl(200,58%,75%)" stopOpacity="0.90" />
              <stop offset="100%" stopColor="hsl(200,62%,80%)" stopOpacity="0"    />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="47" fill="none" stroke="url(#sigh-ring-grad)" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "radial-gradient(circle, hsl(200,42%,58%) 0%, hsl(200,38%,42%) 50%, hsl(202,34%,26%) 100%)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          boxShadow: isExpanded ? "0 0 55px hsla(200,42%,50%,.35)" : "0 0 30px hsla(200,42%,50%,.16)",
          transition: `box-shadow ${isInhale ? "4s" : "8s"} ease-in-out`,
          display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          {done
            ? <span style={{ fontSize: "1.5rem", color: "rgba(255,255,255,.18)", fontWeight: 300 }}>✓</span>
            : <>
                <span style={{ fontSize: "clamp(1.4rem,6vw,1.9rem)", fontWeight: 300, color: "rgba(255,255,255,.32)", letterSpacing: "2px" }}>
                  {phase.name}
                </span>
                <span style={{ fontSize: "0.70rem", color: "rgba(255,255,255,.18)", letterSpacing: "0.5px", textAlign: "center", padding: "0 1rem" }}>
                  {phase.sub || remStr(remaining)}
                </span>
              </>
          }
        </div>
      </div>

      {!done && (
        <p style={{ marginTop: "1.6rem", fontSize: "0.70rem", color: "rgba(255,255,255,.18)", letterSpacing: "0.5px" }}>
          Sigh {sigNum} of {SIGH_COUNT} · {remStr(remaining)}
        </p>
      )}

      {done && <DoneFooter label="5 sighs complete. You reset your nervous system." onRestart={restart} onBack={onBack} extra={doneFooterSlot} />}
    </Session>
  );
}

// ── Do Nothing session ────────────────────────────────────────────────────────

function DoNothingSession({ totalSecs, onBack, doneFooterSlot }: { totalSecs: number; onBack: () => void; doneFooterSlot?: ReactNode }) {
  const [tick, setTick]   = useState(0);
  const [done, setDone]   = useState(false);

  // Strike bowl on open
  useEffect(() => {
    const t = setTimeout(playBowl, 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [done]);

  useEffect(() => {
    if (!done && tick >= totalSecs) { setDone(true); playBowl(); }
  }, [tick, done, totalSecs]);

  const restart = useCallback(() => { setTick(0); setDone(false); setTimeout(playBowl, 300); }, []);

  const remaining = Math.max(0, totalSecs - tick);
  const countLabel = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <Session>
      <BackBtn onClick={onBack} />

      {/* Ambient glow — very dim, barely perceptible */}
      <div style={{
        position: "absolute", width: "92vw", height: "92vw",
        maxWidth: 420, maxHeight: 420, borderRadius: "50%",
        background: "radial-gradient(circle, hsla(200,50%,60%,.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Orb — extremely slow pulse */}
      <motion.div
        style={{ position: "relative", width: "76vw", height: "76vw", maxWidth: 340, maxHeight: 340, zIndex: 2 }}
        animate={done ? {} : { scale: [1, 1.055, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg viewBox="0 0 100 100" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="nothing-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="hsl(200,58%,78%)" stopOpacity="0"    />
              <stop offset="40%"  stopColor="hsl(200,55%,72%)" stopOpacity="0.19" />
              <stop offset="60%"  stopColor="hsl(200,55%,74%)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="hsl(200,58%,78%)" stopOpacity="0"    />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="47" fill="none" stroke="url(#nothing-grad)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "radial-gradient(circle, hsl(200,42%,52%) 0%, hsl(200,36%,38%) 50%, hsl(202,32%,24%) 100%)",
          opacity: 0.70,
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {!done ? (
            <span style={{ fontSize: "clamp(2rem,9vw,2.8rem)", fontWeight: 200, color: "rgba(255,255,255,.28)", letterSpacing: "2px", fontVariantNumeric: "tabular-nums" as const }}>
              {countLabel}
            </span>
          ) : (
            <span style={{ fontSize: "1.8rem", color: "rgba(255,255,255,.18)", fontWeight: 200 }}>✓</span>
          )}
        </div>
      </motion.div>

      {done && <DoneFooter label="Rest complete." onRestart={restart} onBack={onBack} extra={doneFooterSlot} />}
    </Session>
  );
}

// ── Selection screen ──────────────────────────────────────────────────────────

function SelectionScreen({ onClose, onSelectBox, onSelectSigh, onSelectNothing }: {
  onClose:        () => void;
  onSelectBox:    (secs: number) => void;
  onSelectSigh:   () => void;
  onSelectNothing:(secs: number) => void;
}) {
  const [boxMins,     setBoxMins]     = useState<1 | 3 | 6>(1);
  const [nothingMins, setNothingMins] = useState<3 | 6 | 9>(3);

  const card: CSSProperties = {
    background: "hsla(200,35%,22%,0.60)", backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)", borderRadius: "20px",
    border: "1px solid hsla(198,40%,55%,0.16)", padding: "1.2rem 1.3rem",
    width: "100%", maxWidth: 440, marginBottom: "0.8rem", fontFamily: FONT,
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col select-none overflow-y-auto" style={{ background: BG, fontFamily: FONT }}>
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute right-5 flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        style={{ top: "max(1.1rem, env(safe-area-inset-top, 1.1rem))" }}
      >
        <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
      </button>

      {/* Content */}
      <div
        className="flex flex-col items-center px-5 w-full"
        style={{ paddingTop: "max(4.5rem, calc(env(safe-area-inset-top, 0px) + 3.5rem))", paddingBottom: "max(2.5rem, calc(2.5rem + env(safe-area-inset-bottom, 0px)))" }}
      >
        <p style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "2.5px", color: "rgba(255,255,255,.40)", marginBottom: "0.5rem" }}>
          Choose your session
        </p>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 600, color: "rgba(255,255,255,.62)", marginBottom: "1.8rem", textAlign: "center" }}>
          How would you like to relax?
        </h2>

        {/* ── Box Breathing card ── */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", marginBottom: "1rem" }}>
            <motion.div
              style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: ORB_BG }}
              animate={{ scale: [1, 1.14, 1], boxShadow: ["0 0 8px hsla(200,40%,60%,.30)", "0 0 20px hsla(200,40%,60%,.55)", "0 0 8px hsla(200,40%,60%,.30)"] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <div>
              <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "rgba(255,255,255,.52)", marginBottom: "0.15rem" }}>Box Breathing</p>
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,.40)" }}>For focus & daily routine</p>
            </div>
          </div>

          {/* Duration picker */}
          <p style={{ fontSize: "0.60rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(255,255,255,.50)", marginBottom: "0.5rem" }}>Duration</p>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.1rem" }}>
            {([1, 3, 6] as const).map(m => (
              <button
                key={m}
                onClick={() => setBoxMins(m)}
                style={{
                  flex: 1, padding: "0.44rem 0", borderRadius: "50px", cursor: "pointer", fontFamily: FONT,
                  border: boxMins === m ? "1.5px solid rgba(255,255,255,0.25)" : "1.5px solid rgba(255,255,255,0.08)",
                  background: boxMins === m ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                  color: boxMins === m ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.28)",
                  fontSize: "0.80rem", fontWeight: boxMins === m ? 600 : 400,
                  transition: "all 0.15s",
                }}
              >
                {m} min
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PillButton onClick={() => onSelectBox(boxMins * 60)} variant="calm" size="sm">Start</PillButton>
          </div>
        </div>

        {/* ── Physiological Sigh card ── */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", marginBottom: "0.85rem" }}>
            {/* Pill icon */}
            <motion.div
              style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: ORB_BG }}
              animate={{
                scale:     [1, 1.16, 1.06, 1.16, 1,    1],
                boxShadow: [
                  "0 0 0 3px rgba(255,255,255,0.22), 0 0 5px rgba(255,255,255,0.07)",
                  "0 0 0 3px rgba(255,255,255,0.60), 0 0 14px rgba(255,255,255,0.24)",
                  "0 0 0 3px rgba(255,255,255,0.30), 0 0 6px rgba(255,255,255,0.10)",
                  "0 0 0 3px rgba(255,255,255,0.60), 0 0 14px rgba(255,255,255,0.24)",
                  "0 0 0 3px rgba(255,255,255,0.22), 0 0 5px rgba(255,255,255,0.07)",
                  "0 0 0 3px rgba(255,255,255,0.22), 0 0 5px rgba(255,255,255,0.07)",
                ],
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                times: [0, 0.08, 0.16, 0.26, 0.38, 1],
                ease: "easeOut",
              }}
            />
            <div>
              <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "rgba(255,255,255,.52)", marginBottom: "0.15rem" }}>Double Inhale Quick Destress</p>
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,.40)" }}>For acute stress & quick reset</p>
            </div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,.50)", lineHeight: 1.6, marginBottom: "0.6rem" }}>
            Take a full inhale through the nose. Then immediately force a second sharp, deep sniff — not a gentle one, but a powerful sniff that packs extra air into already-full lungs. Then release everything in one long, slow exhale through the mouth. This forceful double-load is what activates the body's rapid stress reset.
          </p>
          <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,.40)", marginBottom: "1.1rem" }}>5 sighs · ~70 seconds</p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PillButton onClick={onSelectSigh} variant="calm" size="sm">Start</PillButton>
          </div>
        </div>

        {/* ── Do Nothing card ── */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", marginBottom: "0.85rem" }}>
            <motion.div
              style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: ORB_BG, opacity: 0.72 }}
              animate={{ scale: [1, 1.055, 1], boxShadow: ["0 0 0 1px rgba(255,255,255,0.22)", "0 0 0 1px rgba(255,255,255,0.40), 0 0 12px rgba(255,255,255,0.10)", "0 0 0 1px rgba(255,255,255,0.22)"] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
            <div>
              <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "rgba(255,255,255,.52)", marginBottom: "0.15rem" }}>Do Nothing</p>
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,.40)" }}>For deep rest & nervous system reset</p>
            </div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,.50)", lineHeight: 1.6, marginBottom: "0.6rem" }}>
            No instructions. No technique. Just stillness. A Tibetan bowl marks the start and end.
          </p>
          <p style={{ fontSize: "0.60rem", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(255,255,255,.50)", marginBottom: "0.5rem" }}>Duration</p>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.1rem" }}>
            {([3, 6, 9] as const).map(m => (
              <button
                key={m}
                onClick={() => setNothingMins(m)}
                style={{
                  flex: 1, padding: "0.44rem 0", borderRadius: "50px", cursor: "pointer", fontFamily: FONT,
                  border: nothingMins === m ? "1.5px solid rgba(255,255,255,0.25)" : "1.5px solid rgba(255,255,255,0.08)",
                  background: nothingMins === m ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                  color: nothingMins === m ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.28)",
                  fontSize: "0.80rem", fontWeight: nothingMins === m ? 600 : 400,
                  transition: "all 0.15s",
                }}
              >
                {m} min
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PillButton onClick={() => onSelectNothing(nothingMins * 60)} variant="calm" size="sm">Start</PillButton>
          </div>
        </div>

        {/* Philosophy footer — visible reminder that wellbeing tools are free.
            Kept gentle and unobtrusive: a thin divider above, soft body copy,
            no CTA. The belief should feel like a quiet promise, not a pitch. */}
        <div
          className="w-full flex flex-col items-center text-center"
          style={{ maxWidth: 440, marginTop: "0.6rem" }}
        >
          <div
            aria-hidden
            style={{
              width: "40%",
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
              marginBottom: "1.1rem",
            }}
          />
          <p
            style={{
              fontSize: "0.6rem",
              textTransform: "uppercase",
              letterSpacing: "2.5px",
              color: "rgba(255,255,255,.38)",
              marginBottom: "0.55rem",
            }}
          >
            Free for everyone
          </p>
          <p
            style={{
              fontSize: "0.78rem",
              lineHeight: 1.6,
              color: "rgba(255,255,255,.42)",
              padding: "0 0.5rem",
            }}
          >
            Breathing exercises are free for everyone. We believe tools that
            improve human wellbeing and peace should be available to all.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Entry card (Today tab) ────────────────────────────────────────────────────

type Screen = "idle" | "select" | "box" | "sigh" | "nothing";

/**
 * Props for the public widget. `doneFooterSlot` is the only escape hatch
 * for callers that want to surface app-specific UI at the end of a session
 * (e.g. an upgrade nudge from the subscription module). The slot is opaque
 * to breathing — pass any ReactNode and it will be rendered below the
 * wellbeing thank-you message inside the DoneFooter.
 */
export interface BreathingWidgetProps {
  /**
   * Optional ReactNode rendered at the bottom of the post-session footer.
   * Pass nothing → no extra UI is shown. Pass a subscription-aware
   * component → it appears, but breathing knows nothing about it.
   */
  doneFooterSlot?: ReactNode;
}

export function BreathingWidget({ doneFooterSlot }: BreathingWidgetProps = {}) {
  const [screen,          setScreen]          = useState<Screen>("idle");
  const [boxDuration,     setBoxDuration]     = useState(60);
  const [nothingDuration, setNothingDuration] = useState(180);
  const [container,       setContainer]       = useState<HTMLElement | null>(null);

  useEffect(() => { setContainer(document.body); }, []);

  return (
    <>
      {/* Today-tab teaser */}
      <button
        onClick={() => setScreen("select")}
        className="w-full flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 mb-5 text-left hover:bg-white/[0.06] active:scale-[0.98] transition-all"
      >
        <motion.div
          className="shrink-0 rounded-full"
          style={{ width: 35, height: 35, background: ORB_BG }}
          animate={{
            scale: [1, 1.13, 1],
            boxShadow: [
              "0 0 10px rgba(90,163,216,.40), 0 0 4px rgba(90,163,216,.20)",
              "0 0 26px rgba(90,163,216,.72), 0 0 12px rgba(90,163,216,.36)",
              "0 0 10px rgba(90,163,216,.40), 0 0 4px rgba(90,163,216,.20)",
            ],
          }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/70 mb-0.5">Take a breath</p>
          <p className="text-[0.72rem] text-white/38 leading-snug">
            Breathe, reset, or just be still
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-white/25 shrink-0" strokeWidth={1.5} />
      </button>

      {/* Full-screen portal */}
      {container && createPortal(
        <AnimatePresence>
          {screen !== "idle" && (
            <motion.div
              key="breathing-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
              style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            >
              {screen === "select" && (
                <SelectionScreen
                  onClose={() => setScreen("idle")}
                  onSelectBox={secs => { setBoxDuration(secs); setScreen("box"); }}
                  onSelectSigh={() => setScreen("sigh")}
                  onSelectNothing={secs => { setNothingDuration(secs); setScreen("nothing"); }}
                />
              )}
              {screen === "box" && (
                <BoxSession
                  totalSecs={boxDuration}
                  onBack={() => setScreen("select")}
                  doneFooterSlot={doneFooterSlot}
                />
              )}
              {screen === "sigh" && (
                <SighSession
                  onBack={() => setScreen("select")}
                  doneFooterSlot={doneFooterSlot}
                />
              )}
              {screen === "nothing" && (
                <DoNothingSession
                  totalSecs={nothingDuration}
                  onBack={() => setScreen("select")}
                  doneFooterSlot={doneFooterSlot}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        container
      )}
    </>
  );
}
