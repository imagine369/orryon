"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CHAT_CONTAINER } from "@/lib/chat-helpers";

const ERROR_COPY: Record<string, string> = {
  token_exchange:
    "Google connect failed while saving access. Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Railway match the Orryon (Jun 10) Web client, then try Connect again.",
  store_failed: "Google approved access, but Orryon couldn't save it. Try Connect again in a moment.",
  invalid_state: "Google connect expired or was interrupted. Open Settings and click Connect again.",
};

const REASON_COPY: Record<string, string> = {
  invalid_client:
    "Google rejected the app credentials (invalid_client). On Railway, GOOGLE_CLIENT_ID must be copied from the Orryon Jun 10 Web client Client ID field — not a service-account email with .apps.googleusercontent.com added. Secret must be from that same client.",
  redirect_uri:
    "Google rejected the redirect URI. GOOGLE_OAUTH_REDIRECT_URI must exactly match an Authorized redirect URI on the Orryon Jun 10 client.",
  invalid_grant:
    "Google rejected the OAuth code after Allow (usually a redirect URI mismatch or Client ID/secret mismatch — not the phone SMS code). Confirm Railway GOOGLE_OAUTH_REDIRECT_URI is only the URL, then Connect once more.",
  scope: "Google returned different permissions than expected. Try Connect again.",
  unknown: "Google token exchange failed for an unknown reason. Check Railway backend logs for details.",
};

export function GoogleConnectBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  const connected = searchParams.get("calendar_connected") === "1";
  const error = searchParams.get("calendar_error");
  const reason = searchParams.get("oauth_reason");

  const message = useMemo(() => {
    if (connected) {
      return "Google Calendar & Gmail connected. You can ask Orryon to check your email.";
    }
    if (error === "token_exchange" && reason && REASON_COPY[reason]) {
      return REASON_COPY[reason];
    }
    if (error) {
      return ERROR_COPY[error] ?? `Google connect failed (${error}). Try again from Settings → Connected Accounts.`;
    }
    return null;
  }, [connected, error, reason]);

  useEffect(() => {
    if (!message) return;
    // Clear the query so a refresh doesn't keep showing the banner.
    const t = window.setTimeout(() => {
      router.replace(pathname);
    }, 8000);
    return () => window.clearTimeout(t);
  }, [message, pathname, router]);

  if (!message || !visible) return null;

  const ok = connected && !error;

  return (
    <div className={`${CHAT_CONTAINER} mb-2`}>
      <div
        className={`rounded-xl border px-4 py-2.5 text-center text-sm animate-in fade-in ${
          ok
            ? "border-green-500/20 bg-green-500/10 text-green-400"
            : "border-red-500/20 bg-red-500/10 text-red-300"
        }`}
      >
        <div className="flex items-start justify-between gap-3 text-left">
          <p className="flex-1 leading-relaxed">{message}</p>
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              router.replace(pathname);
            }}
            className="shrink-0 text-xs opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
