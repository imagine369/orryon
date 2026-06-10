"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import { ListsTab } from "@/components/dashboard/lists-tab";
import { CalendarTab } from "@/components/dashboard/calendar-tab";
import { ErrandsTab } from "@/components/nav-bar/errands-tab";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TodayTab } from "@/components/nav-bar/today-tab";
import type { Tab } from "@/components/nav-bar/types";
import type { useNavBarToday } from "@/components/nav-bar/use-nav-bar-today";
import { QUICK_ACCESS_TAB_KEYS, scheduleDataChanged } from "@/lib/use-data-refresh";

const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "errands", label: "Errands" },
  { key: "calendar", label: "Calendar" },
  { key: "lists", label: "Lists" },
];

interface QuickAccessDrawerProps {
  open: boolean;
  onClose: () => void;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  today: ReturnType<typeof useNavBarToday>;
  onOpenDashboard: () => void;
}

export function QuickAccessDrawer({
  open,
  onClose,
  activeTab,
  onTabChange,
  today,
  onOpenDashboard,
}: QuickAccessDrawerProps) {
  useEffect(() => {
    if (!open) return;
    scheduleDataChanged([...QUICK_ACCESS_TAB_KEYS, "schedule", "dashboard"]);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.2 }}
        onDragEnd={(_, info) => {
          if (info.offset.x > 80 || info.velocity.x > 500) onClose();
        }}
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{ width: "95vw", maxWidth: 600 }}
      >
        <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl flex flex-col">
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0"
            style={{ paddingTop: "max(1rem, calc(1rem + env(safe-area-inset-top)))" }}
          >
            <h1 className="text-2xl font-extrabold">Quick Access</h1>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
            </button>
          </div>

          <div className="px-5 pb-3 shrink-0">
            <div className="flex rounded-full border border-white/5 bg-[#111] p-0.5">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => onTabChange(key)}
                  className="flex-1 rounded-full py-2.5 text-xs font-medium transition-all duration-200 min-h-[44px] flex items-center justify-center"
                  style={{
                    background: activeTab === key ? "rgba(255,255,255,0.1)" : "transparent",
                    color: activeTab === key ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto px-5 pb-4"
            data-scroll-container
            style={{ paddingBottom: "max(1rem, calc(1rem + env(safe-area-inset-bottom)))" }}
          >
            <ErrorBoundary
              fallback={
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-white/40 text-sm mb-3">Something went wrong loading this tab.</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-xs text-white/30 hover:text-white/60 underline transition"
                  >
                    Reload
                  </button>
                </div>
              }
            >
              {/* Keep all tabs mounted while open so chat refreshes reach every panel */}
              <div className={activeTab === "today" ? undefined : "hidden"}>
                <TodayTab today={today} />
              </div>
              <div className={activeTab === "errands" ? undefined : "hidden"}>
                <ErrandsTab />
              </div>
              <div className={activeTab === "calendar" ? undefined : "hidden"}>
                <CalendarTab />
              </div>
              <div className={activeTab === "lists" ? undefined : "hidden"}>
                <ListsTab />
              </div>
            </ErrorBoundary>
          </div>

          <div className="px-5 py-4 border-t border-white/5 shrink-0">
            <button
              onClick={onOpenDashboard}
              className="block w-full text-center text-xs text-white/30 hover:text-white/60 transition"
            >
              View full dashboard →
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
