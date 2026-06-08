"use client";

import { ChevronRight } from "lucide-react";

interface EmailChangeSectionProps {
  emailStep: "idle" | "input" | "code";
  setEmailStep: (step: "idle" | "input" | "code") => void;
  newEmail: string;
  setNewEmail: (email: string) => void;
  emailCode: string;
  setEmailCode: (code: string) => void;
  emailLoading: boolean;
  emailError: string;
  setEmailError: (error: string) => void;
  emailDevCode: string | null;
  sendEmailCode: () => void;
  verifyEmailCode: () => void;
  showLabel?: boolean;
}

export function EmailChangeSection({
  emailStep,
  setEmailStep,
  newEmail,
  setNewEmail,
  emailCode,
  setEmailCode,
  emailLoading,
  emailError,
  setEmailError,
  emailDevCode,
  sendEmailCode,
  verifyEmailCode,
  showLabel = false,
}: EmailChangeSectionProps) {
  return (
    <div>
      {showLabel && (
        <p className="text-xs text-white/40 mb-2 uppercase tracking-wide">Email</p>
      )}
      {emailStep === "idle" && (
        <button
          onClick={() => {
            setEmailStep("input");
            setEmailError("");
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:bg-white/[0.06] transition text-sm text-white/70 hover:text-white"
        >
          <span>Change login email</span>
          <ChevronRight className="h-4 w-4 text-white/30" strokeWidth={1.5} />
        </button>
      )}
      {emailStep === "input" && (
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-3">
          <p className="text-xs text-white/40">
            Enter your new email address. We&apos;ll send a verification code to confirm.
          </p>
          <input
            autoFocus
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          {emailError && <p className="text-xs text-red-400">{emailError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEmailStep("idle");
                setNewEmail("");
                setEmailError("");
              }}
              className="flex-1 py-2 text-xs text-white/40 border border-white/10 rounded-lg hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              onClick={sendEmailCode}
              disabled={emailLoading || !newEmail.includes("@")}
              className="flex-1 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40"
            >
              {emailLoading ? "Sending…" : "Send code"}
            </button>
          </div>
        </div>
      )}
      {emailStep === "code" && (
        <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-3">
          <p className="text-xs text-white/40">
            Enter the 6-digit code sent to <span className="text-white/70">{newEmail}</span>
          </p>
          {emailDevCode && (
            <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">
              Dev mode — code: <span className="font-mono font-bold">{emailDevCode}</span>
            </p>
          )}
          <input
            autoFocus
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 tracking-widest text-center font-mono text-base"
          />
          {emailError && <p className="text-xs text-red-400">{emailError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEmailStep("input");
                setEmailCode("");
                setEmailError("");
              }}
              className="flex-1 py-2 text-xs text-white/40 border border-white/10 rounded-lg hover:bg-white/5 transition"
            >
              Back
            </button>
            <button
              onClick={verifyEmailCode}
              disabled={emailLoading || emailCode.length < 6}
              className="flex-1 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-40"
            >
              {emailLoading ? "Verifying…" : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
