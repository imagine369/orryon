"use client";

import type { SettingsPanel } from "../panel-types";
import { GrokKeyForm } from "@/components/grok-key-form";

export function GrokView({ panel }: { panel: SettingsPanel }) {
  const { settings } = panel;
  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
        <GrokKeyForm masked={settings?.xai_key_masked} />
      </div>
    </div>
  );
}
