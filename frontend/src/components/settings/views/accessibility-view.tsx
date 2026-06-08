"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "@/lib/use-preferences";
import { useSubscription } from "@/lib/use-subscription";
import { LifePrioritiesPicker } from "@/components/life-priorities-picker";

export function AccessibilityView({ prefs, onUpdate, sub }: {
  prefs: ReturnType<typeof usePreferences>["prefs"];
  onUpdate: ReturnType<typeof usePreferences>["update"];
  sub: ReturnType<typeof useSubscription>["sub"];
}) {
  const plan = sub?.plan;
  const isPlus = plan === "premium_plus";
  const [focusPicks, setFocusPicks] = useState(prefs.life_priorities);
  const [focusSaved, setFocusSaved] = useState(false);

  useEffect(() => {
    setFocusPicks(prefs.life_priorities);
  }, [prefs.life_priorities]);

  async function saveFocusAreas() {
    await onUpdate({
      life_priorities: focusPicks,
      life_priorities_set: true,
    });
    setFocusSaved(true);
    setTimeout(() => setFocusSaved(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="py-3 border-b border-white/[0.04]">
        <p className="text-sm text-white/80 font-medium mb-1">What matters most</p>
        <p className="text-xs text-white/35 mb-4 leading-relaxed">
          Up to three focus areas for home shortcuts. Orryon still learns from what
          you chat about most over time.
        </p>
        <LifePrioritiesPicker
          selected={focusPicks}
          onChange={setFocusPicks}
          gentle={prefs.golden_mode_enabled}
        />
        <button
          type="button"
          onClick={saveFocusAreas}
          className="mt-4 w-full rounded-full border border-white/[0.12] bg-white/[0.06] py-2.5 text-sm text-white/70 hover:bg-white/[0.1] hover:text-white/90"
        >
          {focusSaved ? "Saved" : "Save focus areas"}
        </button>
      </div>

      {/* Golden Mode */}
      <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.04]">
        <div>
          <p className="text-sm text-white/80 font-medium">Gentle Mode</p>
          <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
            A warmer, unhurried Orryon. Speaks more carefully, checks in often,
            and keeps everything simple.
          </p>
        </div>
        <button
          onClick={() => onUpdate({ golden_mode_enabled: !prefs.golden_mode_enabled })}
          className="relative shrink-0 flex items-center justify-center w-11 h-11 mt-0.5"
          role="switch"
          aria-checked={prefs.golden_mode_enabled}
        >
          <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 block ${prefs.golden_mode_enabled ? "bg-white/80" : "bg-white/10"}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-200 ${prefs.golden_mode_enabled ? "translate-x-4" : "translate-x-0"}`} />
          </span>
        </button>
      </div>

      {/* TTS — Premium Plus only */}
      {isPlus && (
        <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.04]">
          <div>
            <p className="text-sm text-white/80 font-medium">Speak responses aloud</p>
            <p className="text-xs text-white/35 mt-0.5 leading-relaxed">
              Hear Orryon read each reply (Premium Plus). Off = text only. Uses voice minutes.
            </p>
          </div>
          <button
            onClick={() => onUpdate({ voice_overlay_enabled: !prefs.voice_overlay_enabled })}
            className="relative shrink-0 flex items-center justify-center w-11 h-11 mt-0.5"
            role="switch"
            aria-checked={prefs.voice_overlay_enabled}
          >
            <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 block ${prefs.voice_overlay_enabled ? "bg-white/80" : "bg-white/10"}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-200 ${prefs.voice_overlay_enabled ? "translate-x-4" : "translate-x-0"}`} />
            </span>
          </button>
        </div>
      )}

      {sub?.plan === "pro" && (
        <p className="text-xs text-white/25 leading-relaxed">
          Pro is text-only. Upgrade to Premium to speak with the mic in chat.
        </p>
      )}
      {sub?.plan === "premium" && (
        <p className="text-xs text-white/25 leading-relaxed">
          Premium: speak or type — Orryon replies in text. Premium Plus adds spoken replies.
        </p>
      )}
    </div>
  );
}
