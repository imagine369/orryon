"use client";

import Image from "next/image";
import Link from "next/link";
const StarEight = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <polygon points="12,2 13.5,8.3 19.1,4.9 15.7,10.5 22,12 15.7,13.5 19.1,19.1 13.5,15.7 12,22 10.5,15.7 4.9,19.1 8.3,13.5 2,12 8.3,10.5 4.9,4.9 10.5,8.3" />
  </svg>
);
import { useState, useEffect } from "react";
import { hasToken } from "@/lib/api";
import { FadeIn } from "@/components/motion";
import { Footer } from "@/components/footer";
import { PillLink } from "@/components/pill-cta";

const steps = [
  {
    n: "01",
    title: "Tell me what you need",
    desc: "Speak naturally — \"Add coffee $9.50\", \"Save $4000 for vacation by December\", or \"Doctor appointment Tuesday 10am\".",
  },
  {
    n: "02",
    title: "I understand and act",
    desc: "I handle the details — logging expenses, updating your schedule, tracking goals, and keeping your daily life organized.",
  },
  {
    n: "03",
    title: "Ask anything, get real answers",
    desc: "\"How much did I spend on dining this week?\" Your dashboard, budget, and forecast stay perfectly in sync.",
  },
];

const examples = [
  "Add coffee and breakfast $9.50",
  "Help me save $4000 for a vacation by December",
  "Add milk, eggs, bread, and chicken to my grocery list",
  "Doctor appointment on July 15 at 10am",
  "Give me a spending recap for this week",
];

const moneyFeatures = [
  "Budget & expense tracking",
  "Savings goals with progress",
  "Smart spending recaps",
  "Recurring bills tracker",
];

const lifeFeatures = [
  "Personal notes/journal",
  "Schedule, tasks & grocery list",
  "Receipt scanning",
];

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(hasToken());
  }, []);

  const navActions = loggedIn ? (
    <PillLink href="/home" variant="primary" size="sm">Go to app</PillLink>
  ) : (
    <Link href="/login" className="text-xs text-white/50 hover:text-white transition-colors tracking-wide">
      Sign in
    </Link>
  );

  const heroCta = loggedIn ? (
    <PillLink href="/home" size="sm">Go to app</PillLink>
  ) : (
    <>
      <PillLink href="/login" variant="primary" size="sm">Sign up</PillLink>
      <Link href="/login" className="text-xs text-white/40 hover:text-white/70 transition-colors">
        Already have an account? Sign in
      </Link>
    </>
  );

  const closingCta = loggedIn ? (
    <PillLink href="/home" size="sm">Go to app</PillLink>
  ) : (
    <PillLink href="/login" variant="primary" size="sm">Sign up</PillLink>
  );

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <span className="text-white font-extrabold tracking-widest uppercase text-[1.03rem] font-[family-name:var(--font-playfair)]">
          ORRYON
        </span>
        <div className="flex items-center gap-3">
          {navActions}
        </div>
      </nav>

      {/* Hero */}
      <FadeIn>
        <div className="flex flex-col items-center text-center pt-[100px] sm:pt-[160px] pb-16 px-6 border-b border-white/5">
          <Image src="/avatar.png" alt="Orryon — otherworldly personal concierge" width={91} height={91} className="rounded-full object-cover mb-8" />
          <p className="text-[0.65rem] uppercase tracking-[4px] text-white/45 mb-[28px]">
            Your otherworldly personal concierge
          </p>
          <h1 className="text-[2.25rem] sm:text-[3rem] font-extrabold text-white mb-6 font-[family-name:var(--font-playfair)] leading-[1.3] max-w-[420px]">
            Talk to me.<br />I will organize everything.
          </h1>
          <p className="text-[14px] text-white/60 max-w-sm leading-relaxed mb-8">
            Finance, scheduling, and daily life — organized through natural conversation.
          </p>

          {/* CTA — above the fold */}
          <div className="flex flex-col items-center gap-3 mb-3">
            {heroCta}
          </div>

          {/* Trust signal */}
          <p className="text-[0.6rem] text-white/35 tracking-wide mb-10">
            Fully local-first · Nothing leaves your device
          </p>

          {/* Demo video */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-[0.6rem] uppercase tracking-[4px] text-white/30">See it in action</p>
            <div className="max-w-[305px] w-full rounded-2xl overflow-hidden border border-white/10 bg-white/5" style={{ maxHeight: 'calc(100svh - 200px)' }}>
              <video
                src="/demo.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-auto h-full object-contain mx-auto block"
                style={{ maxHeight: 'calc(100svh - 200px)' }}
              />
            </div>
          </div>
        </div>
      </FadeIn>

      {/* How it works */}
      <div className="max-w-lg mx-auto px-6 text-center">
        <p className="text-[0.65rem] uppercase tracking-[4px] text-white/40 mb-10">How I work</p>
        <div className="space-y-0 mb-0">
          {steps.map((s) => (
            <div key={s.n} className="py-6 border-b border-white/5 last:border-0">
              <span className="block text-[0.65rem] text-white/40 tracking-widest mb-2">{s.n}</span>
              <p className="text-sm font-semibold text-white mb-1">{s.title}</p>
              <p className="text-xs text-white/60 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 py-10">
        <div className="flex-1 border-t border-white/5" />
        <StarEight className="w-2.5 h-2.5 text-white/20 shrink-0" />
        <div className="flex-1 border-t border-white/5" />
      </div>

      {/* What I can do */}
      <div className="max-w-lg mx-auto px-6 text-center">
        <p className="text-[0.65rem] uppercase tracking-[4px] text-white/40 mb-10">What I handle</p>
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <p className="text-[0.6rem] uppercase tracking-[3px] text-white/35 mb-4">Money</p>
            <ul className="space-y-2.5">
              {moneyFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-[5px] w-1 h-1 rounded-full bg-white/30 shrink-0" />
                  <span className="text-xs text-white/70 leading-snug">{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <p className="text-[0.6rem] uppercase tracking-[3px] text-white/35 mb-4">Life</p>
            <ul className="space-y-2.5">
              {lifeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-[5px] w-1 h-1 rounded-full bg-white/30 shrink-0" />
                  <span className="text-xs text-white/70 leading-snug">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 py-10">
        <div className="flex-1 border-t border-white/5" />
        <StarEight className="w-2.5 h-2.5 text-white/20 shrink-0" />
        <div className="flex-1 border-t border-white/5" />
      </div>

      {/* Examples */}
      <div className="max-w-lg mx-auto px-6 pb-0 border-b border-white/5 text-center">
        <h2 className="text-xl font-bold text-white mb-8 font-[family-name:var(--font-playfair)]">
          Simply tell me what you need.
        </h2>
        <div className="space-y-2">
          {examples.map((ex) => (
            <div key={ex} className="py-3 border-b border-white/5">
              <p className="text-sm text-white/70 italic">&ldquo;{ex}&rdquo;</p>
            </div>
          ))}
        </div>
      </div>

      {/* Closing CTA */}
      <div className="max-w-lg mx-auto px-6 pt-12 pb-16 text-center">
        <h2 className="text-2xl font-bold text-white mb-4 font-[family-name:var(--font-playfair)]">Ready to free yourself of chaos?</h2>
        <p className="text-sm text-white/50 mb-10">Nothing to configure. Just talk.</p>
        <div className="flex flex-col items-center gap-3">
          {closingCta}
        </div>
        <p className="text-[0.6rem] text-white/25 mt-10">
          Fully local-first · Nothing leaves your device
        </p>
      </div>

      <Footer />
    </div>
  );
}
