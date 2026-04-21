"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Check, RotateCw } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/footer";
import { PillButton } from "@/components/pill-cta";

const MONTHLY_PRICE_ID: string = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY || "";
const ANNUAL_PRICE_ID: string = process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL || "";

const PRO_FEATURES = [
  "Full access to your personal concierge",
  "Easy voice input",
  "Search across transactions, notes & tasks",
  "Budget tracking with custom categories",
  "Spending summaries, recaps & patterns",
  "Savings & financial goals",
  "Recurring bills & income tracking",
  "Cash flow forecast",
  "Calendar events, reminders & errands",
  "Today — tasks & events at a glance",
  "Lists — groceries, errands & more",
  "Journal — private daily entries",
  "Guided breathing & mindfulness",
  "Full data export",
  "Bill due & event reminder alerts",
];

type Step = "tiers" | "email" | "code" | "name";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const initialStep = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("step") === "tiers" ? "tiers" : "email";
  const [step, setStep] = useState<Step>(initialStep);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("monthly");
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
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ sent: boolean; dev_code: string; smtp_configured: boolean }>("/api/auth/send-code", { email: val });
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
      // Cookie-setting proxy route: the JWT is stored in an HttpOnly cookie
      // and never reaches this page's JS. Response only carries the user.
      const res = await api.post<{ user: { id: string; email: string; display_name: string; stripe_subscription_id?: string } }>(
        "/api/auth/login",
        { email: email.trim().toLowerCase(), code: code.trim() },
      );
      setAuthUser(res.user);
      setDisplayName(res.user.display_name || "");

      if (res.user && res.user.stripe_subscription_id) {
        login(res.user);
        router.push("/home");
      } else {
        setStep("name");
      }
    } catch {
      setError("Invalid or expired code. Please try again.");
    } finally {
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
      const priceId = selectedPlan === "annual" ? ANNUAL_PRICE_ID : MONTHLY_PRICE_ID;

      // Cookie was set by /api/auth/login during handleVerify; subsequent API
      // calls authenticate via that cookie automatically. A user who abandons
      // Stripe checkout will stay signed in as a free-tier user and hit the
      // server-enforced paywall on protected endpoints — the real gate.
      if (priceId) {
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
    <div className="flex flex-col min-h-screen bg-black">
      <div className="px-4 pt-4 flex items-center justify-end shrink-0">
        <Link href="/" className="text-white/50 hover:text-white p-1">
          <X className="h-5 w-5" strokeWidth={1.5} />
        </Link>
      </div>

      {/* ── Step 1: Plan selection ── */}
      {step === "tiers" && (
        <div className="flex-1 flex flex-col items-center px-5 pt-4 pb-10">
          <p className="text-[0.6rem] uppercase tracking-[4px] text-white/40 mb-2">Pricing</p>
          <h1 className="text-2xl font-bold text-white mb-1 font-[family-name:var(--font-playfair)] text-center">
            Your full financial + personal life.<br />$8 a month.
          </h1>
          <p className="text-sm text-white/40 mb-8 text-center">
            14-day free trial. Cancel anytime before it ends — you won&apos;t be charged.
          </p>

          <div className="w-full max-w-md space-y-3 mb-6">
            {/* Plan toggle */}
            <div className="flex rounded-full border border-white/8 bg-[#111] p-0.5">
              {(["monthly", "annual"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSelectedPlan(opt)}
                  className="flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
                  style={{
                    background: selectedPlan === opt ? "rgba(255,255,255,0.1)" : "transparent",
                    color: selectedPlan === opt ? "white" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {opt === "monthly" ? (
                    <>Monthly <span className="text-white/40">$8/mo</span></>
                  ) : (
                    <>Annual <span className="text-white/40">$6/mo</span><span className="text-white/25 mx-1">·</span><span className="text-white/40">$72/yr</span>
                      <span className="text-[0.55rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">Save 25%</span>
                    </>
                  )}
                </button>
              ))}
            </div>

            {/* Trial callout */}
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 text-black text-xs font-bold">14</div>
              <div>
                <p className="text-sm font-semibold text-white">14-day free trial</p>
                <p className="text-xs text-white/40">
                  {selectedPlan === "monthly"
                    ? "Then $8/month. Cancel anytime."
                    : "Then $72/year (save 25%). Billed annually. Cancel to stop renewal."}
                </p>
              </div>
            </div>

            {/* Feature list */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-[0.6rem] uppercase tracking-[3px] text-white/30 mb-3">Everything included</p>
              <ul className="space-y-2">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-white/70">
                    <Check className="h-3.5 w-3.5 text-white/40 shrink-0" strokeWidth={2} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-3">
            <PillButton onClick={() => setStep("email")} className="w-full">
              Start 14-day free trial
            </PillButton>
            <p className="text-center text-xs text-white/25">
              {MONTHLY_PRICE_ID
                ? "You\u2019ll enter your card at the end. You won\u2019t be charged for 14\u00a0days."
                : "No credit card required. Cancel anytime during your trial."}
            </p>
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

          <div className="mt-5 w-full flex items-center gap-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-[0.6rem] uppercase tracking-[3px] text-white/25">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <button
            onClick={async () => {
              if (typeof window === "undefined") return;
              setLoading(true);
              setError("");
              try {
                const res = await fetch("/api/auth/demo-login", {
                  method: "POST",
                  credentials: "same-origin",
                });
                if (res.ok) {
                  // Real session — xAI TTS (Orb voice) will work
                  localStorage.setItem("orryon_demo", "true");
                  login({ id: "demo", email: "demo@orryon.app", display_name: "Alex" });
                  router.push("/home");
                } else {
                  // Fallback: local-only demo (browser TTS)
                  localStorage.setItem("orryon_demo", "true");
                  login({ id: "demo", email: "demo@orryon.app", display_name: "Alex" });
                  router.push("/home");
                }
              } catch {
                // Offline fallback
                localStorage.setItem("orryon_demo", "true");
                login({ id: "demo", email: "demo@orryon.app", display_name: "Alex" });
                router.push("/home");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="mt-4 w-full py-3 text-sm text-white/70 hover:text-white border border-white/10 hover:border-white/25 rounded-full transition-colors duration-200 disabled:opacity-50"
          >
            {loading ? "Entering…" : "Try the demo"}
          </button>
          <p className="text-[0.7rem] text-white/25 mt-2 text-center">
            No account. Data stays on this device.
          </p>

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
              onClick={() => { setStep("email"); setCode(""); setDevCode(""); setError(""); }}
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
