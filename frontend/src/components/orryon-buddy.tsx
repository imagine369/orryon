"use client";

/**
 * OrroyonBuddy — Live Orryon floating companion (Clicky-style).
 *
 * This is the Live Orryon avatar: a cursor-following, always-on-screen
 * visual buddy. Clicking or pressing ` activates voice listening mode.
 *
 * Mechanics:
 *  - Fixed always-on-top portal, transparent background
 *  - Smooth cursor-following with natural spring damping (RAF lerp)
 *  - Idle animations: breathing, slow drift, blink, gentle head-tilt
 *  - Click avatar or press hotkey (backtick `) to activate Live Orryon voice
 *  - Glide/point: call buddyGlideTo(x, y) to fly Orryon to a screen position
 *  - Click passthrough: wrapper is pointer-events:none; only avatar is interactive
 *
 * Tier gate: caller is responsible — render this component only for
 * Premium and Premium Plus subscribers.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence, useMotionValue, type Variants, type TargetAndTransition } from "framer-motion";

// ─── Public imperative API ────────────────────────────────────────────────────

type GlideTarget = { x: number; y: number; durationMs?: number };
type GlideListener = (target: GlideTarget) => void;

const glideListeners = new Set<GlideListener>();

/** Fly Orryon to an absolute screen coordinate (e.g. to point at an element). */
export function buddyGlideTo(x: number, y: number, durationMs = 600) {
  glideListeners.forEach((fn) => fn({ x, y, durationMs }));
}

/** Fly Orryon to a DOM element's position. */
export function buddyPointAt(el: Element, durationMs = 600) {
  const r = el.getBoundingClientRect();
  buddyGlideTo(r.left + r.width / 2, r.top + r.height / 2, durationMs);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 72;          // px — rendered size of the avatar circle
const FOLLOW_LERP = 0.065;       // 0–1: lower = more lag / damping
const HOTKEY = "`";              // backtick activates talk
const IDLE_RADIUS = 18;          // px — how far Orryon drifts while idle
const FOLLOW_OFFSET = { x: 28, y: -56 }; // offset from cursor so avatar doesn't cover it

// ─── Idle animation variants ─────────────────────────────────────────────────

const breatheAnim: TargetAndTransition = {
  scale: [1, 1.035, 1, 1.035, 1],
  transition: { duration: 4.2, repeat: Infinity, ease: "easeInOut" },
};

const expressionVariants: Variants = {
  idle: { rotate: [0, 1.5, -1.5, 1, 0], transition: { duration: 6, repeat: Infinity, ease: "easeInOut" } },
  talking: { rotate: [0, 2, -2, 0], scale: [1, 1.04, 0.98, 1], transition: { duration: 0.45, repeat: Infinity } },
  listening: { scale: [1, 1.06, 1], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } },
  gliding: { rotate: 0, scale: 1.08, transition: { duration: 0.25 } },
};

// ─── Blink overlay ────────────────────────────────────────────────────────────

function Blink() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function scheduleBlink() {
      // Random interval 2–7 s, then blink lasts ~120 ms
      const delay = 2000 + Math.random() * 5000;
      return setTimeout(() => {
        setVisible(true);
        setTimeout(() => {
          setVisible(false);
          scheduleRef.current = scheduleBlink();
        }, 120);
      }, delay);
    }
    const scheduleRef = { current: scheduleBlink() };
    return () => clearTimeout(scheduleRef.current);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          exit={{ scaleY: 0 }}
          transition={{ duration: 0.06 }}
          className="absolute inset-0 rounded-full bg-black/70 origin-center"
          style={{ zIndex: 2 }}
        />
      )}
    </AnimatePresence>
  );
}

// ─── Glow ring ────────────────────────────────────────────────────────────────

function GlowRing({ active }: { active: boolean }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full"
      animate={
        active
          ? {
              boxShadow: [
                "0 0 0px 0px rgba(200,160,240,0)",
                "0 0 18px 6px rgba(200,160,240,0.55)",
                "0 0 10px 3px rgba(200,160,240,0.30)",
              ],
            }
          : { boxShadow: "0 0 0px 0px rgba(200,160,240,0)" }
      }
      transition={{ duration: 0.9, repeat: active ? Infinity : 0, ease: "easeInOut" }}
    />
  );
}

// ─── Point beam ───────────────────────────────────────────────────────────────

function PointBeam({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 0.45, scaleX: 1 }}
          exit={{ opacity: 0, scaleX: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute left-1/2 top-1/2 h-[2px] w-20 origin-left -translate-y-1/2 rounded-full"
          style={{
            background: "linear-gradient(to right, rgba(200,160,240,0.8), transparent)",
            zIndex: 1,
          }}
        />
      )}
    </AnimatePresence>
  );
}

// ─── Tooltip bubble ──────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.94 }}
      transition={{ duration: 0.22 }}
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md"
      style={{ pointerEvents: "none" }}
    >
      {text}
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type BuddyMode = "idle" | "talking" | "listening" | "gliding";

export function OrroyonBuddy({
  onActivate,
  onStopListening,
}: {
  onActivate?: () => void;
  onStopListening?: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  // Position state — actual rendered position, smoothly interpolated
  const posRef = useRef({ x: window?.innerWidth ?? 400, y: (window?.innerHeight ?? 600) * 0.7 });
  const targetRef = useRef({ ...posRef.current });
  const frameRef = useRef<number | null>(null);

  const x = useMotionValue(posRef.current.x);
  const y = useMotionValue(posRef.current.y);

  const [mode, setMode] = useState<BuddyMode>("idle");
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [showBeam, setShowBeam] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [following, setFollowing] = useState(true);

  // Live Orryon voice state — persistent while listening
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const modeRef = useRef<BuddyMode>("idle");
  modeRef.current = mode;

  // ── RAF lerp loop ─────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    const cur = posRef.current;
    const tgt = targetRef.current;

    const nx = cur.x + (tgt.x - cur.x) * FOLLOW_LERP;
    const ny = cur.y + (tgt.y - cur.y) * FOLLOW_LERP;

    posRef.current = { x: nx, y: ny };
    x.set(nx);
    y.set(ny);

    frameRef.current = requestAnimationFrame(tick);
  }, [x, y]);

  useEffect(() => {
    setMounted(true);
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [tick]);

  // ── Cursor following ──────────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!following) return;
      if (modeRef.current === "gliding") return;
      targetRef.current = {
        x: e.clientX + FOLLOW_OFFSET.x,
        y: e.clientY + FOLLOW_OFFSET.y,
      };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [following]);

  // ── Idle drift (subtle autonomous movement when mouse is still) ───────────

  useEffect(() => {
    let driftTimer: ReturnType<typeof setTimeout>;
    let driftAngle = 0;

    const drift = () => {
      if (modeRef.current !== "idle") {
        driftTimer = setTimeout(drift, 800);
        return;
      }
      driftAngle += 0.4 + Math.random() * 0.3;
      const ox = Math.sin(driftAngle) * IDLE_RADIUS * 0.4;
      const oy = Math.cos(driftAngle * 0.7) * IDLE_RADIUS * 0.25;
      targetRef.current = {
        x: targetRef.current.x + ox,
        y: targetRef.current.y + oy,
      };
      driftTimer = setTimeout(drift, 1800 + Math.random() * 1200);
    };

    driftTimer = setTimeout(drift, 3000);
    return () => clearTimeout(driftTimer);
  }, []);

  // ── Hotkey ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === HOTKEY && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Don't fire if user is typing in an input/textarea
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
        e.preventDefault();
        handleActivate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Glide API subscription ────────────────────────────────────────────────

  useEffect(() => {
    const listener: GlideListener = ({ x: gx, y: gy, durationMs = 600 }) => {
      setMode("gliding");
      setFollowing(false);
      setShowBeam(true);

      // Override LERP by directly setting target; the RAF loop handles smooth movement.
      // For glide we temporarily boost LERP so it arrives faster.
      const startX = posRef.current.x;
      const startY = posRef.current.y;
      const startTime = performance.now();

      const glideFrame = (now: number) => {
        const t = Math.min((now - startTime) / durationMs, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out-cubic
        targetRef.current = {
          x: startX + (gx - startX) * ease,
          y: startY + (gy - startY) * ease,
        };
        if (t < 1) {
          requestAnimationFrame(glideFrame);
        } else {
          // Hold for a moment, then resume following
          setTimeout(() => {
            setShowBeam(false);
            setMode("idle");
            setFollowing(true);
          }, 1800);
        }
      };
      requestAnimationFrame(glideFrame);
    };

    glideListeners.add(listener);
    return () => void glideListeners.delete(listener);
  }, []);

  // ── Live Orryon activate / cancel (toggle) ────────────────────────────────

  const handleActivate = useCallback(() => {
    if (isVoiceActive) {
      // Cancel / stop listening
      setIsVoiceActive(false);
      setMode("idle");
      setTooltip(null);
      setShowBeam(false);
      onStopListening?.();
    } else {
      // Start Live Orryon voice listening
      setIsVoiceActive(true);
      setMode("listening");
      setTooltip("Listening… click again to stop");
      setShowBeam(true);
      onActivate?.();
    }
  }, [isVoiceActive, onActivate, onStopListening]);

  // ── Hover tooltip — reflects Live Orryon state ────────────────────────────

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (isVoiceActive) {
      setTooltip("Click to stop listening");
    } else {
      setTooltip(`Click or press \`${HOTKEY}\` to talk with Live Orryon`);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (!isVoiceActive && mode === "idle") setTooltip(null);
  };

  // ── Don't render on server ────────────────────────────────────────────────

  if (!mounted) return null;

  // ─── JSX ──────────────────────────────────────────────────────────────────

  const buddy = (
    <motion.div
      // Wrapper: click-through, always on top
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        zIndex: 9999,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {/* Translate container that follows position */}
      <motion.div
        style={{
          x,
          y,
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          marginLeft: -(AVATAR_SIZE / 2),
          marginTop: -(AVATAR_SIZE / 2),
          position: "absolute",
          pointerEvents: "none",
        }}
      >
        {/* Breathing outer container */}
        <motion.div
          className="relative"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, pointerEvents: "auto", cursor: "pointer" }}
          animate={breatheAnim}
          onClick={handleActivate}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Expression / reaction layer */}
          <motion.div
            className="relative w-full h-full"
            variants={expressionVariants}
            animate={mode}
          >
            {/* Avatar image */}
            <Image
              src="/avatar.png"
              alt="Orryon"
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              className="rounded-full object-cover object-[center_12%] ring-1 ring-white/10 select-none"
              draggable={false}
              priority
            />

            {/* Blink overlay */}
            <Blink />

            {/* Glow ring — stronger pulse when Live Orryon voice is actively listening */}
            <GlowRing active={mode === "talking" || mode === "listening" || isVoiceActive} />
          </motion.div>

          {/* Tooltip */}
          <AnimatePresence>
            {tooltip && <Tooltip text={tooltip} />}
          </AnimatePresence>

          {/* Point beam */}
          <PointBeam show={showBeam} />
        </motion.div>
      </motion.div>
    </motion.div>
  );

  return createPortal(buddy, document.body);
}
