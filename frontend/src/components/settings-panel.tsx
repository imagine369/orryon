"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft } from "lucide-react";
import { usePanels } from "@/lib/panel-context";
import { useAuth } from "@/lib/auth-context";
import { VIEW_TITLES, bootstrapSettingsFromUser, DEMO_SETTINGS } from "@/components/settings/constants";
import { isDemo } from "@/components/settings/utils";
import { useSettingsPanel } from "@/components/settings/use-settings-panel";
import { SettingsViewContent } from "@/components/settings/settings-view-content";

export function SettingsPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "settings";
  const { user } = useAuth();
  const panel = useSettingsPanel();
  const { view, settingsLoading, settingsError, reloadSettings, goBack } = panel;

  const displaySettings = useMemo(() => {
    if (panel.settings) return panel.settings;
    if (isDemo()) return DEMO_SETTINGS;
    if (user) return bootstrapSettingsFromUser(user);
    return null;
  }, [panel.settings, user]);

  const resolvedPanel = useMemo(
    () => (displaySettings ? { ...panel, settings: displaySettings } : panel),
    [panel, displaySettings],
  );

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

              {!displaySettings ? (
                <div className="flex items-center justify-center flex-1">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                </div>
              ) : (
                <div className="px-5 py-5 flex-1">
                  {settingsLoading && (
                    <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/15 border-t-white/50" />
                      Syncing account details…
                    </div>
                  )}
                  {settingsError && !settingsLoading && (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2">
                      <p className="text-xs text-amber-100/75">{settingsError}</p>
                      <button
                        type="button"
                        onClick={reloadSettings}
                        className="shrink-0 text-xs font-medium text-amber-100/90 hover:text-amber-50"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={view ?? "main"}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      <SettingsViewContent panel={resolvedPanel} />
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
