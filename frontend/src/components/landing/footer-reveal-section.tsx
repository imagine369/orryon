"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { ORB_FILL } from "@/components/reset-anchor/tokens";
import { PillLink } from "@/components/pill-cta";

/* ── Customise timing / sizing here ── */
const ORB_SIZE_MOBILE = 128;
const ORB_SIZE_DESKTOP = 192;
const EXPAND_DURATION = 3;
const CONTENT_FADE_START_MS = 900;
const SCROLL_SETTLE_MS = 500;
const EASE = [0.16, 1, 0.3, 1] as const;
const LINE1_WORDS = ["Peace", "&", "Clarity", "should", "be", "free."];
const LINE3_WORDS = [
  "That\u2019s",
  "why",
  "our",
  "wellness",
  "tools",
  "are",
  "free",
  "for",
  "everyone.",
];
const WORD_STAGGER = 0.13;
const PAUSE_AFTER_LINE1 = 0.35;
const PAUSE_AFTER_LINE2 = 0.55;
const PAUSE_AFTER_LINE3 = 0.45;
const PAUSE_AFTER_CTA = 0.4;

const TEXT_MUTED = "#b4b4b4";
const TEXT_DARK = "#1d1d1f";
const ORB_GLOW =
  "0 0 60px rgba(62,207,190,0.45), 0 0 120px rgba(100,170,220,0.28), 0 0 200px rgba(168,144,208,0.12)";
const ORB_GLOW_PULSE =
  "0 0 80px rgba(62,207,190,0.65), 0 0 160px rgba(100,170,220,0.4), 0 0 240px rgba(168,144,208,0.18)";

/** Soft white wash on the orb surface as it expands */
const ORB_SURFACE_WASH =
  "radial-gradient(circle at 50% 50%, #ffffff 0%, #ffffff 42%, rgba(255,255,255,0.92) 58%, rgba(255,255,255,0.4) 72%, transparent 88%)";

type OrbOrigin = {
  x: number;
  y: number;
  size: number;
};

function calcExpandScale(origin: OrbOrigin) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = vw / 2;
  const cy = vh / 2;
  const maxDist = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(vw - cx, cy),
    Math.hypot(cx, vh - cy),
    Math.hypot(vw - cx, vh - cy),
  );
  return (maxDist * 2.2) / origin.size;
}

function viewportCenter() {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function line2Delay(reducedMotion: boolean) {
  if (reducedMotion) return 0;
  return LINE1_WORDS.length * WORD_STAGGER + PAUSE_AFTER_LINE1;
}

function line3Delay(reducedMotion: boolean) {
  return line2Delay(reducedMotion) + (reducedMotion ? 0 : PAUSE_AFTER_LINE2 + 0.55);
}

function line3WordDelay(reducedMotion: boolean, wordIndex: number) {
  return line3Delay(reducedMotion) + (reducedMotion ? 0 : wordIndex * WORD_STAGGER);
}

function ctaDelay(reducedMotion: boolean) {
  return (
    line3Delay(reducedMotion) +
    (reducedMotion ? 0 : LINE3_WORDS.length * WORD_STAGGER + PAUSE_AFTER_LINE3)
  );
}

function closeDelay(reducedMotion: boolean) {
  return ctaDelay(reducedMotion) + (reducedMotion ? 0 : PAUSE_AFTER_CTA);
}

function RevealWord({
  children,
  delay,
  active,
  reducedMotion,
}: {
  children: React.ReactNode;
  delay: number;
  active: boolean;
  reducedMotion: boolean;
}) {
  return (
    <motion.span
      className="inline-block mr-[0.32em] last:mr-0"
      initial={{ color: TEXT_MUTED }}
      animate={{ color: active ? TEXT_DARK : TEXT_MUTED }}
      transition={{
        duration: reducedMotion ? 0 : 0.75,
        delay: reducedMotion ? 0 : delay,
        ease: EASE,
      }}
    >
      {children}
    </motion.span>
  );
}

function RevealBlock({
  children,
  delay,
  active,
  reducedMotion,
}: {
  children: React.ReactNode;
  delay: number;
  active: boolean;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{
        duration: reducedMotion ? 0 : 0.75,
        delay: reducedMotion ? 0 : delay,
        ease: EASE,
      }}
    >
      {children}
    </motion.div>
  );
}

export function FooterRevealSection({ loggedIn = false }: { loggedIn?: boolean }) {
  const orbRef = useRef<HTMLDivElement>(null);
  const hasTriggered = useRef(false);
  const [nearBottom, setNearBottom] = useState(false);
  const [open, setOpen] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [origin, setOrigin] = useState<OrbOrigin | null>(null);
  const [expandScale, setExpandScale] = useState(50);
  const [center, setCenter] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = document.querySelector("[data-footer-sentinel]");
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setNearBottom(entry.isIntersecting),
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const captureOrigin = useCallback((): OrbOrigin | null => {
    const rect = orbRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      size: rect.width,
    };
  }, []);

  const handleOpen = useCallback(() => {
    const next = captureOrigin();
    if (!next) return;
    setCenter(viewportCenter());
    setOrigin(next);
    setExpandScale(calcExpandScale(next));
    setOpen(true);
  }, [captureOrigin]);

  useEffect(() => {
    if (!nearBottom || open || hasTriggered.current) return;

    const timer = window.setTimeout(() => {
      const sentinel = document.querySelector("[data-footer-sentinel]");
      if (!sentinel || hasTriggered.current || open) return;

      const rect = sentinel.getBoundingClientRect();
      const stillNear = rect.top < window.innerHeight * 0.9;
      if (!stillNear) return;

      hasTriggered.current = true;
      handleOpen();
    }, SCROLL_SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [nearBottom, open, handleOpen]);

  const handleClose = useCallback(() => {
    setShowContent(false);
    window.setTimeout(() => {
      setOpen(false);
      setOrigin(null);
    }, reducedMotion ? 0 : 600);
  }, [reducedMotion]);

  useEffect(() => {
    if (!open) {
      setShowContent(false);
      return;
    }
    if (reducedMotion) {
      setShowContent(true);
      return;
    }
    const t = window.setTimeout(() => setShowContent(true), CONTENT_FADE_START_MS);
    return () => window.clearTimeout(t);
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, handleClose]);

  const expandTransition = reducedMotion
    ? { duration: 0 }
    : { duration: EXPAND_DURATION, ease: EASE };

  const positionTransition = expandTransition;

  return (
    <>
      <section
        className="relative border-t border-white/[0.08] overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 72%, rgba(62,207,190,0.14) 0%, rgba(168,144,208,0.08) 38%, transparent 68%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(62,207,190,0.06) 0%, transparent 55%), #0a0c10",
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[8%] sm:bottom-[10%] w-[min(90vw,520px)] h-[min(90vw,520px)] rounded-full opacity-70"
          style={{
            background:
              "radial-gradient(circle, rgba(62,207,190,0.18) 0%, rgba(100,170,220,0.08) 40%, transparent 70%)",
          }}
          aria-hidden
        />

        <div className="relative max-w-lg lg:max-w-2xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-24 text-center flex flex-col items-center">
          <h2 className="text-[1.75rem] sm:text-[2.25rem] lg:text-[3rem] font-extrabold text-white/90 font-[family-name:var(--font-playfair)] leading-[1.25] mb-3 sm:mb-4">
            Less noise. More you.
          </h2>
          <p className="text-[0.82rem] sm:text-sm lg:text-base text-white/55 max-w-[420px] mb-[100px]">
            Private by design. Your data stays yours.
          </p>

          <div className="relative flex flex-col items-center">
            {!open && (
              <>
                <motion.div
                  className="absolute rounded-full border border-teal-400/20 pointer-events-none"
                  style={{ width: ORB_SIZE_MOBILE + 48, height: ORB_SIZE_MOBILE + 48 }}
                  animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.15, 0.5] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                  aria-hidden
                />
                <motion.div
                  className="absolute rounded-full border border-white/10 pointer-events-none hidden sm:block"
                  style={{ width: ORB_SIZE_DESKTOP + 64, height: ORB_SIZE_DESKTOP + 64 }}
                  animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.1, 0.35] }}
                  transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                  aria-hidden
                />
              </>
            )}

            <motion.div
              ref={orbRef}
              aria-hidden
              animate={
                open
                  ? { opacity: 0 }
                  : {
                      scale: nearBottom ? [1, 1.08, 1] : [1, 1.05, 1],
                      opacity: [0.88, 1, 0.88],
                      boxShadow: [ORB_GLOW, ORB_GLOW_PULSE, ORB_GLOW],
                    }
              }
              transition={{
                scale: { duration: nearBottom ? 2.6 : 4.2, repeat: Infinity, ease: "easeInOut" },
                opacity: { duration: open ? 0.15 : 4.2, repeat: open ? 0 : Infinity, ease: "easeInOut" },
                boxShadow: { duration: nearBottom ? 2.6 : 4.2, repeat: Infinity, ease: "easeInOut" },
              }}
              className="relative rounded-full w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48"
              style={{ background: ORB_FILL, boxShadow: ORB_GLOW }}
            />
          </div>

          <div data-footer-sentinel className="h-px w-full mt-12" aria-hidden />
        </div>
      </section>

      <AnimatePresence>
        {open && origin && (
          <>
            <motion.div
              className="fixed inset-0 z-[99] bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.625 }}
              aria-hidden
            />

            <motion.div
              className="fixed inset-0 z-[100]"
              initial={{ opacity: reducedMotion ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              aria-modal="true"
              role="dialog"
              aria-labelledby="footer-reveal-heading"
            >
              <motion.div
                className="fixed rounded-full overflow-hidden"
                style={{
                  width: origin.size,
                  height: origin.size,
                  left: origin.x,
                  top: origin.y,
                  x: "-50%",
                  y: "-50%",
                  background: ORB_FILL,
                  boxShadow: ORB_GLOW_PULSE,
                }}
                initial={{ scale: 1, left: origin.x, top: origin.y }}
                animate={{
                  scale: expandScale,
                  left: center.x,
                  top: center.y,
                }}
                exit={{ scale: 1, left: origin.x, top: origin.y }}
                transition={expandTransition}
              >
                <motion.div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ background: ORB_SURFACE_WASH }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{
                    duration: reducedMotion ? 0 : EXPAND_DURATION * 0.85,
                    ease: EASE,
                    delay: reducedMotion ? 0 : 0.15,
                  }}
                />
              </motion.div>

              <motion.div
                className="fixed z-[101] flex flex-col items-center justify-center text-center px-6 sm:px-8 pointer-events-none"
                style={{
                  width: "min(88vw, 540px)",
                  left: origin.x,
                  top: origin.y,
                  x: "-50%",
                  y: "-50%",
                }}
                initial={{ left: origin.x, top: origin.y }}
                animate={{
                  left: center.x,
                  top: center.y,
                }}
                exit={{ left: origin.x, top: origin.y }}
                transition={{
                  left: positionTransition,
                  top: positionTransition,
                }}
              >
                <div className="pointer-events-auto flex flex-col items-center">
                  <h2
                    id="footer-reveal-heading"
                    className="text-[1.5rem] sm:text-[2rem] lg:text-[2.75rem] font-extrabold font-[family-name:var(--font-playfair)] leading-[1.25] mb-4 sm:mb-5"
                  >
                    <span className="block">
                      {LINE1_WORDS.map((word, i) => (
                        <RevealWord
                          key={word + i}
                          active={showContent}
                          reducedMotion={reducedMotion}
                          delay={i * WORD_STAGGER}
                        >
                          {word}
                        </RevealWord>
                      ))}
                    </span>

                    <motion.span
                      className="block mt-1 sm:mt-1.5"
                      initial={{ color: TEXT_MUTED }}
                      animate={{ color: showContent ? TEXT_DARK : TEXT_MUTED }}
                      transition={{
                        duration: reducedMotion ? 0 : 0.75,
                        delay: line2Delay(reducedMotion),
                        ease: EASE,
                      }}
                    >
                      For everyone.
                    </motion.span>
                  </h2>

                  <p className="text-[0.85rem] sm:text-sm lg:text-base leading-relaxed max-w-[440px] mb-8 sm:mb-9">
                    {LINE3_WORDS.map((word, i) => (
                      <RevealWord
                        key={word + i}
                        active={showContent}
                        reducedMotion={reducedMotion}
                        delay={line3WordDelay(reducedMotion, i)}
                      >
                        {word}
                      </RevealWord>
                    ))}
                  </p>

                  <RevealBlock
                    active={showContent}
                    reducedMotion={reducedMotion}
                    delay={ctaDelay(reducedMotion)}
                  >
                    <PillLink
                      href={loggedIn ? "/home" : "/download"}
                      variant="secondary"
                      size="sm"
                      className="border-black/20"
                    >
                      {loggedIn ? "Go to app" : "Download"}
                    </PillLink>
                  </RevealBlock>
                </div>
              </motion.div>

              <motion.button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                initial={{ opacity: 0 }}
                animate={{ opacity: showContent ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.4,
                  delay: closeDelay(reducedMotion),
                }}
                className="fixed z-[102] top-5 right-5 sm:top-7 sm:right-7 w-10 h-10 flex items-center justify-center rounded-full text-black/35 hover:text-black/65 hover:bg-white/60 backdrop-blur-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
