"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Check, Eye } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/footer";
import { PillButton } from "@/components/pill-cta";

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? "";
const ANNUAL_PRICE_ID  = process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL  ?? "";

const PRO_FEATURES = [
  "Full access to your personal life concierge",
  "Easy voice input",
  "Full transaction history & search",
  "Budget tracking with custom categories",
  "Spending summaries, recaps & patterns",
  "Recurring bills & income tracking",
  "Cash flow forecast",
  "Calendar events, reminders & errands",
  "Today — tasks & events at a glance",
  "Lists — groceries, errands & more",
  "Journal — private daily entries",
  "Full data export",
  "Daily digest & weekly email reports",
  "Bill due & event reminder alerts",
];

type Step = "tiers" | "email" | "code" | "name";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("tiers");
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("monthly");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [authToken, setAuthToken] = useState("");
  const [authUser, setAuthUser] = useState<{ id: string; email: string; display_name: string } | null>(null);

  const handleSendCode = async () => {
    const val = email.trim().toLowerCase();
    if (!val || !val.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ sent: boolean; dev_code: string }>("/api/auth/send-code", { email: val });
      setDevCode(res.sent ? "" : res.dev_code);
      setStep("code");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim() || code.trim().length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ token: string; user: { id: string; email: string; display_name: string } }>(
        "/api/auth/verify",
        { email: email.trim().toLowerCase(), code: code.trim() },
      );
      setAuthToken(res.token);
      setAuthUser(res.user);
      setDisplayName(res.user.display_name || "");

      if (res.user && (res.user as Record<string, unknown>).stripe_subscription_id) {
        login(res.token, res.user);
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
      const priceId = selectedPlan === "monthly" ? MONTHLY_PRICE_ID : ANNUAL_PRICE_ID;

      if (!priceId) {
        login(authToken, { ...authUser!, display_name: name });
        router.push("/home");
        return;
      }

      login(authToken, { ...authUser!, display_name: name });

      if (name !== authUser?.display_name) {
        await api.patch("/api/settings", { display_name: name }).catch(() => {});
      }

      const origin = window.location.origin;
      const res = await api.post<{ checkout_url: string }>("/api/auth/signup-checkout", {
        price_id: priceId,
        success_url: `${origin}/home?upgraded=1`,
        cancel_url: `${origin}/login`,
      });
      window.location.href = res.checkout_url;
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

          <div className="w-full max-w-sm space-y-3 mb-6">
            {/* Plan toggle */}
            <div className="flex rounded-full border border-white/8 bg-[#111] p-0.5">
              {(["monthly", "annual"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSelectedPlan(opt)}
                  className="flex-1 rounded-full py-2.5 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    background: selectedPlan === opt ? "rgba(255,255,255,0.1)" : "transparent",
                    color: selectedPlan === opt ? "white" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {opt === "monthly" ? (
                    <>Monthly <span className="text-white/40">$8/mo</span></>
                  ) : (
                    <>Annual <span className="text-white/40">$72/yr</span>
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
              You&apos;ll enter your card next. You won&apos;t be charged for 14 days.
            </p>
            <p className="text-center text-xs text-white/30 mt-2">
              Already have an account?{" "}
              <button
                onClick={() => setStep("email")}
                className="text-white/60 hover:text-white underline underline-offset-2 transition-colors"
              >
                Sign in
              </button>
            </p>

            {/* Dev preview bypass */}
            <div className="pt-4 border-t border-white/5">
              <button
                onClick={() => {
                  localStorage.setItem("orryon_demo", "true");
                  router.push("/home");
                }}
                className="w-full flex items-center justify-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors py-2"
              >
                <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                Preview the app (no account needed)
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
          <button
            onClick={() => { setStep("tiers"); setError(""); }}
            className="mt-3 w-full text-xs text-white/30 hover:text-white/60 uppercase tracking-[3px] transition-colors duration-200"
          >
            &larr; Back
          </button>
        </div>
      )}

      {/* ── Step 3: OTP code ── */}
      {step === "code" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full px-4">
          <h1 className="text-2xl font-bold text-white mb-1">Check your inbox</h1>
          {devCode ? (
            <div className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-center mb-4">
              <p className="text-3xl font-bold tracking-[6px] text-white">{devCode}</p>
              <p className="text-[0.7rem] text-white/30 mt-2">Dev mode — set SMTP in .env to send real emails</p>
            </div>
          ) : (
            <p className="text-sm text-white/40 mb-4">
              Code sent to <span className="text-white font-medium break-all">{email}</span>. Check your inbox.
            </p>
          )}
          <Input
            type="text"
            placeholder="6-digit code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            className="mb-3 bg-[#111] border-white/10 text-white text-center text-lg tracking-[4px]"
          />
          {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
          <PillButton onClick={handleVerify} disabled={loading} className="w-full">
            {loading ? "Verifying…" : "Verify"}
          </PillButton>
          <button
            onClick={() => { setStep("email"); setCode(""); setDevCode(""); setError(""); }}
            className="mt-3 w-full text-xs text-white/30 hover:text-white/60 uppercase tracking-[3px] transition-colors duration-200"
          >
            &larr; Use different email
          </button>
        </div>
      )}

      {/* ── Step 4: Name + confirm trial ── */}
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

          <div className="w-full rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 mb-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Plan</span>
              <span className="text-white font-medium">
                {selectedPlan === "monthly" ? "$8 / month" : "$72 / year"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-white/60">Due today</span>
              <span className="text-green-400 font-semibold">$0.00</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-white/30">First charge</span>
              <span className="text-white/30">After 14-day trial</span>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
          <PillButton onClick={handleStartTrial} disabled={loading} className="w-full">
            {loading ? "Setting up…" : "Continue to payment"}
          </PillButton>
          <p className="text-center text-xs text-white/25 mt-3">
            You won&apos;t be charged for 14 days. Cancel anytime in Settings.
          </p>
        </div>
      )}

      <Footer />
    </div>
  );
}
