"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Check } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/footer";
import { PillButton } from "@/components/pill-cta";

const PRO_FEATURES = [
  "Unlimited messages",
  "Voice input",
  "Full transaction history & search",
  "Budget tracking with custom categories",
  "Receipt scanning — AI reads your receipts",
  "Spending summaries, recaps & patterns",
  "Net worth tracking",
  "Subscription health analysis",
  "Recurring bills & income tracking",
  "Cash flow forecast",
  "Calendar events, reminders & errands",
  "Today view — tasks + events at a glance",
  "Grocery lists",
  "Rich notes with pinning & mood tags",
  "Shareable read-only finance link",
  "Full data export",
  "Daily digest & weekly email reports",
  "Bill due & event reminder alerts",
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<"tiers" | "email" | "code">("tiers");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      login(res.token, res.user);
      router.push("/home");
    } catch {
      setError("Invalid or expired code. Please try again.");
    } finally {
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

      {/* ── Tiers ── */}
      {step === "tiers" && (
        <div className="flex-1 flex flex-col items-center px-5 pt-4 pb-10">
          <p className="text-[0.6rem] uppercase tracking-[4px] text-white/40 mb-2">Pricing</p>
          <h1 className="text-2xl font-bold text-white mb-1 font-[family-name:var(--font-playfair)] text-center">
            Your full financial + personal life.<br />$8 a month.
          </h1>
          <p className="text-sm text-white/40 mb-8 text-center">
            Start with a free 14-day Pro trial. No credit card required.
          </p>

          <div className="w-full max-w-sm space-y-3 mb-8">

            {/* Trial callout */}
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 text-black text-xs font-bold">14</div>
              <div>
                <p className="text-sm font-semibold text-white">14-day free Pro trial</p>
                <p className="text-xs text-white/40">Full access. No credit card required.</p>
              </div>
            </div>

            {/* Pro */}
            <div className="rounded-2xl border border-white/40 bg-white/[0.03] p-5 relative overflow-hidden">
              {/* Trial badge */}
              <div className="absolute top-4 right-4 text-[0.6rem] uppercase tracking-wider px-2.5 py-1 rounded-full bg-white text-black font-semibold">
                14-day free trial
              </div>

              <div className="flex items-baseline justify-between mb-2.5 pr-28">
                <span className="text-base font-semibold text-white">Pro</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-3 space-y-0.5">
                <p className="text-2xl font-bold text-white">$8 / month</p>
                <p className="text-xl font-bold text-white">Annual plan <span className="text-white/50">SAVE 25%:</span> $72</p>
              </div>
              <p className="text-xs text-white/40 mb-4">Full access. Unlimited. No compromises.</p>
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
              Start free trial
            </PillButton>
            <p className="text-center text-xs text-white/30">
              Already have an account?{" "}
              <button
                onClick={() => setStep("email")}
                className="text-white/60 hover:text-white underline underline-offset-2 transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      )}

      {/* ── Email / code ── */}
      {step !== "tiers" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full px-4">
          {step === "email" && (
            <>
              <h1 className="text-2xl font-bold text-white mb-1">Welcome to ORRYON</h1>
              <p className="text-sm text-white/50 mb-6">
                Enter your email — your 14-day Pro trial starts instantly.
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
                ← View plans
              </button>
            </>
          )}

          {step === "code" && (
            <>
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
                ← Use different email
              </button>
            </>
          )}
        </div>
      )}

      <Footer />
    </div>
  );
}
