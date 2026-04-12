"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SlideInFromLeft } from "@/components/motion";

interface Settings {
  display_name: string;
  email: string;
  default_reminder_minutes: number;
  daily_digest_enabled: number;
  daily_digest_time: string;
  weekly_report_enabled: number;
  smtp_enabled: boolean;
  ai_connected: boolean;
  grok_model: string;
}

const reminderOpts = [
  { label: "None", value: 0 },
  { label: "10 min before", value: 10 },
  { label: "30 min before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "6 hours before", value: 360 },
  { label: "1 day before", value: 1440 },
];

const digestTimes = ["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];

export default function SettingsPage() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.get<Settings>("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const patch = async (updates: Record<string, unknown>) => {
    await api.patch("/api/settings", updates);
    setSettings((prev) => prev ? { ...prev, ...updates } as Settings : prev);
  };

  const handleExport = () => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/export`, "_blank");
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <SlideInFromLeft className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
        </button>
      </div>

      {/* User info */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-white/5">
        <Image src="/avatar.png" alt="orryon" width={40} height={40} className="rounded-full object-cover" />
        <div>
          <p className="font-semibold">{settings.display_name || "You"}</p>
          <p className="text-xs text-white/30">{settings.email} · Local-first · Private</p>
        </div>
      </div>

      {/* AI status */}
      {settings.ai_connected ? (
        <p className="text-sm text-green-400 mb-4">✅ Grok AI connected · {settings.grok_model}</p>
      ) : (
        <p className="text-sm text-yellow-400 mb-4">⚠️ XAI_API_KEY not set — AI disabled</p>
      )}

      <Separator className="my-4 bg-white/5" />

      {/* Notifications */}
      <h2 className="text-sm font-bold mb-3">Notifications</h2>

      <div className="mb-3">
        <label className="text-xs text-white/40 block mb-1">Default reminder</label>
        <select
          value={settings.default_reminder_minutes}
          onChange={(e) => patch({ default_reminder_minutes: Number(e.target.value) })}
          className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          {reminderOpts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm">Daily morning digest</span>
        <button
          onClick={() => patch({ daily_digest_enabled: settings.daily_digest_enabled ? 0 : 1 })}
          className={`relative w-10 h-6 rounded-full transition ${settings.daily_digest_enabled ? "bg-green-500" : "bg-white/10"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.daily_digest_enabled ? "translate-x-4" : ""}`} />
        </button>
      </div>

      {settings.daily_digest_enabled ? (
        <div className="mb-3">
          <label className="text-xs text-white/40 block mb-1">Digest time</label>
          <select
            value={settings.daily_digest_time}
            onChange={(e) => patch({ daily_digest_time: e.target.value })}
            className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            {digestTimes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      ) : null}

      <p className="text-xs text-white/25 mb-4">
        {settings.smtp_enabled ? "✅ Email reminders active" : "⚠️ SMTP not configured — set in .env"}
      </p>

      <Separator className="my-4 bg-white/5" />

      {/* Weekly reports */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold">Weekly email report</span>
        <button
          onClick={() => patch({ weekly_report_enabled: settings.weekly_report_enabled ? 0 : 1 })}
          className={`relative w-10 h-6 rounded-full transition ${settings.weekly_report_enabled ? "bg-green-500" : "bg-white/10"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.weekly_report_enabled ? "translate-x-4" : ""}`} />
        </button>
      </div>

      <Separator className="my-4 bg-white/5" />

      {/* Export */}
      <h2 className="text-sm font-bold mb-3">Data Export</h2>
      <Button onClick={handleExport} variant="outline" className="w-full border-white/10 text-white/60 mb-4">
        ⬇️ Export All Data (ZIP)
      </Button>

      <Separator className="my-4 bg-white/5" />

      {/* Sign out */}
      <Button
        onClick={() => { logout(); router.push("/"); }}
        variant="ghost"
        className="w-full text-white/40 hover:text-red-400"
      >
        Sign out
      </Button>

      <p className="text-center text-[0.65rem] text-white/15 mt-6">
        orryon v2.0 · All data in local SQLite
      </p>
    </SlideInFromLeft>
  );
}
