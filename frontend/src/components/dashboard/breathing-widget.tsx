"use client";

import { useState, useEffect, useCallback, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PillButton } from "@/components/pill-cta";

// ── Shared constants ──────────────────────────────────────────────────────────

const BG        = "linear-gradient(180deg, #0f2a42 0%, #162f4a 45%, #0f2540 100%)";
const ORB_BG    = "linear-gradient(135deg, #7dc8f5 0%, #5aa3d8 50%, #4082c0 100%)";
const FONT      = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";


const ghostBtn: CSSProperties = {
  background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)",
  color: "rgba(255,255,255,.70)", borderRadius: "8px", padding: "0.42rem 1.1rem",
  fontSize: "0.82rem", fontWeight: 500, cursor: "pointer", fontFamily: FONT,
};

// ── Shared layout shells ──────────────────────────────────────────────────────

function Session({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
      style={{ background: BG, fontFamily: FONT }}
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

function DoneFooter({ label, onRestart, onBack }: { label: string; onRestart: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center mt-10 px-8 text-center">
      <p style={{ color: "rgba(255,255,255,.92)", fontSize: "1.1rem", fontWeight: 500, marginBottom: "0.35rem" }}>
        Well done
      </p>
      <p style={{ color: "rgba(255,255,255,.50)", fontSize: "0.82rem", lineHeight: 1.55, marginBottom: "1.5rem" }}>
        {label}
      </p>
      <div style={{ display: "flex", gap: "0.65rem" }}>
        <button onClick={onRestart} style={ghostBtn}>Start again</button>
        <button onClick={onBack}    style={{ ...ghostBtn, background: "rgba(255,255,255,.06)" }}>Change</button>
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

function BoxSession({ totalSecs, onBack }: { totalSecs: number; onBack: () => void }) {
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
        background: "radial-gradient(circle, hsla(200,60%,68%,.18) 0%, transparent 70%)", pointerEvents: "none",
        transform: `scale(${expanded ? 1.14 : 1.0})`,
        opacity: expanded ? 1 : 0.6,
        transition: "transform 4s ease-in-out, opacity 4s ease-in-out",
      }} />

      <p style={{ fontSize: "0.60rem", textTransform: "uppercase", letterSpacing: "2.5px", color: "rgba(255,255,255,.50)", marginBottom: "0.4rem" }}>
        Box Breathing · 4 – 4 – 4 – 4
      </p>
      <p style={{ fontSize: "0.76rem", color: "rgba(255,255,255,.50)", marginBottom: "1.8rem", maxWidth: 200, textAlign: "center", lineHeight: 1.55 }}>
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
          background: "radial-gradient(circle, hsl(200,60%,65%) 0%, hsl(200,58%,52%) 45%, hsl(202,55%,40%) 100%)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          boxShadow: expanded ? "0 0 55px hsla(200,60%,55%,.45)" : "0 0 30px hsla(200,60%,55%,.22)",
          transition: "box-shadow 4s ease-in-out",
          display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {done ? (
            <span style={{ fontSize: "1.5rem", color: "#fff", fontWeight: 300 }}>✓</span>
          ) : (
            <>
              <span style={{ fontSize: "clamp(1.4rem,6vw,1.9rem)", fontWeight: 300, color: "#fff", letterSpacing: "2px" }}>
                {phase.name}
              </span>
              <span style={{ fontSize: "0.70rem", color: "rgba(255,255,255,.50)", letterSpacing: "0.5px" }}>
                {remStr(remaining)}
              </span>
            </>
          )}
        </div>
      </div>

      {done && <DoneFooter label="Session complete. Take a quiet moment." onRestart={restart} onBack={onBack} />}
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

function SighSession({ onBack }: { onBack: () => void }) {
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
        background: "radial-gradient(circle, hsla(200,60%,68%,.18) 0%, transparent 70%)", pointerEvents: "none",
        transform: `scale(${isExpanded ? 1.14 : 1.0})`,
        opacity: isExpanded ? 1 : 0.6,
        transition: circleTr,
      }} />

      <p style={{ fontSize: "0.60rem", textTransform: "uppercase", letterSpacing: "2.5px", color: "rgba(255,255,255,.50)", marginBottom: "0.4rem" }}>
        Double Inhale Quick Destress
      </p>
      <p style={{ fontSize: "0.76rem", color: "rgba(255,255,255,.50)", marginBottom: "1.8rem", maxWidth: 220, textAlign: "center", lineHeight: 1.55 }}>
        Two inhales, then a long exhale.
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
          background: "radial-gradient(circle, hsl(200,60%,65%) 0%, hsl(200,58%,52%) 45%, hsl(202,55%,40%) 100%)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          boxShadow: isExpanded ? "0 0 55px hsla(200,60%,55%,.45)" : "0 0 30px hsla(200,60%,55%,.22)",
          transition: `box-shadow ${isInhale ? "4s" : "8s"} ease-in-out`,
          display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          {done
            ? <span style={{ fontSize: "1.5rem", color: "#fff", fontWeight: 300 }}>✓</span>
            : <>
                <span style={{ fontSize: "clamp(1.4rem,6vw,1.9rem)", fontWeight: 300, color: "#fff", letterSpacing: "2px" }}>
                  {phase.name}
                </span>
                <span style={{ fontSize: "0.70rem", color: "rgba(255,255,255,.50)", letterSpacing: "0.5px", textAlign: "center", padding: "0 1rem" }}>
                  {phase.sub || remStr(remaining)}
                </span>
              </>
          }
        </div>
      </div>

      {!done && (
        <p style={{ marginTop: "1.6rem", fontSize: "0.70rem", color: "rgba(255,255,255,.40)", letterSpacing: "0.5px" }}>
          Sigh {sigNum} of {SIGH_COUNT} · {remStr(remaining)}
        </p>
      )}

      {done && <DoneFooter label="5 sighs complete. You reset your nervous system." onRestart={restart} onBack={onBack} />}
    </Session>
  );
}

// ── Selection screen ──────────────────────────────────────────────────────────

function SelectionScreen({ onClose, onSelectBox, onSelectSigh }: {
  onClose:     () => void;
  onSelectBox: (secs: number) => void;
  onSelectSigh: () => void;
}) {
  const [boxMins, setBoxMins] = useState<1 | 3 | 6>(1);

  const card: CSSProperties = {
    background: "rgba(255,255,255,0.15)", backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)", borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.28)", padding: "1.2rem 1.3rem",
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
        style={{ paddingTop: "max(4.5rem, calc(env(safe-area-inset-top, 0px) + 3.5rem))", paddingBottom: "2.5rem" }}
      >
        <p style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "2.5px", color: "rgba(255,255,255,.40)", marginBottom: "0.5rem" }}>
          Choose your session
        </p>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 600, color: "#fff", marginBottom: "1.8rem", textAlign: "center" }}>
          How would you like to breathe?
        </h2>

        {/* ── Box Breathing card ── */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", marginBottom: "1rem" }}>
            <motion.div
              style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: ORB_BG }}
              animate={{ scale: [1, 1.14, 1], boxShadow: ["0 0 8px rgba(90,163,216,.40)", "0 0 20px rgba(90,163,216,.70)", "0 0 8px rgba(90,163,216,.40)"] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <div>
              <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff", marginBottom: "0.15rem" }}>Box Breathing</p>
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,.40)" }}>Guided circle · 4-4-4-4 · calming & focused</p>
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
                  border: boxMins === m ? "1.5px solid rgba(255,255,255,0.90)" : "1.5px solid rgba(255,255,255,0.25)",
                  background: boxMins === m ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)",
                  color: boxMins === m ? "#fff" : "rgba(255,255,255,0.45)",
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
              style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: "rgba(255,255,255,.15)" }}
              animate={{
                scale:     [1, 1.16, 1.06, 1.16, 1,    1],
                boxShadow: [
                  "0 0 0 1.5px rgba(255,255,255,0.22), 0 0 5px rgba(255,255,255,0.07)",
                  "0 0 0 1.5px rgba(255,255,255,0.60), 0 0 14px rgba(255,255,255,0.24)",
                  "0 0 0 1.5px rgba(255,255,255,0.30), 0 0 6px rgba(255,255,255,0.10)",
                  "0 0 0 1.5px rgba(255,255,255,0.60), 0 0 14px rgba(255,255,255,0.24)",
                  "0 0 0 1.5px rgba(255,255,255,0.22), 0 0 5px rgba(255,255,255,0.07)",
                  "0 0 0 1.5px rgba(255,255,255,0.22), 0 0 5px rgba(255,255,255,0.07)",
                ],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                times: [0, 0.12, 0.22, 0.34, 0.48, 1],
                ease: "easeOut",
              }}
            />
            <div>
              <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff", marginBottom: "0.15rem" }}>Double Inhale Quick Destress</p>
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,.40)" }}>Research-backed quick stress relief</p>
            </div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,.50)", lineHeight: 1.6, marginBottom: "0.6rem" }}>
            Two inhales through the nose, then a long exhale through the mouth. Clinical studies show this pattern reduces stress faster than other breathing techniques.
          </p>
          <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,.40)", marginBottom: "1.1rem" }}>5 sighs · ~70 seconds</p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PillButton onClick={onSelectSigh} variant="calm" size="sm">Start</PillButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Entry card (Today tab) ────────────────────────────────────────────────────

type Screen = "idle" | "select" | "box" | "sigh";

export function BreathingWidget() {
  const [screen,      setScreen]      = useState<Screen>("idle");
  const [boxDuration, setBoxDuration] = useState(60);
  const [container,   setContainer]   = useState<HTMLElement | null>(null);

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
          style={{ width: 44, height: 44, background: ORB_BG }}
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
          <p className="text-sm font-semibold text-white mb-0.5">Take a breath</p>
          <p className="text-[0.72rem] text-white/38 leading-snug">
            Box breathing or double inhale quick destress
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
                />
              )}
              {screen === "box" && (
                <BoxSession totalSecs={boxDuration} onBack={() => setScreen("select")} />
              )}
              {screen === "sigh" && (
                <SighSession onBack={() => setScreen("select")} />
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        container
      )}
    </>
  );
}
