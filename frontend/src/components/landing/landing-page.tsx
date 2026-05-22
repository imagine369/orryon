"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { hasToken } from "@/lib/api";
import { AnimatedHeroAvatar } from "@/components/animated-hero-avatar";
import { FadeIn } from "@/components/motion";
import { PillLink } from "@/components/pill-cta";
import { GetAppNavLink, SignInNavLink, SiteNav } from "@/components/site-nav";
import { AppTourDemo } from "@/components/landing/app-tour-demo";
import { FeatureSection } from "@/components/landing/feature-section";
import { OrbitSection } from "@/components/landing/orbit-section";

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(hasToken());
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
          <h1 className="text-[1.85rem] sm:text-[2.75rem] lg:text-[3.25rem] font-extrabold text-white/85 mt-[10px] mb-[59px] sm:mb-[67px] lg:mb-[75px] font-[family-name:var(--font-playfair)] leading-[1.25] w-full max-w-[95vw] sm:max-w-[560px] lg:max-w-[860px]">
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

      {/* Bottom CTA */}
      <section>
      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 sm:px-6 pt-12 pb-12 sm:pt-16 sm:pb-16 lg:pt-24 lg:pb-24 text-center flex flex-col items-center">
        {!loggedIn && (
          <>
            <h2 className="text-[1.75rem] sm:text-[2.25rem] lg:text-[3rem] font-extrabold text-white/85 font-[family-name:var(--font-playfair)] leading-[1.25] mb-3 sm:mb-4">Less noise. More you.</h2>
            <p className="text-[0.82rem] sm:text-sm lg:text-base text-white/50">Private by design. Your data stays yours.</p>

            <div className="h-[160px]" aria-hidden />

            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.75, 0.92, 0.75] }}
              transition={{ duration: 5.5, ease: "easeInOut", repeat: Infinity }}
              className="mb-8 lg:mb-10"
              style={{
                width: 192,
                height: 192,
                borderRadius: "50%",
                background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
                boxShadow: "0 0 80px rgba(62,207,190,0.28), 0 0 160px rgba(100,170,220,0.14)",
              }}
            />

            <h2 className="text-[1.75rem] sm:text-[2.25rem] lg:text-[3rem] font-extrabold text-white/85 font-[family-name:var(--font-playfair)] leading-[1.25] mb-3 sm:mb-4">
              Wellbeing should be free.<br />For everyone.
            </h2>
            <div className="space-y-4 mb-8 sm:mb-10 lg:mb-12 max-w-[460px] text-[0.82rem] sm:text-sm lg:text-base text-white/50 leading-relaxed">
              <p>That&rsquo;s why our wellness tools are free for everyone.</p>
              <p className="font-semibold text-white/70">Use them as much as you like.</p>
              <p>The advanced features are optional. Only pay if you use them.</p>
            </div>

            <PillLink href="/download" size="sm">Download</PillLink>
          </>
        )}

        {loggedIn && (
          <>
            <h2 className="text-[1.75rem] sm:text-[2.25rem] lg:text-[3rem] font-extrabold text-white/85 font-[family-name:var(--font-playfair)] leading-[1.25] mb-3 sm:mb-4">Less noise. More you.</h2>
            <p className="text-[0.82rem] sm:text-sm lg:text-base text-white/50">Private by design. Your data stays yours.</p>

            <div className="h-[160px]" aria-hidden />

            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.75, 0.92, 0.75] }}
              transition={{ duration: 5.5, ease: "easeInOut", repeat: Infinity }}
              className="mb-8 lg:mb-10"
              style={{
                width: 192,
                height: 192,
                borderRadius: "50%",
                background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
                boxShadow: "0 0 80px rgba(62,207,190,0.28), 0 0 160px rgba(100,170,220,0.14)",
              }}
            />
            <h2 className="text-[1.75rem] sm:text-[2.25rem] lg:text-[3rem] font-extrabold text-white/85 font-[family-name:var(--font-playfair)] leading-[1.25] mb-3 sm:mb-4">Wellbeing should be free.<br />For everyone.</h2>
            <div className="space-y-4 mb-8 sm:mb-10 lg:mb-12 max-w-[460px] text-[0.82rem] sm:text-sm lg:text-base text-white/50 leading-relaxed">
              <p>That’s why our wellness tools are free for everyone.</p>
              <p className="font-semibold text-white/70">Use them as much as you like.</p>
              <p>The advanced features are optional. Only pay if you use them.</p>
            </div>

            <PillLink href="/breathe" size="sm">Try breathing — it&rsquo;s free</PillLink>

            <PillLink href="/home" size="sm">Access All Features</PillLink>

          </>
        )}
      </div>
      </section>

    </div>
  );
}
