"use client";

import { useState } from "react";
import { api } from "@/lib/api";

const CONSOLE_URL = "https://console.x.ai";

export function GrokKeyForm({
  masked,
  onSaved,
}: {
  masked?: string;
  onSaved?: (masked: string) => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ xai_key_masked: string }>("/api/settings/xai-key", {
        api_key: value.trim(),
      });
      setValue("");
      setDone(true);
      onSaved?.(res.xai_key_masked || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save key.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 text-left">
      <p className="text-sm text-white/50 leading-relaxed">
        Chat uses{" "}
        <a
          href={CONSOLE_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-white/70"
        >
          Grok from xAI
        </a>
        . Create an API key there, then paste it here. Orryon never shows the full key again.
      </p>
      {masked ? (
        <p className="text-xs text-white/40">Saved key: {masked}</p>
      ) : null}
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDone(false);
        }}
        placeholder="xai-…"
        className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/25 placeholder:text-white/25"
      />
      {error ? <p className="text-xs text-red-300/80">{error}</p> : null}
      {done ? <p className="text-xs text-teal-300/80">Saved. You can chat now.</p> : null}
      <button
        type="button"
        disabled={saving || !value.trim()}
        onClick={() => void save()}
        className="rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[2px] text-white/80 hover:text-white disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save key"}
      </button>
    </div>
  );
}
