"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UpgradePlansGrid } from "@/components/upgrade-plans-grid";
import { useSubscription } from "@/lib/use-subscription";

export default function UpgradePage() {
  const { sub } = useSubscription();

  const subtitle =
    sub?.plan === "past_due"
      ? "Update your subscription to restore access."
      : sub?.plan === "free" || sub?.plan === "trial"
        ? "Choose a plan to unlock your Life OS concierge."
        : "Change plan or billing — checkout opens in Stripe.";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-black">
      <div className="max-w-6xl mx-auto w-full px-4 py-8 pb-16">
        <Link
          href="/home"
          className="inline-flex items-center gap-2 text-sm text-white/45 hover:text-white/70 transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to Orryon
        </Link>

        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-white font-[family-name:var(--font-playfair)] mb-2">
            Upgrade your plan
          </h1>
          <p className="text-white/50 text-sm sm:text-base max-w-xl">{subtitle}</p>
        </div>

        <UpgradePlansGrid />

        <p className="mt-10 text-center text-white/35 text-xs">
          Payments are processed securely by Stripe.{" "}
          <Link href="/pricing" className="underline underline-offset-2 hover:text-white/50">
            Compare plans on the public pricing page
          </Link>
        </p>
      </div>
    </div>
  );
}
