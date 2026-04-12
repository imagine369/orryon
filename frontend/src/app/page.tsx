"use client";

import Image from "next/image";
import Link from "next/link";
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
  "Schedule, tasks & grocery list",
  "Receipt scanning",
];

const capabilities = [
  "Budget & expenses",
  "Savings goals",
  "Schedule & tasks",
  "Receipt scanning",
  "Smart recaps",
  "Bills tracker",
];

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(hasToken());
  }, []);

  const ctaButtons = loggedIn ? (
    <PillLink href="/home">Go to app</PillLink>
  ) : (
    <>
      <PillLink href="/login" variant="primary">Sign up</PillLink>
      <Link href="/login" className="text-xs text-white/40 hover:text-white/70 transition-colors mt-1">
        Already have an account? Sign in
      </Link>
    </>
  );

  return (
    <div className="min-h-screen bg-black text-white">

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <span className="text-white font-extrabold tracking-widest uppercase text-[1.03rem] font-[family-name:var(--font-playfair)]">
          ORRYON
        </span>
        <div className="flex items-center gap-3">
          <PillLink href="/login" variant="secondary" size="sm">Sign in</PillLink>
          <PillLink href="/login" variant="primary" size="sm">Sign up</PillLink>
        </div>
      </nav>

      {/* Hero */}
      <FadeIn>
        <div className="flex flex-col items-center text-center pt-[200px] pb-16 px-6 border-b border-white/5">
          <Image src="/avatar.png" alt="Orryon AI personal concierge" width={91} height={91} className="rounded-full object-cover mb-8" />
          <p className="text-[0.65rem] uppercase tracking-[4px] text-white/45 mb-5">Your intelligent personal concierge</p>
          <h1 className="text-[2.4rem] font-extrabold text-white mb-5 font-[family-name:var(--font-playfair)] leading-tight max-w-sm">
            Everything organized —<br />just by talking.
          </h1>
          <p className="text-sm text-white/65 max-w-xs leading-relaxed mb-10">
            Track expenses, plan your week, work toward goals, and manage daily life. No forms. No menus. Just say what you need.
          </p>
          <div className="flex flex-col items-center gap-3">
            {ctaButtons}
          </div>
        </div>
      </FadeIn>

      {/* Capability bar */}
      <div className="border-b border-white/5 py-5 px-6">
        <div className="flex items-center justify-center gap-2 flex-wrap max-w-lg mx-auto">
          {capabilities.map((cap) => (
            <span key={cap} className="text-[0.65rem] uppercase tracking-[2px] text-white/35 px-3 py-1 border border-white/10 rounded-full whitespace-nowrap">
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-lg mx-auto px-6 py-16 border-b border-white/5 text-center">
        <p className="text-[0.65rem] uppercase tracking-[4px] text-white/40 mb-10">How it works</p>
        <div className="space-y-0 mb-12">
          {steps.map((s) => (
            <div key={s.n} className="py-6 border-b border-white/5 last:border-0">
              <span className="block text-[0.65rem] text-white/35 tracking-widest mb-2">{s.n}</span>
              <p className="text-sm font-semibold text-white mb-1">{s.title}</p>
              <p className="text-xs text-white/55 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-center">
          {loggedIn ? (
            <PillLink href="/home">Go to app</PillLink>
          ) : (
            <PillLink href="/login" variant="primary">Sign up</PillLink>
          )}
        </div>
      </div>

      {/* Examples */}
      <div className="max-w-lg mx-auto px-6 py-16 border-b border-white/5 text-center">
        <p className="text-[0.65rem] uppercase tracking-[4px] text-white/40 mb-3">Real examples</p>
        <h2 className="text-xl font-bold text-white mb-2 font-[family-name:var(--font-playfair)]">You don&apos;t need to learn commands</h2>
        <p className="text-xs text-white/50 mb-8">Just type like you&apos;re texting a friend.</p>
        <div className="space-y-2">
          {examples.map((ex) => (
            <div key={ex} className="py-3 border-b border-white/5">
              <p className="text-sm text-white/70 italic">&ldquo;{ex}&rdquo;</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="max-w-lg mx-auto px-6 py-16 border-b border-white/5">
        <p className="text-[0.65rem] uppercase tracking-[4px] text-white/40 mb-3 text-center">What&apos;s included</p>
        <h2 className="text-xl font-bold text-white mb-8 font-[family-name:var(--font-playfair)] text-center">Everything you need, nothing you don&apos;t</h2>

        <div className="mb-10 text-center">
          <p className="text-[0.65rem] uppercase tracking-[3px] text-white/30 mb-4">Money</p>
          <div className="space-y-0 mb-8">
            {moneyFeatures.map((f) => (
              <div key={f} className="py-3 border-b border-white/5">
                <span className="text-sm text-white/65">{f}</span>
              </div>
            ))}
          </div>
          <p className="text-[0.65rem] uppercase tracking-[3px] text-white/30 mb-4">Life</p>
          <div className="space-y-0">
            {lifeFeatures.map((f) => (
              <div key={f} className="py-3 border-b border-white/5">
                <span className="text-sm text-white/65">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-white/10 rounded-xl px-5 py-4 text-center">
          <p className="text-xs text-white/55 leading-relaxed">
            <span className="text-white/80 font-medium">Private by default.</span>{" "}
            Your data stays on your device. Nothing is shared or sold.
          </p>
        </div>
      </div>

      {/* Closing CTA */}
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <h2 className="text-xl font-bold text-white mb-3 font-[family-name:var(--font-playfair)]">Ready to simplify your life?</h2>
        <p className="text-xs text-white/45 mb-8">Your personal concierge, always on hand.</p>
        <div className="flex flex-col items-center gap-3">
          {ctaButtons}
        </div>
        <p className="text-[0.6rem] text-white/20 mt-10">
          Not financial advice. All data stays local on your device.
        </p>
      </div>

      <Footer />
    </div>
  );
}
