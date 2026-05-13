"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Wind, Sparkles, Zap } from "lucide-react";
import { Footer } from "@/components/footer";
import { PillLink } from "@/components/pill-cta";

type Billing = "monthly" | "annual";

const TIERS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Breathing & meditation. Forever free.",
    monthlyPrice: 0,
    annualTotal: 0,
    annualMonthly: 0,
    icon: Wind,
    iconColor: "text-teal-400",
    accentBg: "rgba(20,184,166,0.08)",
    accentBorder: "rgba(20,184,166,0.18)",
    popular: false,
    cta: "Start for free",
    ctaHref: "/login",
    features: [
      "Guided breathing sessions",
      "Meditation exercises",
      "Breathe orb (always free)",
      "Basic AI chat",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Full money management + AI concierge.",
    monthlyPrice: 22,
    annualTotal: 198,
    annualMonthly: 16.50,
    icon: Sparkles,
    iconColor: "text-purple-400",
    accentBg: "rgba(168,85,247,0.08)",
    accentBorder: "rgba(168,85,247,0.20)",
    popular: true,
    cta: "Start 14-day trial",
    ctaHref: "/login?step=tiers",
    features: [
      "Personal AI concierge (text & voice)",
      "Budget tracking & spending insights",
      "Health vitals, medications & appointments",
      "Location intelligence & commute awareness",
      "Daily morning briefing",
      "Email bill detection",
      "Calendar, tasks & reminders",
      "Cash flow forecast",
      "150 voice minutes / month",
      "On-demand voice top-ups ($6 / 60 min)",
      "500 chat messages / month",
      "Full data export",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Unlimited AI + long-term memory.",
    monthlyPrice: 33,
    annualTotal: 297,
    annualMonthly: 24.75,
    icon: Zap,
    iconColor: "text-amber-400",
    accentBg: "rgba(251,191,36,0.06)",
    accentBorder: "rgba(251,191,36,0.18)",
    popular: false,
    cta: "Get Premium",
    ctaHref: "/login?step=tiers",
    features: [
      "Everything in Pro",
      "Unlimited chat messages",
      "350 voice minutes / month",
      "Long-term memory (persistent context)",
      "Proactive suggestions & smart briefings",
      "Golden Mode (senior-friendly UI)",
      "Priority AI processing",
    ],
  },
  {
    id: "premium_plus",
    name: "Premium Plus",
    tagline: "Maximum voice, approval gate & priority support.",
    monthlyPrice: 44,
    annualTotal: 396,
    annualMonthly: 33,
    icon: Zap,
    iconColor: "text-sky-400",
    accentBg: "rgba(56,189,248,0.06)",
    accentBorder: "rgba(56,189,248,0.18)",
    popular: false,
    cta: "Get Premium Plus",
    ctaHref: "/login?step=tiers",
    features: [
      "Everything in Premium",
      "600 voice minutes / month",
      "Approval gate for sensitive actions",
      "Dedicated priority support",
      "Early access to new features",
    ],
  },
] as const;

function SaveBadge() {
  return (
    <span
      className="inline-block text-[0.55rem] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold"
      style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.65)" }}
    >
      Save 25%
    </span>
  );
}

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080c10" }}>
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <Link href="/" className="text-white/80 text-sm font-semibold tracking-wide hover:text-white transition-colors">
          Orryon
        </Link>
        <Link href="/login" className="text-white/50 text-sm hover:text-white/80 transition-colors">
          Sign in
        </Link>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 pb-24 w-full">

        {/* Hero */}
        <div className="text-center pt-16 pb-12">
          <p
            className="mb-4"
            style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "4px", color: "rgba(255,255,255,.35)" }}
          >
            Pricing
          </p>
          <h1
            className="font-[family-name:var(--font-playfair)] text-white mb-4"
            style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 700, lineHeight: 1.1 }}
          >
            Simple, honest pricing
          </h1>
          <p className="text-white/50 text-base max-w-md mx-auto leading-relaxed">
            Breathing and meditation are free for everyone, always.
            Unlock the full AI experience with a paid plan.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div
            className="flex rounded-full p-0.5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {(["monthly", "annual"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setBilling(opt)}
                className="rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2"
                style={{
                  background: billing === opt ? "rgba(255,255,255,0.10)" : "transparent",
                  color: billing === opt ? "white" : "rgba(255,255,255,0.42)",
                }}
              >
                {opt === "monthly" ? "Monthly" : (
                  <span className="flex items-center gap-2">Annual <SaveBadge /></span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            const isFree = tier.monthlyPrice === 0;
            const displayPrice = isFree
              ? "Free"
              : billing === "monthly"
              ? `$${tier.monthlyPrice}`
              : `$${tier.annualMonthly.toFixed(2).replace(/\.00$/, "")}`;
            const subPrice = !isFree && billing === "annual"
              ? `$${tier.annualTotal}/yr`
              : null;

            return (
              <div
                key={tier.id}
                className="relative flex flex-col rounded-2xl p-6"
                style={{
                  background: tier.popular
                    ? "linear-gradient(160deg, rgba(168,85,247,0.12) 0%, rgba(255,255,255,0.03) 100%)"
                    : "rgba(255,255,255,0.025)",
                  border: `1px solid ${tier.popular ? "rgba(168,85,247,0.30)" : "rgba(255,255,255,0.07)"}`,
                }}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span
                      className="text-[0.6rem] uppercase tracking-widest font-semibold px-3 py-1 rounded-full"
                      style={{ background: "rgba(168,85,247,0.25)", color: "rgba(192,132,252,0.95)", border: "1px solid rgba(168,85,247,0.30)" }}
                    >
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Icon */}
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-xl mb-4"
                  style={{ background: tier.accentBg, border: `1px solid ${tier.accentBorder}` }}
                >
                  <Icon className={`w-4 h-4 ${tier.iconColor}`} strokeWidth={1.5} />
                </div>

                {/* Name + tagline */}
                <p className="text-white font-semibold text-base mb-1">{tier.name}</p>
                <p className="text-white/40 text-xs leading-snug mb-5">{tier.tagline}</p>

                {/* Price */}
                <div className="mb-5">
                  <div className="flex items-end gap-1">
                    <span className="text-white font-bold" style={{ fontSize: "2rem", lineHeight: 1 }}>
                      {displayPrice}
                    </span>
                    {!isFree && (
                      <span className="text-white/35 text-sm mb-1">/mo</span>
                    )}
                  </div>
                  {subPrice && (
                    <p className="text-white/30 text-xs mt-1">{subPrice} billed annually</p>
                  )}
                  {isFree && (
                    <p className="text-white/30 text-xs mt-1">No credit card required</p>
                  )}
                  {!isFree && billing === "monthly" && (
                    <p className="text-white/25 text-xs mt-1">
                      or ${tier.annualMonthly.toFixed(2).replace(/\.00$/, "")}/mo billed annually
                    </p>
                  )}
                </div>

                {/* CTA */}
                <Link
                  href={tier.ctaHref}
                  className="block text-center rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 mb-6"
                  style={
                    tier.popular
                      ? { background: "rgba(168,85,247,0.25)", color: "rgba(216,180,254,0.95)", border: "1px solid rgba(168,85,247,0.35)" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.10)" }
                  }
                >
                  {tier.cta}
                </Link>

                {/* Divider */}
                <div className="border-t mb-5" style={{ borderColor: "rgba(255,255,255,0.06)" }} />

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-xs text-white/60 leading-snug">
                      <Check className="w-3 h-3 text-white/30 shrink-0 mt-0.5" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Free breathe reassurance */}
        <div
          className="mt-10 flex items-start gap-4 rounded-2xl px-6 py-5 max-w-xl mx-auto"
          style={{ background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.14)" }}
        >
          <Wind className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-semibold text-white/80 mb-1">Breathing stays free. Forever.</p>
            <p className="text-xs text-white/45 leading-relaxed">
              We believe tools that support breathing, meditation, and human wellbeing should be
              available to everyone — no account tier, no credit card, no strings attached.
            </p>
          </div>
        </div>

        {/* FAQ / bottom nudge */}
        <div className="mt-14 text-center">
          <p className="text-white/35 text-sm">
            Questions?{" "}
            <Link href="/contact" className="underline underline-offset-2 hover:text-white/60 transition-colors">
              Contact us
            </Link>{" "}
            or read our{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-white/60 transition-colors">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-white/60 transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
