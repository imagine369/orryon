"use client";

import React from "react";
import type { SettingsPanel } from "../panel-types";

import { CalendarDays, RefreshCw, Unlink, ChevronRight, BookUser } from "lucide-react";
import { getApiBase, api } from "@/lib/api";
import { isNativePlatform, requestContactsPermission, getContactsPermissionStatus } from "@/lib/device-contacts";

function calendarStatusLine(panel: SettingsPanel): string {
  const { calOAuthAvailable, calConnected, calSyncPaused, calSynced } = panel;

  if (calOAuthAvailable) {
    if (calConnected) {
      return `Connected · calendar & inbox access · ${calSynced} event${calSynced !== 1 ? "s" : ""} synced`;
    }
    return "Sync your calendar and read your inbox";
  }

  if (calSyncPaused) {
    const events =
      calSynced > 0
        ? `${calSynced} imported event${calSynced !== 1 ? "s" : ""} still in Orryon. `
        : "";
    return `${events}Live Google sync is temporarily unavailable.`;
  }

  if (calSynced > 0) {
    return `${calSynced} event${calSynced !== 1 ? "s" : ""} in Orryon · import more from the Calendar tab`;
  }

  return "Import a .ics file from the Calendar tab in your dashboard";
}

export function ConnectedView({ panel }: { panel: SettingsPanel }) {
  const {
    calConnected, setCalConnected, calOAuthAvailable,
    calSynced, setCalSynced, calLoading, setCalLoading, calMsg, setCalMsg,
    contactsGranted, setContactsGranted,
  } = panel;

  const [contactsLoading, setContactsLoading] = React.useState(false);

  async function connectContacts() {
    setContactsLoading(true);
    try {
      const granted = await requestContactsPermission();
      setContactsGranted(granted);
    } finally {
      setContactsLoading(false);
    }
  }

  function disconnectContacts() {
    setContactsGranted(false);
  }

  // On mount (native only), sync permission state in case user changed it in OS Settings.
  React.useEffect(() => {
    if (!isNativePlatform()) return;
    getContactsPermissionStatus().then((status) => {
      if (status !== "granted" && contactsGranted) {
        setContactsGranted(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function connectGoogle() {
    // Session JWT lives in the HttpOnly cookie; the /api proxy forwards it as Bearer.
    window.location.href = `${getApiBase()}/api/calendar/google/auth`;
  }

  return (
  <div className="space-y-3">
    <p className="text-sm text-white/30 mb-4 leading-relaxed">
      Manage third-party apps and services connected to your account.
    </p>

    {/* Google Calendar */}
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
        <CalendarDays className="w-4 h-4 text-white/50" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 font-medium">Google Calendar & Gmail</p>
        <p className="text-xs text-white/30 mt-0.5">{calendarStatusLine(panel)}</p>
        {calMsg && <p className="text-xs text-green-400 mt-1">{calMsg}</p>}
      </div>
      {calOAuthAvailable && (
        <div className="flex items-center gap-2 shrink-0">
          {calConnected ? (
            <>
              <button
                onClick={async () => {
                  setCalLoading(true); setCalMsg("");
                  try {
                    const res = await api.post<{ synced: number; message: string }>(
                      "/api/calendar/google/sync",
                      {},
                    );
                    setCalSynced((p) => p + res.synced);
                    setCalMsg(res.message);
                  } catch { setCalMsg("Sync failed. Try again."); }
                  finally { setCalLoading(false); }
                }}
                disabled={calLoading}
                className="w-11 h-11 flex items-center justify-center text-white/30 hover:text-white/70 transition disabled:opacity-40"
                title="Sync now"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${calLoading ? "animate-spin" : ""}`} strokeWidth={1.5} />
              </button>
              <button
                onClick={async () => {
                  setCalLoading(true);
                  try {
                    await api.delete("/api/calendar/google/disconnect");
                    setCalConnected(false); setCalSynced(0); setCalMsg("");
                  } catch { /* ignore */ }
                  finally { setCalLoading(false); }
                }}
                disabled={calLoading}
                className="w-11 h-11 flex items-center justify-center text-white/20 hover:text-red-400 transition disabled:opacity-40"
                title="Disconnect"
              >
                <Unlink className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </>
          ) : (
            <button
              onClick={connectGoogle}
              className="text-xs px-3 py-2.5 min-h-[44px] rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white transition flex items-center gap-1.5"
            >
              <ChevronRight className="w-3 h-3" strokeWidth={2} />
              Connect
            </button>
          )}
        </div>
      )}
    </div>

    {/* Phone Contacts */}
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
        <BookUser className="w-4 h-4 text-white/50" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 font-medium">Phone Contacts</p>
        <p className="text-xs text-white/30 mt-0.5">
          {contactsGranted
            ? "Connected · available on this phone to make calls"
            : isNativePlatform()
              ? "Available on this phone to make calls — connect to let orryon find numbers from your contacts"
              : "Available on the Orryon app on your phone to make calls"}
        </p>
      </div>
      {isNativePlatform() && (
        <div className="flex items-center gap-2 shrink-0">
          {contactsGranted ? (
            <button
              onClick={disconnectContacts}
              disabled={contactsLoading}
              className="w-11 h-11 flex items-center justify-center text-white/20 hover:text-red-400 transition disabled:opacity-40"
              title="Disconnect"
            >
              <Unlink className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          ) : (
            <button
              onClick={connectContacts}
              disabled={contactsLoading}
              className="text-xs px-3 py-2.5 min-h-[44px] rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white transition flex items-center gap-1.5 disabled:opacity-40"
            >
              <ChevronRight className="w-3 h-3" strokeWidth={2} />
              Connect
            </button>
          )}
        </div>
      )}
    </div>

  </div>
  );
}
