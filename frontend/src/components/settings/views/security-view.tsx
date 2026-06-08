"use client";

import type { SettingsPanel } from "../panel-types";
import { EmailChangeSection } from "./email-change-section";

export function SecurityView({ panel }: { panel: SettingsPanel }) {
  const {
    emailStep, setEmailStep, newEmail, setNewEmail, emailCode, setEmailCode,
    emailLoading, emailError, setEmailError, emailDevCode,
    sendEmailCode, verifyEmailCode,
  } = panel;

  return (
    <div className="space-y-4">
      <div className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <p className="text-xs text-white/40 mb-1">Sign-in method</p>
        <p className="text-sm text-white/70">Passwordless — one-time code via email</p>
      </div>

      <EmailChangeSection
        emailStep={emailStep}
        setEmailStep={setEmailStep}
        newEmail={newEmail}
        setNewEmail={setNewEmail}
        emailCode={emailCode}
        setEmailCode={setEmailCode}
        emailLoading={emailLoading}
        emailError={emailError}
        setEmailError={setEmailError}
        emailDevCode={emailDevCode}
        sendEmailCode={sendEmailCode}
        verifyEmailCode={verifyEmailCode}
      />
    </div>
  );
}
