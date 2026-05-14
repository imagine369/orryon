"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Wind, Sparkles, Zap } from "lucide-react";
import { Footer } from "@/components/footer";
import { PillLink } from "@/components/pill-cta";
import { RESET_ANCHORS } from "@/lib/reset-scripts";

type Billing = "monthly" | "annual";

const STARTER_FEATURES = [
  "Guided breathing sessions",
  ...RESET_ANCHORS.map((a) => a.title),
  "Breathe orb (always free)",
] as const;

const TIERS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Guided breathing. Forever free.",
    monthlyPrice: 0,
    annualTotal: 0,
    annualMonthly: 0,
    icon: Wind,
    iconColor: "text-teal-400",
    accentBg: "rgba(20,184,166,0.08)",
    accentBorder: "rgba(20,184,166,0.18)",
    popular: false,
    cta: "Start for free",
    ctaHref: "/login?step=email",
    features: [...STARTER_FEATURES],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "All-in-One Life Concierge",
    monthlyPrice: 22,
    annualTotal: 198,
    annualMonthly: 16.50,
    icon: Sparkles,
    iconColor: "text-purple-400",
    accentBg: "rgba(168,85,247,0.08)",
    accentBorder: "rgba(168,85,247,0.20)",
    popular: true,
    cta: "Start 14-day trial",
    ctaHref: "/login?step=email",
    features: [
      "Personal AI concierge (text & voice)",
      "Budget tracking & spending insights",
      "Health vitals, medications & appointments",
      "Location intelligence & commute awareness",
      "Daily morning briefing",
      "Email bill detection",
      "Calendar, tasks & reminders",
      "Cash flow forecast",
      "300 voice minutes / month",
      "3,000 chat messages / month",
      "Full data export",
      "Heavy usage handling: Hard limits + upgrade prompts",
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
    ctaHref: "/login?step=email",
    features: [
      "Everything in Pro",
      "Unlimited chat messages (subject to Fair Usage Policy)",
      "650 voice minutes / month",
      "Long-term memory (persistent context)",
      "Proactive suggestions & smart briefings",
      "Golden Mode (easy-read UI)",
      "Priority AI processing",
      "Live Orryon: Full access",
      "Live Orryon Calls: Full",
      "Heavy usage handling: Upgrade prompts near limits",
    ],
  },
  {
    id: "premium_plus",
    name: "Premium Plus",
    tagline: "Your all-in-one personal concierge — maximum voice, full power.",
    monthlyPrice: 49,
    annualTotal: 441,
    annualMonthly: 36.75,
    icon: Zap,
    iconColor: "text-sky-400",
    accentBg: "rgba(56,189,248,0.06)",
    accentBorder: "rgba(56,189,248,0.18)",
    popular: false,
    cta: "Get Premium Plus",
    ctaHref: "/login?step=email",
    features: [
      "Everything in Premium",
      "1,200 voice minutes / month",
      "Approval gate for sensitive actions",
      "Dedicated priority support",
      "Early access to new features",
      "Live Orryon: Full + Priority + Faster",
      "Live Orryon Calls: Full + Priority",
      "Heavy usage handling: Progressive slowdown + notice",
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
          <h1 className="text-[1.6rem] sm:text-2xl lg:text-4xl font-bold text-white/85 mb-4 font-[family-name:var(--font-playfair)] leading-[1.25]">
            Pricing
          </h1>
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
                className="rounded-full px-6 py-2.5 text-base font-medium transition-all duration-200 flex items-center gap-2"
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

        {/* Cards grid — 2 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            const isFree = tier.monthlyPrice === 0;
            const displayPrice = isFree
              ? "Free"
              : billing === "monthly"
              ? `$${tier.monthlyPrice}`
              : `$${tier.annualMonthly.toFixed(2).replace(/\.00$/, "")}`;

            return (
              <div
                key={tier.id}
                className="relative flex flex-col rounded-2xl p-7"
                style={{
                  background: tier.popular
                    ? "linear-gradient(160deg, rgba(168,85,247,0.12) 0%, rgba(255,255,255,0.03) 100%)"
                    : "rgba(255,255,255,0.025)",
                  border: `1px solid ${tier.popular ? "rgba(168,85,247,0.30)" : "rgba(255,255,255,0.07)"}`,
                }}
              >
                {tier.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span
                      className="text-xs uppercase tracking-widest font-semibold px-4 py-1 rounded-full"
                      style={{ background: "rgba(168,85,247,0.25)", color: "rgba(192,132,252,0.95)", border: "1px solid rgba(168,85,247,0.30)" }}
                    >
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Icon + name row */}
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                    style={{ background: tier.accentBg, border: `1px solid ${tier.accentBorder}` }}
                  >
                    <Icon className={`w-5 h-5 ${tier.iconColor}`} strokeWidth={1.5} />
                  </div>
                  <p className="text-white font-bold text-xl">{tier.name}</p>
                </div>

                {/* Tagline */}
                <p className="text-white/50 text-sm leading-relaxed mb-6">{tier.tagline}</p>

                {/* Price block */}
                <div className="mb-6">
                  <div className="flex items-end gap-1.5">
                    <span className="text-white font-bold" style={{ fontSize: "2.75rem", lineHeight: 1 }}>
                      {displayPrice}
                    </span>
                    {!isFree && (
                      <span className="text-white/45 text-lg mb-1.5">/mo</span>
                    )}
                  </div>

                  {/* Annual billing line — prominent */}
                  {!isFree && billing === "annual" && (
                    <p className="text-white/60 text-sm mt-2 font-medium">
                      ${tier.annualTotal} billed annually · save 25%
                    </p>
                  )}
                  {!isFree && billing === "monthly" && (
                    <p className="text-white/45 text-sm mt-2">
                      or ${tier.annualMonthly.toFixed(2).replace(/\.00$/, "")}/mo · billed ${tier.annualTotal}/yr
                    </p>
                  )}
                  {isFree && (
                    <p className="text-white/40 text-sm mt-2">No credit card required</p>
                  )}
                </div>

                {/* CTA */}
                <Link
                  href={tier.monthlyPrice === 0 ? tier.ctaHref : `/login?tier=${tier.id}&plan=${billing}`}
                  className="block text-center rounded-xl py-3 text-base font-semibold transition-all duration-200 mb-7"
                  style={
                    tier.popular
                      ? { background: "rgba(168,85,247,0.25)", color: "rgba(216,180,254,0.95)", border: "1px solid rgba(168,85,247,0.35)" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.10)" }
                  }
                >
                  {tier.cta}
                </Link>

                {/* Divider */}
                <div className="border-t mb-6" style={{ borderColor: "rgba(255,255,255,0.06)" }} />

                {/* Features */}
                <ul className="space-y-3 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-white/65 leading-snug">
                      <Check className="w-4 h-4 text-white/35 shrink-0 mt-0.5" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* FAQ / bottom nudge */}
        <div className="mt-14 text-center">
          <p className="text-white/40 text-base">
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
