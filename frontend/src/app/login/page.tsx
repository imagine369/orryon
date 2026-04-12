"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<"email" | "code">("email");
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

  const handleDemo = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: { id: string; email: string; display_name: string } }>("/api/auth/demo");
      login(res.token, res.user);
      router.push("/home");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black px-4 pt-4">
      <div className="flex items-center">
        <Link href="/" className="text-white/50 hover:text-white p-1"><X className="h-5 w-5" strokeWidth={1.5} /></Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
        {step === "email" ? (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Sign in to orryon</h1>
            <p className="text-sm text-white/40 mb-6">Enter your email — we&apos;ll send a verification code.</p>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
              className="mb-1 bg-[#111] border-white/10 text-white"
            />
            <p className="text-[0.7rem] text-white/30 mb-4 self-start">Works with Gmail · Outlook · iCloud · Yahoo · any email</p>
            {error && <p className="text-red-400 text-sm mb-3 w-full">{error}</p>}
            <Button onClick={handleSendCode} disabled={loading} className="w-full rounded-full bg-white text-black font-semibold hover:bg-gray-200">
              {loading ? "Sending…" : "Send code →"}
            </Button>
            <div className="mt-6 w-full border-t border-white/5 pt-4">
              <Button onClick={handleDemo} disabled={loading} variant="outline" className="w-full rounded-full border-white/20 text-white/60 hover:text-white">
                Try the demo →
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-1">Check your email</h1>
            {devCode ? (
              <div className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-center mb-4">
                <p className="text-3xl font-bold tracking-[6px] text-white">{devCode}</p>
                <p className="text-[0.7rem] text-white/30 mt-2">Dev mode — set SMTP in .env to send real emails</p>
              </div>
            ) : (
              <p className="text-sm text-white/40 mb-4">
                Code sent to <span className="text-white font-medium">{email}</span>. Check your inbox.
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
            <Button onClick={handleVerify} disabled={loading} className="w-full rounded-full bg-white text-black font-semibold hover:bg-gray-200">
              {loading ? "Verifying…" : "Verify →"}
            </Button>
            <Button
              onClick={() => { setStep("email"); setCode(""); setDevCode(""); setError(""); }}
              variant="ghost"
              className="mt-2 text-white/40 hover:text-white"
            >
              ← Use different email
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
