"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasToken } from "@/lib/api";
import { FadeIn } from "@/components/motion";

const steps = [
  { n: "1", title: "Just tell me what you need", desc: "Speak naturally — \"Add coffee $9.50\", \"Save $4000 for vacation by December\", or \"Doctor appointment Tuesday 10am\"." },
  { n: "2", title: "I understand and take action", desc: "I handle the details — adding expenses, updating your schedule, tracking goals, and keeping your daily life organized." },
  { n: "3", title: "Everything updates automatically", desc: "Your Dashboard, Budget, Forecast, Schedule, and Goals stay perfectly in sync in real time." },
  { n: "4", title: "Ask anything, get real answers", desc: "\"How much did I spend on dining this week?\" I give you clear, helpful answers from your actual data." },
];

const examples = [
  "Add coffee and breakfast $9.50",
  "Help me save $4000 for a vacation by December",
  "Add milk, eggs, bread, and chicken to my grocery list",
  "Doctor appointment on July 15 at 10am",
  "Give me a spending recap for this week",
];

const features = [
  { icon: "💳", label: "Budget & expense tracking" },
  { icon: "🎯", label: "Savings goals with progress" },
  { icon: "📅", label: "Schedule, tasks & grocery list" },
  { icon: "📊", label: "Smart spending recaps" },
  { icon: "✦", label: "Your intelligent personal concierge, always ready" },
];

export default function LandingPage() {
  const router = useRouter();
  useEffect(() => {
    if (hasToken()) router.replace("/home");
  }, [router]);

  return (
    <div className="min-h-screen bg-black">
      {/* Top nav */}
      <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
        <Link href="/login" className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:border-white/60 transition">
          Sign in
        </Link>
        <Link href="/login" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 transition">
          Sign up
        </Link>
      </div>

      {/* Hero */}
      <FadeIn>
        <div className="flex flex-col items-center text-center pt-24 px-4">
          <Image src="/avatar.png" alt="orryon" width={82} height={82} className="rounded-full object-cover mb-4" />
          <h1 className="text-[2.5rem] font-extrabold tracking-[4px] uppercase text-white mb-1 font-[family-name:var(--font-playfair)]">orryon</h1>
          <p className="text-base font-semibold text-white/70 mb-2 font-[family-name:var(--font-playfair)]">Your intelligent personal concierge</p>
          <p className="text-sm text-white/35 max-w-xs leading-relaxed mb-8">
            Whether you&apos;re tracking expenses, planning your week, working toward your goals, or organizing daily life, I&apos;ve got you covered.
          </p>
        </div>
      </FadeIn>

      {/* How it works */}
      <div className="max-w-md mx-auto px-4 mt-8">
        <p className="text-[0.65rem] uppercase tracking-[2px] text-white/25 text-center mb-4">How it works</p>
        <h2 className="text-xl font-extrabold text-white mb-4">Your all-in-one intelligent personal concierge</h2>
        {steps.map((s) => (
          <div key={s.n} className="flex items-start gap-3 py-3 border-b border-white/5">
            <div className="shrink-0 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-white">{s.n}</div>
            <div>
              <p className="text-[0.92rem] font-bold text-white">{s.title}</p>
              <p className="text-[0.8rem] text-white/40 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Examples */}
      <div className="max-w-md mx-auto px-4 mt-14">
        <p className="text-[0.65rem] uppercase tracking-[2px] text-white/25 text-center mb-4">Real examples</p>
        <h2 className="text-xl font-extrabold text-white mb-1">Here&apos;s what you can ask me</h2>
        <p className="text-sm text-white/35 mb-5">No commands to learn. Just type like you&apos;re texting a friend.</p>
        {examples.map((ex) => (
          <div key={ex} className="bg-[#0f0f0f] border border-white/[0.07] rounded-xl px-4 py-3 text-sm text-gray-200 mb-2 leading-snug">
            &ldquo;{ex}&rdquo;
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="max-w-md mx-auto px-4 mt-14 text-center">
        <h2 className="text-xl font-extrabold text-white mb-1">You&apos;re ready to start</h2>
        <p className="text-sm text-white/35 mb-6">Free forever. All your data stays private on your device.</p>
        {features.map((f) => (
          <div key={f.label} className="flex items-center gap-3 py-2 border-b border-white/5 text-sm text-white/55">
            <span className="text-base w-6 text-center">{f.icon}</span>
            <span>{f.label}</span>
          </div>
        ))}
        <div className="mt-6">
          <Link href="/login" className="block w-full rounded-full bg-white text-black py-3 text-base font-bold hover:bg-gray-200 transition text-center">
            Create free account →
          </Link>
        </div>
        <p className="text-[0.68rem] text-white/15 mt-6 mb-8">
          orryon v2.0 · Not financial advice. All data stays local.
        </p>
      </div>
    </div>
  );
}
