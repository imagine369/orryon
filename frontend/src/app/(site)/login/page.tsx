"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams as useNextSearchParams } from "next/navigation";
import { X, Check, RotateCw } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  startTierCheckout,
  type BillingPlan,
  type TierId,
} from "@/lib/tier-checkout";
import { Input } from "@/components/ui/input";
import { PillButton } from "@/components/pill-cta";
import { GetAppNavLink, SiteNav } from "@/components/site-nav";

type Tier = TierId;

type Step = "breathe" | "email" | "code" | "name";

// Beta flag — set NEXT_PUBLIC_NO_CARD_TRIAL=true to skip Stripe at signup
const NO_CARD_TRIAL: boolean =
  (process.env.NEXT_PUBLIC_NO_CARD_TRIAL || "").toLowerCase() === "true";

function LoginPageInner() {
  const { login, user: authedUser, loading: authLoading } = useAuth();
  const searchParams = useNextSearchParams();

  const flow       = searchParams.get("flow");
  const stepParam  = searchParams.get("step");
  const planParam  = searchParams.get("plan");
  const tierParam  = searchParams.get("tier") as Tier | null;
  const nextParam  = searchParams.get("next") || "/home";

  const hasTierParam = !!(tierParam && ["pro", "premium", "premium_plus"].includes(tierParam));
  const selectedTier: Tier = hasTierParam ? tierParam! : "premium";
  const selectedPlan: BillingPlan = planParam === "annual" ? "annual" : "monthly";

  const [breatheFlow, setBreatheFlow] = useState(flow === "breathe");
  const [step, setStep] = useState<Step>(() => {
    if (flow === "breathe") return "breathe";
    if (stepParam === "name") return "name";
    return "email";
  });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (flow === "breathe") {
      setBreatheFlow(true);
      setStep((s) => (s === "email" ? "breathe" : s));
    }
  }, [flow]);

  // Signed-in user from /pricing → Stripe (skip email OTP)
  useEffect(() => {
    if (authLoading || !authedUser || !hasTierParam || breatheFlow) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    startTierCheckout(selectedTier, selectedPlan, {
      successUrl: `${window.location.origin}/home?upgraded=1`,
      cancelUrl: `${window.location.origin}/pricing`,
    }).catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Could not open checkout");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, authedUser, hasTierParam, selectedTier, selectedPlan, breatheFlow]);

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

      // New sign-up from /pricing → Stripe after OTP
      if (hasTierParam && selectedTier) {
        try {
          await startTierCheckout(selectedTier, selectedPlan, {
            successUrl: `${window.location.origin}/login?step=name`,
            cancelUrl: `${window.location.origin}/pricing`,
          });
          return;
        } catch {
          // Fall through to name step if checkout fails
        }
      }

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

  // Called from the name step after Stripe checkout (or free signup).
  // At this point the user is already authenticated and subscribed — we just
  // save the display name and send them into the app.
  const handleSaveName = async () => {
    const name = displayName.trim();
    if (!name) {
      setError("Please enter your name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const currentUser = authedUser || authUser;
      if (currentUser && name !== currentUser.display_name) {
        await api.patch("/api/settings", { display_name: name }).catch(() => {});
      }
      if (currentUser) {
        login({ ...currentUser, display_name: name });
      }
      // After checkout, the Stripe webhook may still be in flight — the same
      // ?upgraded=1 handshake as /paywall + settings billing triggers polling on /home.
      window.location.assign("/home?upgraded=1");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-[100dvh] bg-black" style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <SiteNav logoHref="/" safeArea>
        <GetAppNavLink />
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] p-2 text-white/80 hover:text-white hover:border-white/25 active:scale-[0.98] transition"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </Link>
      </SiteNav>

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

      {/* ── Signed-in upgrade from /pricing (checkout redirect in useEffect) ── */}
      {step === "email" && hasTierParam && (authLoading || !!authedUser) && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full px-4">
          <h1 className="text-2xl font-bold text-white mb-1">Opening checkout…</h1>
          <p className="text-sm text-white/50 mb-6 text-center">
            Redirecting you to Stripe to subscribe to {selectedTier.replace("_", " ")}.
          </p>
          {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
          {!error && (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          )}
        </div>
      )}

      {/* ── Step 1: Email (sign-up; tier checkout runs after verify or when already signed in) ── */}
      {step === "email" && !(hasTierParam && (authLoading || authedUser)) && (
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

      {/* ── Step 4: Name (post-payment account setup) ── */}
      {step === "name" && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full px-4">
          <h1 className="text-2xl font-bold text-white mb-1 font-[family-name:var(--font-playfair)]">
            One last thing.
          </h1>
          <p className="text-sm text-white/50 mb-6 text-center">
            What should Orryon call you?
          </p>
          <Input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSaveName()}
            className="mb-4 bg-[#111] border-white/10 text-white"
            autoFocus
            autoComplete="given-name"
          />
          {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
          <PillButton onClick={() => void handleSaveName()} disabled={loading} className="w-full">
            {loading ? "Setting up…" : "Enter Orryon →"}
          </PillButton>
        </div>
      )}

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
