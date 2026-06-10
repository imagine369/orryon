"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft } from "lucide-react";
import { usePanels } from "@/lib/panel-context";
import { VIEW_TITLES } from "@/components/settings/constants";
import { useSettingsPanel } from "@/components/settings/use-settings-panel";
import { SettingsViewContent } from "@/components/settings/settings-view-content";

export function SettingsPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "settings";
  const panel = useSettingsPanel();
  const { view, settings, settingsLoading, settingsError, reloadSettings, goBack } = panel;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={close}
          />

          <motion.div
            key="settings-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.2 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 500) close();
            }}
            className="fixed top-0 right-0 h-full z-50 flex flex-col"
            style={{ width: "95vw", maxWidth: 600 }}
          >
            <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 sticky top-0 bg-[#080808] z-10 border-b border-white/5 rounded-tl-2xl">
                <div className="flex items-center gap-3">
                  {view && (
                    <button
                      onClick={goBack}
                      className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/5 transition-colors -ml-1"
                    >
                      <ArrowLeft className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                    </button>
                  )}
                  <h1 className="text-lg font-bold">
                    {view ? VIEW_TITLES[view] : "Your Account"}
                  </h1>
                </div>
                <button
                  onClick={close}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                </button>
              </div>

              {settingsLoading || (!settings && !settingsError) ? (
                <div className="flex items-center justify-center flex-1">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                </div>
              ) : settingsError && !settings ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center">
                  <p className="text-sm text-white/50 leading-relaxed">{settingsError}</p>
                  <button
                    type="button"
                    onClick={reloadSettings}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="px-5 py-5 flex-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={view ?? "main"}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      <SettingsViewContent panel={panel} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
