"use client";

import { useEffect, useState } from "react";
import { hasToken } from "@/lib/api";
import { AnimatedHeroAvatar } from "@/components/animated-hero-avatar";
import { FadeIn } from "@/components/motion";
import { PillLink } from "@/components/pill-cta";
import { GetAppNavLink, SignInNavLink, SiteNav } from "@/components/site-nav";
import { AppTourDemo } from "@/components/landing/app-tour-demo";
import { FeatureSection } from "@/components/landing/feature-section";
import { FooterRevealSection } from "@/components/landing/footer-reveal-section";
import { OrbitSection } from "@/components/landing/orbit-section";

const HERO_ASK_TEXT = "Ask me anything.";
const HERO_ASK_TYPE_MS = 32;
const HERO_ASK_START_MS = 400;

function HeroAskTyping() {
  const [text, setText] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      queueMicrotask(() => setText(HERO_ASK_TEXT));
      return;
    }

    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const type = () => {
      if (i <= HERO_ASK_TEXT.length) {
        setText(HERO_ASK_TEXT.slice(0, i));
        i++;
        timer = setTimeout(type, HERO_ASK_TYPE_MS);
      }
    };

    timer = setTimeout(type, HERO_ASK_START_MS);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <p
      className="text-[0.9rem] sm:text-[1rem] lg:text-[1.15rem] text-white/65 mb-[28px] sm:mb-[36px] lg:mb-[48px] min-h-[1.5em]"
      style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
      aria-label={HERO_ASK_TEXT}
    >
      <span aria-hidden="true">
        {text}
        {!reducedMotion && (
          <span className="inline-block w-[1.5px] h-[0.85em] bg-white/60 ml-px align-middle animate-pulse" />
        )}
      </span>
    </p>
  );
}

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setLoggedIn(hasToken()));
  }, []);

  const navActions = loggedIn ? (
    <PillLink href="/home" variant="primary" size="sm">Go to app</PillLink>
  ) : (
    <>
      <SignInNavLink />
      <GetAppNavLink />
    </>
  );

  const heroCta = loggedIn ? (
    <PillLink href="/home" size="sm">Go to app</PillLink>
  ) : (
    <PillLink href="/download" size="sm">Download</PillLink>
  );

  return (
    <div className="flex flex-col flex-1 bg-black text-white">

      <SiteNav logoHref={false}>{navActions}</SiteNav>

      {/* Hero */}
      <FadeIn>
        <div className="flex flex-col items-center text-center pt-[45px] sm:pt-[75px] lg:pt-[105px] pb-0 px-4 sm:px-6 border-b border-white/5">
          <AnimatedHeroAvatar
            alt="Orryon — otherworldly personal concierge"
            wrapperClassName="mt-0 mb-2.5 lg:mb-4"
          />
          <p className="text-[0.9rem] sm:text-[1rem] lg:text-[1.15rem] text-white/65 mb-[6px]" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
            Hi, I&rsquo;m Orryon.
          </p>
          <p className="text-[0.6rem] sm:text-[0.65rem] lg:text-[0.75rem] uppercase tracking-[2px] text-white/65 mb-[28px] sm:mb-[36px] lg:mb-[48px] -mt-[3px]">
            Your Life OS
          </p>
          <HeroAskTyping />
          <h1 className="text-[1.85rem] sm:text-[2.75rem] lg:text-[3.25rem] font-extrabold text-white/85 mb-[59px] sm:mb-[67px] lg:mb-[75px] font-[family-name:var(--font-playfair)] leading-[1.25] w-full max-w-[95vw] sm:max-w-[560px] lg:max-w-[860px]">
            Your guide to organized life
            <span className="hidden sm:inline"><br /></span>and calmer days.
          </h1>

          {/* See it in action — app tour */}
          <div className="w-full flex flex-col items-center">
            <div className="w-full max-w-lg px-4 sm:px-6 flex flex-col items-center gap-3 mb-[48px] sm:mb-[60px] mt-0">
              {heroCta}
            </div>

            <div className="mt-[40px] sm:mt-[50px] w-full flex justify-center text-left">
              <AppTourDemo />
            </div>

            <p className="text-[0.72rem] sm:text-xs lg:text-sm text-white/60 mt-[15px]">
              Orryon doesn&rsquo;t connect to your bank.<br />That&rsquo;s the point. Your data stays yours.
            </p>
          </div>
        </div>
      </FadeIn>

      <OrbitSection />

      <FeatureSection />

      <style>{`
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes breatheOrb {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 16px rgba(90,163,216,.42), 0 0 6px rgba(90,163,216,.22);
          }
          50% {
            transform: scale(1.32);
            box-shadow: 0 0 44px rgba(90,163,216,.78), 0 0 20px rgba(90,163,216,.46);
          }
        }
        @keyframes wavebar {
          0%, 100% { height: 3px;  opacity: 0.35; }
          50%       { height: 14px; opacity: 0.85; }
        }
        @keyframes micglow {
          0%, 100% { box-shadow: 0 0 0 2px rgba(255,255,255,0.12); }
          50%       { box-shadow: 0 0 0 4px rgba(255,255,255,0.22), 0 0 12px rgba(255,255,255,0.10); }
        }
      `}</style>

      <FooterRevealSection loggedIn={loggedIn} />

    </div>
  );
}
