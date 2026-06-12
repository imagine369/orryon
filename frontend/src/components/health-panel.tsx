"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePanels } from "@/lib/panel-context";
import { useStreaks } from "@/lib/use-streaks";
import { HealthMainView } from "./health-panel/health-main-view";
import { StreakDetailView } from "./health-panel/streak-detail-view";

export function HealthPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "health";

  const { streaks, createStreak, deleteStreak, updateStreak, toggleDay } = useStreaks();

  const [view, setView] = useState<"main" | "streak-detail">("main");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => {
      setView("main");
      setSelectedId(null);
    }, 300);
    return () => clearTimeout(t);
  }, [isOpen]);

  const selected = useMemo(
    () => streaks.find((s) => s.id === selectedId) ?? null,
    [streaks, selectedId]
  );

  useEffect(() => {
    queueMicrotask(() => {
      if (view === "streak-detail" && selectedId && !selected) {
        setView("main");
        setSelectedId(null);
      }
    });
  }, [view, selectedId, selected]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="health-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={close}
          />

          <motion.div
            key="health-panel"
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
            <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl overflow-hidden flex flex-col">
              <AnimatePresence mode="wait" initial={false}>
                {view === "main" && (
                  <motion.div
                    key="main"
                    initial={{ x: -24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -24, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex-1 flex flex-col min-h-0"
                  >
                    <HealthMainView
                      streaks={streaks}
                      onOpenStreak={(id) => { setSelectedId(id); setView("streak-detail"); }}
                      onCreate={(name, emoji, targetDays) => createStreak(name, emoji, targetDays)}
                      onDelete={deleteStreak}
                      onClose={close}
                    />
                  </motion.div>
                )}
                {view === "streak-detail" && selected && (
                  <motion.div
                    key={`streak-detail-${selected.id}`}
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex-1 flex flex-col min-h-0"
                  >
                    <StreakDetailView
                      streak={selected}
                      onBack={() => setView("main")}
                      onToggleDay={(k) => toggleDay(selected.id, k)}
                      onUpdate={(patch) => updateStreak(selected.id, patch)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
