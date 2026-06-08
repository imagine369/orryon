"use client";

import { usePreferences } from "@/lib/use-preferences";

const BRIEFING_SECTIONS = [
  { key: "finance",  label: "Finances" },
  { key: "health",   label: "Health & medications" },
  { key: "calendar", label: "Calendar & events" },
  { key: "goals",    label: "Goals progress" },
];

const BRIEFING_TIMES = ["06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00"];

export function BriefingView({ prefs, onUpdate }: { prefs: ReturnType<typeof usePreferences>["prefs"]; onUpdate: ReturnType<typeof usePreferences>["update"]; }) {
  const includes = (prefs.briefing_includes || "finance,health,calendar,goals").split(",");

  const toggleSection = (key: string) => {
    const next = includes.includes(key) ? includes.filter((k) => k !== key) : [...includes, key];
    onUpdate({ briefing_includes: next.join(",") });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Briefing time</p>
        <div className="grid grid-cols-3 gap-2">
          {BRIEFING_TIMES.map((t) => (
            <button
              key={t}
              onClick={() => onUpdate({ briefing_time: t })}
              className={`min-h-[44px] rounded-xl text-xs font-medium transition border ${prefs.briefing_time === t ? "border-white/20 bg-white/10 text-white/90" : "border-white/[0.06] bg-white/[0.03] text-white/35 hover:bg-white/[0.06]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Include in briefing</p>
        {BRIEFING_SECTIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-2 border-b border-white/[0.04] min-h-[52px]">
            <p className="text-sm text-white/70">{label}</p>
            <button
              onClick={() => toggleSection(key)}
              className={`relative flex items-center justify-center w-11 h-11 rounded-full transition-colors duration-200`}
              aria-checked={includes.includes(key)}
              role="switch"
            >
              <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 block ${includes.includes(key) ? "bg-white/80" : "bg-white/10"}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black transition-transform duration-200 ${includes.includes(key) ? "translate-x-4" : "translate-x-0"}`} />
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
