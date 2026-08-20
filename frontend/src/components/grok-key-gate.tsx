"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { GrokKeyForm } from "@/components/grok-key-form";
import type { Settings } from "@/components/settings/types";

export function GrokKeyGate() {
  const [open, setOpen] = useState(false);
  const [masked, setMasked] = useState("");

  useEffect(() => {
    api
      .get<Settings>("/api/settings")
      .then((s) => {
        if (!s.ai_connected) setOpen(true);
      })
      .catch(() => {});
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0e] p-6">
        <h2 className="text-lg font-semibold text-white mb-2 font-[family-name:var(--font-playfair)]">
          Add your Grok key
        </h2>
        <p className="text-sm text-white/45 mb-5">
          Orryon is free. Chat runs on your xAI key so usage is billed to you, not us.
        </p>
        <GrokKeyForm
          masked={masked}
          onSaved={(next) => {
            setMasked(next);
            setOpen(false);
          }}
        />
      </div>
    </div>
  );
}
