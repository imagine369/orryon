"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const STORAGE_KEY = "orryon_life_os_onboarding_v3";

const STEPS = [
  {
    title: "Ask",
    body: "Chat covers planning, writing, how-tos, and more. Pro is text-only. Premium adds speak-in via the chat mic. Premium Plus can read replies aloud when you turn that on.",
  },
  {
    title: "Do",
    body: "When it's your life in Orryon — money, calendar, tasks, notes — Orryon actually does it. Log spending, check your week, set goals.",
  },
  {
    title: "Later",
    body: "Bank linking, Uber, food delivery, auto bill pay, and sending email on your behalf are coming in future phases.",
  },
] as const;

export function LifeOsOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("orryon-onboarding-open", open);
    return () => document.body.classList.remove("orryon-onboarding-open");
  }, [open]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
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
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
          >
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-4 top-4 text-white/40 hover:text-white/70"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-[0.65rem] uppercase tracking-[2px] text-white/40 mb-2">
              Welcome to Orryon
            </p>
            <h2 className="text-xl font-semibold text-white/90 mb-2">
              Your Life OS
            </h2>
            <p className="text-sm text-white/55 mb-6 leading-relaxed">
              {STEPS[step].body}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-white/70" : "bg-white/20"}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-white/90 px-5 py-2 text-sm font-medium text-black hover:bg-white"
              >
                {step < STEPS.length - 1 ? `Next: ${STEPS[step + 1].title}` : "Get started"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
