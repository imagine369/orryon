"use client";

import { useState } from "react";
import type { AmbientSoundStyle } from "@/lib/ambient-plan";
import {
  AMBIENT_SOUND_STYLES,
  planAllowsAmbientSpokenGreeting,
  planAllowsAmbientVoiceHold,
} from "@/lib/ambient-plan";
import { primeAmbientWakeFromGesture } from "@/lib/ambient-wake";
import type { usePreferences } from "@/lib/use-preferences";
import type { useSubscription } from "@/lib/use-subscription";

const SOUND_STYLE_LABELS: Record<AmbientSoundStyle, string> = {
  soft_glow_rise: "Soft glow rise",
  crystal_bloom: "Crystal bloom",
};

/** Snap stored sensitivity (0–1) to slider steps: 0, 5, … 100. */
function snapSensitivityPct(sensitivity: number): number {
  const pct = Math.round(sensitivity * 100);
  return Math.min(100, Math.max(0, Math.round(pct / 5) * 5));
}

type AmbientViewProps = {
  prefs: ReturnType<typeof usePreferences>["prefs"];
  onUpdate: ReturnType<typeof usePreferences>["update"];
  sub: ReturnType<typeof useSubscription>["sub"];
};

export function AmbientView({ prefs, onUpdate, sub }: AmbientViewProps) {
  const plan = sub?.plan ?? null;
  const spokenGreeting = planAllowsAmbientSpokenGreeting(plan);
  const voiceHold = planAllowsAmbientVoiceHold(plan);
  const enabled = prefs.ambient_mode_enabled;
  const savedSensitivityPct = snapSensitivityPct(prefs.ambient_sensitivity);
  const [dragSensitivityPct, setDragSensitivityPct] = useState<number | null>(null);
  const displaySensitivityPct = dragSensitivityPct ?? savedSensitivityPct;

  const commitSensitivity = (pct: number) => {
    if (pct === savedSensitivityPct) return;
    void onUpdate({ ambient_sensitivity: pct / 100 });
  };

  const handleAmbientToggle = () => {
    const next = !enabled;
    if (next) {
      void primeAmbientWakeFromGesture();
    }
    void onUpdate({ ambient_mode_enabled: next });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.04]">
        <div>
          <p className="text-sm text-white/80 font-medium">Ambient Pickup</p>
          <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
            Orryon wakes when you pick up your phone — soft haptics, glow, and a
            gentle sound. Set-down keeps a mini-orb nearby while you talk (Premium).
          </p>
        </div>
        <button
          type="button"
          onClick={handleAmbientToggle}
          className="relative shrink-0 flex items-center justify-center w-11 h-11 mt-0.5"
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 block ${enabled ? "bg-white/80" : "bg-white/10"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`}
            />
          </span>
        </button>
      </div>

      {enabled && (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                Pickup sensitivity
              </p>
              <span className="text-xs text-white/30 tabular-nums">{displaySensitivityPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={displaySensitivityPct}
              onChange={(e) =>
                setDragSensitivityPct(parseInt(e.target.value, 10))
              }
              onPointerDown={() => setDragSensitivityPct(savedSensitivityPct)}
              onPointerUp={(e) => {
                const pct = parseInt(e.currentTarget.value, 10);
                setDragSensitivityPct(null);
                commitSensitivity(pct);
              }}
              onPointerCancel={() => setDragSensitivityPct(null)}
              onKeyUp={(e) => {
                const pct = parseInt(e.currentTarget.value, 10);
                setDragSensitivityPct(null);
                commitSensitivity(pct);
              }}
              className="w-full accent-[rgba(200,160,240,0.85)]"
              aria-label="Ambient pickup sensitivity"
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-white/25">
              <span>Less sensitive</span>
              <span>More sensitive</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
              Wake sound
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AMBIENT_SOUND_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => onUpdate({ ambient_sound_style: style })}
                  className={`min-h-[44px] rounded-xl px-3 text-xs font-medium transition border ${prefs.ambient_sound_style === style ? "border-white/20 bg-white/10 text-white/90" : "border-white/[0.06] bg-white/[0.03] text-white/35 hover:bg-white/[0.06]"}`}
                >
                  {SOUND_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-white/25 leading-relaxed">
        {spokenGreeting && voiceHold
          ? "Premium: spoken greeting on pickup and mini-orb voice hold when you set your phone down during a conversation."
          : "Free: non-verbal wake sound on pickup. Upgrade to Premium for a spoken greeting and voice hold in mini-orb."}
      </p>
      <p className="text-xs text-white/20 leading-relaxed">
        Uses motion sensors while enabled. Sensor data stays on your device and is
        not sent to Orryon servers.
      </p>
    </div>
  );
}
