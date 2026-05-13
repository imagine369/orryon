"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import { X, Check, RotateCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/footer";
import { PillButton } from "@/components/pill-cta";

// Per-tier price IDs (Pro / Premium / Premium Plus)
const PRICE_IDS: Record<Tier, Record<"monthly" | "annual", string>> = {
  pro: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "",
    annual:  process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL  || "",
  },
  premium: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY || "",
    annual:  process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_ANNUAL  || "",
  },
  premium_plus: {
    monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_PLUS_MONTHLY || "",
    annual:  process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_PLUS_ANNUAL  || "",
  },
};

type Tier = "pro" | "premium" | "premium_plus";

const TIER_CONFIG: {
  id: Tier;
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  annualTotal: number;
  voiceMinutes: number;
  chatMessages: string;
  features: string[];
}[] = [
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 22,
    annualMonthlyPrice: 16.50,
    annualTotal: 198,
    voiceMinutes: 150,
    chatMessages: "500 messages/mo",
    features: [
      "Personal AI concierge (text & voice)",
      "Health vitals, medications & appointments",
      "Location intelligence & commute awareness",
      "Daily briefing — morning summary",
      "Email bill detection",
      "Budget tracking & spending insights",
      "Calendar, tasks & reminders",
      "150 voice minutes included",
      "On-demand voice top-ups ($6 / 60 min)",
      "Full data export",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: 33,
    annualMonthlyPrice: 24.75,
    annualTotal: 297,
    voiceMinutes: 350,
    chatMessages: "Unlimited messages",
    features: [
      "Everything in Pro",
      "Unlimited chat messages",
      "350 voice minutes included",
      "Long-term memory (persistent context)",
      "Proactive suggestions & smart briefings",
      "Golden Mode (senior-friendly UI)",
      "Priority AI processing",
    ],
  },
  {
    id: "premium_plus",
    name: "Premium Plus",
    monthlyPrice: 44,
    annualMonthlyPrice: 33,
    annualTotal: 396,
    voiceMinutes: 600,
    chatMessages: "Unlimited messages",
    features: [
      "Everything in Premium",
      "600 voice minutes included",
      "Approval gate for sensitive actions",
      "Dedicated priority support",
      "Early access to new features",
    ],
  },
];

type Step = "breathe" | "tiers" | "email" | "code" | "name";

// Beta flag — set NEXT_PUBLIC_NO_CARD_TRIAL=true to skip Stripe at signup
const NO_CARD_TRIAL: boolean =
  (process.env.NEXT_PUBLIC_NO_CARD_TRIAL || "").toLowerCase() === "true";

function LoginPageInner() {
  const router = useRouter();
  const { login, user: authedUser } = useAuth();
  const searchParams = useNextSearchParams();

  const flow       = searchParams.get("flow");
  const stepParam  = searchParams.get("step");
  const planParam  = searchParams.get("plan");
  const nextParam  = searchParams.get("next") || "/home";

  const [breatheFlow, setBreatheFlow] = useState(flow === "breathe");
  const [step, setStep] = useState<Step>(() => {
    if (flow === "breathe") return "breathe";
    if (stepParam === "email") return "email";
    return "tiers";
  });

  useEffect(() => {
    if (flow === "breathe") {
      setBreatheFlow(true);
      setStep((s) => (s === "email" ? "breathe" : s));
    }
  }, [flow]);

  const [selectedTier, setSelectedTier] = useState<Tier>("premium");
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">(planParam === "annual" ? "annual" : "monthly");
  const [freeSelected, setFreeSelected] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [authUser, setAuthUser] = useState<{ id: string; email: string; display_name: string } | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(true);
  const [resendCountdown, setResendCountdown] = useState(0);

  const sendCode = async (targetEmail?: string) => {
    const val = (targetEmail ?? email).trim().toLowerCase();
    if (!val || !val.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (breatheFlow && !displayName.trim()) {
      setError("Please enter your name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ sent: boolean; dev_code: string; smtp_configured: boolean }>("/api/auth/send-code", {
        email: val,
        ...(breatheFlow ? { free_breathing_signup: true } : {}),
      });
      setDevCode(res.sent ? "" : res.dev_code);
      setSmtpConfigured(res.smtp_configured);
      setStep("code");
      setResendCountdown(30);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = () => sendCode();

  const handleResend = () => {
    if (resendCountdown > 0) return;
    setCode("");
    sendCode(email);
  };

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const handleVerify = async () => {
    if (!code.trim() || code.trim().length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // We use raw fetch here (rather than the api.ts wrapper) so we can
      // inspect the response status and Set-Cookie behaviour directly.
      // The api.ts wrapper would mask a 401 as a generic Unauthorized,
      // which is exactly what we *don't* want at the moment of sign-in.
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
          ...(breatheFlow ? { free_breathing_signup: true } : {}),
        }),
      });

      const payload = (await resp.json().catch(() => ({}))) as {
        user?: { id: string; email: string; display_name: string };
        detail?: string;
      };

      if (!resp.ok) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[login] verify failed", resp.status, payload);
        }
        // 429 = OTP lockout; surface a friendlier message
        const detail = payload.detail || `Sign in failed (${resp.status}).`;
        setError(
          resp.status === 429
            ? "Too many attempts — please wait 15 minutes, then request a fresh code."
            : detail
        );
        setLoading(false);
        return;
      }

      if (!payload.user) {
        setError("Sign in succeeded but the server didn't return a user. Try again.");
        setLoading(false);
        return;
      }

      // Sanity-check the cookie actually landed before we navigate. If it
      // didn't (e.g. SameSite/Secure misconfig, mixed origin, browser
      // blocking third-party cookies on the dev port, etc.), kicking the
      // user to /home would just bounce them straight back here.
      const hasSignal =
        typeof document !== "undefined" &&
        /(?:^|;\s*)orryon_auth=1/.test(document.cookie);

      if (!hasSignal) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error(
            "[login] /api/auth/login returned 200 but no orryon_auth cookie was set. " +
              "document.cookie = ", document.cookie,
          );
        }
        setError(
          "Signed in, but your browser didn't accept the session cookie. " +
            "Disable any cookie/tracking blocker for this site and try again.",
        );
        setLoading(false);
        return;
      }

      setAuthUser(payload.user);
      setDisplayName(payload.user.display_name || "");
      login(payload.user);
      // Hard navigation so the freshly-set HttpOnly session cookie is in
      // place for the very first request /home makes — a soft router.push
      // has, in practice, raced ahead of the cookie write.
      window.location.assign(nextParam);
    } catch (e: unknown) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("[login] verify threw", e);
      }
      const msg = e instanceof Error ? e.message : "";
      setError(msg || "Couldn't reach the server. Please try again.");
      setLoading(false);
    }
  };

  // Already signed-in users clicking "Upgrade" land here: skip email/code
  // and go straight to Stripe with the selected tier.
  const handleUpgradeCheckout = async () => {
    if (freeSelected) {
      router.push("/home");
      return;
    }
    const priceId = PRICE_IDS[selectedTier][selectedPlan];
    if (!priceId) {
      setError("Stripe isn't configured for this tier yet.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const origin = window.location.origin;
      const data = await api.post<{ checkout_url: string }>(
        "/api/subscription/checkout",
        {
          price_id: priceId,
          success_url: `${origin}/home?upgraded=1`,
          cancel_url: `${origin}/login?step=tiers`,
        },
      );
      window.location.href = data.checkout_url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  };

  const handleStartTrial = async () => {
    const name = displayName.trim();
    if (!name) {
      setError("Please enter your name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const priceId = PRICE_IDS[selectedTier][selectedPlan];

      // Cookie was set by /api/auth/login during handleVerify; subsequent API
      // calls authenticate via that cookie automatically. A user who abandons
      // Stripe checkout will stay signed in as a free-tier user and hit the
      // server-enforced paywall on protected endpoints — the real gate.
      //
      // Beta bypass: when NO_CARD_TRIAL is set, skip the Stripe redirect
      // entirely. The user lands in /home with their 14-day trial active.
      // The paywall still fires on day 15 via the in-app TrialBanner's
      // upgrade button, which *does* hit Stripe Checkout — so this only
      // removes friction at the very front door, not the monetisation path.
      if (priceId && !NO_CARD_TRIAL) {
        const origin = window.location.origin;
        const data = await api.post<{ checkout_url: string }>(
          "/api/subscription/checkout",
          {
            price_id: priceId,
            success_url: `${origin}/home?upgraded=1`,
            cancel_url: `${origin}/login?step=tiers`,
          },
        );

        login({ ...authUser!, display_name: name });
        if (name !== authUser?.display_name) {
          api.patch("/api/settings", { display_name: name }).catch(() => {});
        }
        window.location.href = data.checkout_url;
        return;
      }

      // No Stripe configured → no paywall; just finish sign-in.
      login({ ...authUser!, display_name: name });
      if (name !== authUser?.display_name) {
        api.patch("/api/settings", { display_name: name }).catch(() => {});
      }
      router.push("/home");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-black" style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="px-4 pt-4 flex items-center justify-between shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          aria-label="Orryon home"
        >
          <Image
            src="/avatar.png"
            alt="Orryon"
            width={28}
            height={28}
            className="rounded-full object-cover ring-1 ring-white/10"
            priority
          />
          <span className="text-white font-extrabold tracking-widest uppercase text-sm font-[family-name:var(--font-playfair)]">
            ORRYON
          </span>
        </Link>
        <Link
          href="/"
          className="text-white/50 hover:text-white p-1"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </Link>
      </div>

      {/* ── Free breathing signup: name + email (skips waitlist on backend) ── */}
      {step === "breathe" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full px-4">
          <h1 className="text-2xl font-bold text-white mb-1 text-center font-[family-name:var(--font-playfair)]">
            Free breathing &amp; calm
          </h1>
          <p className="text-sm text-white/50 mb-6 text-center max-w-xs">
            Create a free account. We&rsquo;ll email a 6-digit code to sign you in.
          </p>
          <Input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendCode()}
            className="mb-3 bg-[#111] border-white/10 text-white"
            autoFocus
            autoComplete="name"
          />
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendCode()}
            className="mb-1 bg-[#111] border-white/10 text-white"
            autoComplete="email"
          />
          <p className="text-[0.7rem] text-white/30 mb-4 self-start">
            Works with Gmail · Outlook · iCloud · any email
          </p>
          {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
          <PillButton
            onClick={() => { void sendCode(); }}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Sending…" : "Send code"}
          </PillButton>
          <Link
            href="/"
            className="mt-5 w-full text-xs text-white/30 hover:text-white/60 uppercase tracking-[3px] transition-colors duration-200 text-center block"
          >
            &larr; Back to home
          </Link>
        </div>
      )}

      {/* ── Step 1: Plan selection ── */}
      {step === "tiers" && (
        <div className="flex-1 flex flex-col items-center px-5 pt-4 pb-10">
          <p className="text-[0.6rem] uppercase tracking-[4px] text-white/40 mb-2">Choose your plan</p>
          <h1 className="text-2xl font-bold text-white mb-1 font-[family-name:var(--font-playfair)] text-center">
            Your personal AI operator.
          </h1>
          <p className="text-sm text-white/40 mb-6 text-center">
            14-day free trial on monthly plans. Cancel anytime.
          </p>

          {/* Billing cycle toggle */}
          <div className="flex rounded-full border border-white/8 bg-[#111] p-0.5 mb-5 w-full max-w-xs">
            {(["monthly", "annual"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setSelectedPlan(opt)}
                className="flex-1 rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1.5 min-h-[44px]"
                style={{
                  background: selectedPlan === opt ? "rgba(255,255,255,0.1)" : "transparent",
                  color: selectedPlan === opt ? "white" : "rgba(255,255,255,0.35)",
                }}
              >
                {opt === "monthly" ? "Monthly" : (
                  <><span>Annual</span>
                    <span className="text-[0.55rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Save 25%</span>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Plan cards: Starter (free) first, then paid tiers */}
          <div className="w-full max-w-md space-y-3 mb-6">
            {/* Starter — free forever, no Stripe */}
            <button
              onClick={() => setFreeSelected(true)}
              className="w-full text-left rounded-2xl border transition-all duration-200 p-4"
              style={{
                borderColor: freeSelected ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)",
                background: freeSelected ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.01)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-white/90">Starter</p>
                    <span className="text-[0.5rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/10">Free forever</span>
                  </div>
                  <p className="text-xs text-white/35">Breathing exercises &amp; guided calm</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-white/70">Free</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
                {[
                  "Guided breathing exercises",
                  "Calm & meditation sessions",
                  "Works offline",
                  "Always free — no card needed",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-white/55">
                    <Check className="h-3 w-3 text-white/35 shrink-0 mt-0.5" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
            </button>

            {/* Pro, Premium, Premium Plus */}
            {TIER_CONFIG.map((tier) => {
              const isSelected = !freeSelected && selectedTier === tier.id;
              const priceLabel = selectedPlan === "annual"
                ? `$${tier.annualMonthlyPrice.toFixed(2)}/mo`
                : `$${tier.monthlyPrice}/mo`;
              return (
                <button
                  key={tier.id}
                  onClick={() => { setSelectedTier(tier.id); setFreeSelected(false); }}
                  className="w-full text-left rounded-2xl border transition-all duration-200 p-4"
                  style={{
                    borderColor: isSelected ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)",
                    background: isSelected ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-white/90">{tier.name}</p>
                        {tier.id === "premium" && (
                          <span className="text-[0.5rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">Most popular</span>
                        )}
                      </div>
                      <p className="text-xs text-white/35">{tier.chatMessages} · {tier.voiceMinutes} voice min</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold text-white">{priceLabel}</p>
                      {selectedPlan === "annual" && (
                        <p className="text-[0.6rem] text-white/30">${tier.annualTotal}/yr</p>
                      )}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-white/55">
                        <Check className="h-3 w-3 text-white/35 shrink-0 mt-0.5" strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* Trial note — only shown for paid monthly plans */}
          {!freeSelected && selectedPlan === "monthly" && (
            <div className="w-full max-w-md rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 text-black text-xs font-bold">14</div>
              <p className="text-xs text-white/45">
                14-day free trial — you won&apos;t be charged until day 15.
              </p>
            </div>
          )}

          <div className="w-full max-w-sm space-y-3">
            <PillButton
              onClick={() => {
                if (freeSelected) {
                  if (authedUser) {
                    router.push("/home");
                  } else {
                    setBreatheFlow(true);
                    setStep("breathe");
                  }
                } else if (authedUser) {
                  // Already signed in (upgrade flow) — skip email/code
                  void handleUpgradeCheckout();
                } else {
                  setStep("email");
                }
              }}
              disabled={loading}
              className="w-full"
            >
              {loading
                ? "Opening checkout…"
                : freeSelected
                ? "Start for free — no card needed"
                : authedUser
                ? `Upgrade to ${TIER_CONFIG.find(t => t.id === selectedTier)?.name}`
                : selectedPlan === "monthly"
                ? `Start 14-day free trial`
                : `Get ${TIER_CONFIG.find(t => t.id === selectedTier)?.name}`}
            </PillButton>
            <p className="text-center text-xs text-white/25">
              {freeSelected
                ? "Breathing & meditation · always free · upgrade anytime."
                : selectedPlan === "monthly" && !NO_CARD_TRIAL
                ? "You\u2019ll enter your card at the end. You won\u2019t be charged for 14\u00a0days."
                : selectedPlan === "annual"
                  ? `Billed as $${TIER_CONFIG.find(t => t.id === selectedTier)?.annualTotal}/yr. Cancel anytime.`
                  : "No credit card required during trial."}
            </p>
            {!authedUser && (
              <div className="text-center mt-2">
                <button
                  onClick={() => setStep("email")}
                  className="inline-flex items-center justify-center px-4 py-3 text-sm text-white/70 hover:text-white transition-colors"
                >
                  Already have an account?{" "}
                  <span className="ml-1.5 font-medium underline underline-offset-4 decoration-white/30 hover:decoration-white">
                    Sign in
                  </span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Step 2: Email ── */}
      {step === "email" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full px-4">
          <h1 className="text-2xl font-bold text-white mb-1">Enter your email</h1>
          <p className="text-sm text-white/50 mb-6">
            We&apos;ll send a 6-digit code to verify.
          </p>
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
            className="mb-1 bg-[#111] border-white/10 text-white"
          />
          <p className="text-[0.7rem] text-white/30 mb-4 self-start">
            Works with Gmail · Outlook · iCloud · Yahoo · any email
          </p>
          {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
          <PillButton onClick={handleSendCode} disabled={loading} className="w-full">
            {loading ? "Sending…" : "Send code"}
          </PillButton>

          <Link
            href="/"
            className="mt-5 w-full text-xs text-white/30 hover:text-white/60 uppercase tracking-[3px] transition-colors duration-200 text-center block"
          >
            &larr; Back to home
          </Link>
        </div>
      )}

      {/* ── Step 3: OTP code ── */}
      {step === "code" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full px-4">
          <h1 className="text-2xl font-bold text-white mb-1">
            {devCode ? "Your verification code" : "Check your inbox"}
          </h1>
          {devCode ? (
            <div className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-center mb-4">
              <p className="text-3xl font-bold tracking-[6px] text-white">{devCode}</p>
              <p className="text-[0.7rem] text-white/30 mt-2">
                {smtpConfigured
                  ? "Email delivery failed — code shown here as fallback"
                  : "Dev mode — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env to send real emails"}
              </p>
            </div>
          ) : (
            <div className="mb-4 w-full">
              <p className="text-sm text-white/40 text-center">
                Code sent to <span className="text-white font-medium break-all">{email}</span>
              </p>
              <p className="text-[0.7rem] text-white/25 text-center mt-1">
                Don&apos;t see it? Check your spam/junk folder.
              </p>
            </div>
          )}
          <Input
            type="text"
            placeholder="6-digit code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            className="mb-3 bg-[#111] border-white/10 text-white text-center text-lg tracking-[4px]"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
          <PillButton onClick={handleVerify} disabled={loading} className="w-full">
            {loading ? "Verifying…" : "Verify"}
          </PillButton>
          <div className="flex items-center justify-center gap-4 mt-3 w-full">
            <button
              onClick={() => {
                setStep(breatheFlow ? "breathe" : "email");
                setCode("");
                setDevCode("");
                setError("");
              }}
              className="text-xs text-white/30 hover:text-white/60 uppercase tracking-[3px] transition-colors duration-200"
            >
              &larr; Back
            </button>
            <span className="text-white/10">|</span>
            <button
              onClick={handleResend}
              disabled={resendCountdown > 0 || loading}
              className="text-xs text-white/30 hover:text-white/60 disabled:text-white/15 uppercase tracking-[3px] transition-colors duration-200 flex items-center gap-1.5"
            >
              <RotateCw className="h-3 w-3" strokeWidth={1.5} />
              {resendCountdown > 0 ? `Resend (${resendCountdown}s)` : "Resend code"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Name ── */}
      {step === "name" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full px-4">
          <h1 className="text-2xl font-bold text-white mb-1">What should we call you?</h1>
          <p className="text-sm text-white/50 mb-6">
            This is how orryon will greet you.
          </p>
          <Input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStartTrial()}
            className="mb-4 bg-[#111] border-white/10 text-white"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
          <PillButton onClick={handleStartTrial} disabled={loading} className="w-full">
            {loading ? "Setting up…" : "Get started"}
          </PillButton>
        </div>
      )}

      <Footer />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
