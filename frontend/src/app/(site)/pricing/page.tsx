"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SiteNav, SignInNavLink } from "@/components/site-nav";
import { PricingTierCard } from "@/components/pricing-tier-card";
import { PRICING_TIERS } from "@/lib/pricing-tiers";
import { useAuth } from "@/lib/auth-context";

export default function PricingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Hybrid: signed-in users upgrade in-app, not on the marketing page
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/home");
    }
  }, [authLoading, user, router]);

  if (authLoading || user) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[40vh] bg-[#080c10]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1" style={{ background: "#080c10" }}>
      <SiteNav>
        <SignInNavLink />
      </SiteNav>

      <main className="flex-1 max-w-6xl mx-auto px-4 pb-24 w-full">
        <div className="text-center pt-16 pb-12">
          <h1 className="text-[1.6rem] sm:text-2xl lg:text-4xl font-bold text-white/85 mb-4 font-[family-name:var(--font-playfair)] leading-[1.25]">
            Free, forever
          </h1>
          <p className="text-white/45 text-sm max-w-lg mx-auto">
            Orryon does not charge. Self-host or{" "}
            <Link href="/download" className="underline underline-offset-2 hover:text-white/70">
              download the app
            </Link>
            , then paste your own Grok key from{" "}
            <a
              href="https://console.x.ai"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-white/70"
            >
              console.x.ai
            </a>
            . Source is on{" "}
            <a
              href="https://github.com/imagine369/orryon"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-white/70"
            >
              GitHub
            </a>
            .
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {PRICING_TIERS.map((tier) => (
            <PricingTierCard key={tier.id} tier={tier} context="marketing" />
          ))}
        </div>

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
    </div>
  );
}
