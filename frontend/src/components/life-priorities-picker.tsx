"use client";

import {
  LIFE_PRIORITY_OPTIONS,
  MAX_LIFE_PRIORITIES,
  type LifePriorityId,
} from "@/lib/life-priorities";

interface LifePrioritiesPickerProps {
  selected: LifePriorityId[];
  onChange: (next: LifePriorityId[]) => void;
  /** Larger tap targets for Gentle Mode */
  gentle?: boolean;
}

export function LifePrioritiesPicker({
  selected,
  onChange,
  gentle = false,
}: LifePrioritiesPickerProps) {
  function toggle(id: LifePriorityId) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
      return;
    }
    if (selected.length >= MAX_LIFE_PRIORITIES) return;
    onChange([...selected, id]);
  }

  return (
    <div
      className={`grid grid-cols-2 gap-2 ${gentle ? "gap-3" : ""}`}
      role="group"
      aria-label="Choose up to three focus areas"
    >
      {LIFE_PRIORITY_OPTIONS.map((opt) => {
        const on = selected.includes(opt.id);
        const full = !on && selected.length >= MAX_LIFE_PRIORITIES;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            disabled={full}
            aria-pressed={on}
            className={[
              "rounded-xl border text-left transition",
              gentle ? "px-4 py-4 min-h-[5.5rem]" : "px-3 py-3 min-h-[4.5rem]",
              on
                ? "border-white/35 bg-white/[0.12] text-white/90"
                : full
                  ? "border-white/[0.06] bg-white/[0.02] text-white/30 cursor-not-allowed"
                  : "border-white/[0.1] bg-white/[0.04] text-white/70 hover:border-white/[0.2] hover:bg-white/[0.07]",
            ].join(" ")}
          >
            <span
              className={`block font-medium leading-snug ${gentle ? "text-[15px]" : "text-[13px]"}`}
            >
              {opt.label}
            </span>
            <span
              className={`mt-1 block leading-snug text-white/40 ${gentle ? "text-[13px]" : "text-[11px]"}`}
            >
              {opt.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
