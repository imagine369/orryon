"use client";

import type { SettingsPanel } from "../panel-types";

import { Row, TextField, SelectField } from "../ui";
import { COUNTRIES, LANGUAGES, GENDER_OPTIONS } from "../constants";
import { ageFromBirthDate, formatAccountDate } from "../utils";
import { EmailChangeSection } from "./email-change-section";


export function AccountView({ panel }: { panel: SettingsPanel }) {
  const {
    logout, close, sub, prefs, updatePrefs, chatUsage,
    settings, view, setView,
    accountDraft, setAccountDraft,
    emailStep, setEmailStep, newEmail, setNewEmail, emailCode, setEmailCode,
    emailLoading, emailError, setEmailError, emailDevCode,
    deleteConfirm, setDeleteConfirm, deleteLoading, setDeleteLoading,
    billingLoading, setBillingLoading, exportLoading, setExportLoading,
    calConnected, setCalConnected, calSynced, setCalSynced, calLoading, setCalLoading, calMsg, setCalMsg,
    sessions, setSessions, revokeAllLoading, setRevokeAllLoading, revokeAllDone, setRevokeAllDone,
    patch, saveProfileField, sendEmailCode, verifyEmailCode, handleDeleteAccount,
  } = panel;

  const age = ageFromBirthDate(accountDraft.birth_date);
  const createdLabel = settings?.created_at
    ? formatAccountDate(settings.created_at)
    : "—";

  return (
    <div className="space-y-6">
      <p className="text-sm text-white/30 leading-relaxed">
        Personal details for your Orryon account. Changes save when you leave a field or pick a new option.
      </p>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl divide-y divide-white/5">
        <Row
          label="Name"
          right={
            <TextField
              value={accountDraft.display_name}
              onChange={(v) => setAccountDraft((d) => ({ ...d, display_name: v }))}
              onBlur={() => saveProfileField("display_name", accountDraft.display_name)}
              placeholder="Your name"
            />
          }
        />
        <Row
          label="Phone"
          right={
            <TextField
              type="tel"
              value={accountDraft.phone}
              onChange={(v) => setAccountDraft((d) => ({ ...d, phone: v }))}
              onBlur={() => saveProfileField("phone", accountDraft.phone)}
              placeholder="+1 555 0000"
            />
          }
        />
        <Row
          label="Email"
          sublabel="Sign-in address"
          right={
            <span className="text-xs text-white/50 max-w-[50vw] truncate block text-right">
              {settings!.email}
            </span>
          }
        />
        <Row
          label="Account created"
          right={<span className="text-xs text-white/50">{createdLabel}</span>}
        />
        <Row
          label="Country"
          right={
            <SelectField
              value={accountDraft.country}
              onChange={(v) => {
                setAccountDraft((d) => ({ ...d, country: v }));
                void saveProfileField("country", v);
              }}
              options={COUNTRIES}
            />
          }
        />
        <Row
          label="Language"
          right={
            <SelectField
              value={accountDraft.language}
              onChange={(v) => {
                setAccountDraft((d) => ({ ...d, language: v }));
                void saveProfileField("language", v);
              }}
              options={LANGUAGES}
            />
          }
        />
        <Row
          label="Birth date"
          right={
            <TextField
              type="date"
              value={accountDraft.birth_date}
              onChange={(v) => setAccountDraft((d) => ({ ...d, birth_date: v }))}
              onBlur={() => saveProfileField("birth_date", accountDraft.birth_date)}
              className="w-36"
            />
          }
        />
        <Row
          label="Gender"
          right={
            <SelectField
              value={accountDraft.gender}
              onChange={(v) => {
                setAccountDraft((d) => ({ ...d, gender: v }));
                void saveProfileField("gender", v);
              }}
              options={GENDER_OPTIONS}
            />
          }
        />
        <Row
          label="Age"
          sublabel="Calculated from birth date"
          right={
            <span className="text-xs text-white/50">
              {age !== null ? `${age} years` : "—"}
            </span>
          }
        />
      </div>

      <EmailChangeSection
        showLabel
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
