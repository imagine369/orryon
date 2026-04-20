"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Feather } from "lucide-react";
import { usePanels } from "@/lib/panel-context";
import { NotesTab } from "@/components/dashboard/notes-tab";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function JournalPanel() {
  const { openPanel, close } = usePanels();
  const isOpen = openPanel === "journal";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="journal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={close}
          />

          <motion.div
            key="journal-panel"
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
            <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 sticky top-0 bg-[#080808] z-10 border-b border-white/5 rounded-tl-2xl shrink-0">
                <div className="flex items-center gap-2">
                  <Feather className="h-5 w-5 text-white" strokeWidth={1.5} />
                  <h1 className="text-2xl font-extrabold">Journal</h1>
                </div>
                <button
                  onClick={close}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5" data-scroll-container>
                <ErrorBoundary fallback={
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-white/40 text-sm mb-3">Something went wrong loading your journal.</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="text-xs text-white/30 hover:text-white/60 underline transition"
                    >
                      Reload
                    </button>
                  </div>
                }>
                  <NotesTab />
                </ErrorBoundary>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
