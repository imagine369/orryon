"use client";

import { useEffect, useState } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { motion, AnimatePresence } from "framer-motion";
import { LifePrioritiesPicker } from "@/components/life-priorities-picker";
import type { LifePriorityId } from "@/lib/life-priorities";
import { usePreferences } from "@/lib/use-preferences";

/**
 * One-screen interest onboarding (X-style): pick up to 3 focus areas.
 * Shown once per account until skipped or saved.
 */
export function LifeInterestsOnboarding() {
  const { prefs, loading, update } = usePreferences();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<LifePriorityId[]>([]);
  const [saving, setSaving] = useState(false);

  useQueuedEffect(() => {
    if (!loading && !prefs.life_priorities_set) {
      setOpen(true);
    }
  }, [loading, prefs.life_priorities_set]);

  useEffect(() => {
    document.body.classList.toggle("orryon-onboarding-open", open);
    return () => document.body.classList.remove("orryon-onboarding-open");
  }, [open]);

  async function finish(picks: LifePriorityId[]) {
    setSaving(true);
    try {
      await update({
        life_priorities: picks,
        life_priorities_set: true,
        onboarding_complete: true,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
          >
            <p className="text-[0.65rem] uppercase tracking-[2px] text-white/40 mb-2">
              Welcome to Orryon
            </p>
            <h2 className="text-xl font-semibold text-white/90 mb-1">
              {prefs.golden_mode_enabled
                ? "What should I focus on for you?"
                : "What matters most to you?"}
            </h2>
            <p className="text-sm text-white/50 mb-5 leading-relaxed">
              Pick up to three. Home shortcuts will match — and Orryon learns more
              from what you chat about over time. Change anytime in Settings.
            </p>

            <LifePrioritiesPicker
              selected={selected}
              onChange={setSelected}
              gentle={prefs.golden_mode_enabled}
            />

            <p className="mt-3 text-center text-[11px] text-white/30">
              {selected.length}/{3} selected
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                disabled={saving}
                onClick={() => finish([])}
                className="text-sm text-white/40 hover:text-white/65 disabled:opacity-40 py-2"
              >
                Skip for now
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => finish(selected)}
                className="rounded-full bg-white/90 px-6 py-2.5 text-sm font-medium text-black hover:bg-white disabled:opacity-50"
              >
                {selected.length > 0 ? "Continue" : "Continue without picks"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
