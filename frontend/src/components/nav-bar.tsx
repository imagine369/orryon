"use client";

import { useState } from "react";
import {
  Settings, LayoutGrid, Bell, X, Search, Flame, Feather,
} from "lucide-react";
import { ListsTab } from "@/components/dashboard/lists-tab";
import { CalendarTab } from "@/components/dashboard/calendar-tab";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { SearchPanel } from "@/components/search-panel";
import { SiteNav } from "@/components/site-nav";
import { usePanels } from "@/lib/panel-context";
import { type Tab } from "@/components/nav-bar/types";
import { useNavBarToday } from "@/components/nav-bar/use-nav-bar-today";
import { TodayTab } from "@/components/nav-bar/today-tab";

const TABS: { key: Tab; label: string }[] = [
  { key: "today",    label: "Today"    },
  { key: "calendar", label: "Calendar" },
  { key: "lists",    label: "Lists"    },
];

export function NavBar() {
  const { openPanel, toggle } = usePanels();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("today");

  const today = useNavBarToday(notifOpen);

  return (
    <>
      <SiteNav logoHref="/home" safeArea>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center rounded-lg p-2 transition-colors text-white/60 hover:text-white hover:bg-white/5"
          >
            <Search className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <button
            onClick={() => toggle("reset")}
            className={cn(
              "relative flex items-center justify-center rounded-lg p-2 transition-opacity",
              openPanel === "reset" ? "opacity-100 bg-white/5" : "opacity-70 hover:opacity-100 hover:bg-white/5",
            )}
            aria-label="Reset Anchors"
          >
            <motion.div
              animate={
                openPanel === "reset"
                  ? { scale: 1 }
                  : { scale: [0.88, 1.0, 0.88] }
              }
              transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                opacity: 0.72,
                background: "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
              }}
            />
          </button>

          <button
            onClick={() => setNotifOpen((v) => !v)}
            className={cn(
              "relative flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              notifOpen && "text-white bg-white/5",
            )}
          >
            <Bell className="h-5 w-5" strokeWidth={1.5} />
            {today.totalCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </button>

          <button
            onClick={() => toggle("streaks")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "streaks" && "text-white bg-white/5",
            )}
            aria-label="Streaks"
          >
            <Flame className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <button
            onClick={() => toggle("journal")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "journal" && "text-white bg-white/5",
            )}
            aria-label="Journal"
          >
            <Feather className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <button
            onClick={() => toggle("dashboard")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "dashboard" && "text-white bg-white/5",
            )}
          >
            <LayoutGrid className="h-5 w-5" strokeWidth={1.5} />
          </button>

          <button
            onClick={() => toggle("settings")}
            className={cn(
              "flex items-center justify-center rounded-lg p-2 transition-colors",
              "text-white/60 hover:text-white hover:bg-white/5",
              openPanel === "settings" && "text-white bg-white/5",
            )}
          >
            <Settings className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>
      </SiteNav>

      <AnimatePresence>
        {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {notifOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setNotifOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.2 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80 || info.velocity.x > 500) setNotifOpen(false);
              }}
              className="fixed top-0 right-0 h-full z-50 flex flex-col"
              style={{ width: "95vw", maxWidth: 600 }}
            >
              <div className="h-full bg-[#080808] rounded-l-2xl shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0" style={{ paddingTop: "max(1rem, calc(1rem + env(safe-area-inset-top)))" }}>
                  <h1 className="text-2xl font-extrabold">Quick Access</h1>
                  <button onClick={() => setNotifOpen(false)} className="flex items-center justify-center w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
                    <X className="h-4 w-4 text-white/60" strokeWidth={1.5} />
                  </button>
                </div>

                <div className="px-5 pb-3 shrink-0">
                  <div className="flex rounded-full border border-white/5 bg-[#111] p-0.5">
                    {TABS.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setActiveTab(key)}
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

                <div className="flex-1 overflow-y-auto px-5 pb-4" data-scroll-container style={{ paddingBottom: "max(1rem, calc(1rem + env(safe-area-inset-bottom)))" }}>
                  <ErrorBoundary fallback={
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-white/40 text-sm mb-3">Something went wrong loading this tab.</p>
                      <button onClick={() => window.location.reload()} className="text-xs text-white/30 hover:text-white/60 underline transition">Reload</button>
                    </div>
                  }>
                    {activeTab === "today" && <TodayTab today={today} />}
                    {activeTab === "calendar" && <CalendarTab />}
                    {activeTab === "lists" && <ListsTab />}
                  </ErrorBoundary>
                </div>

                <div className="px-5 py-4 border-t border-white/5 shrink-0">
                  <button
                    onClick={() => { setNotifOpen(false); toggle("dashboard"); }}
                    className="block w-full text-center text-xs text-white/30 hover:text-white/60 transition"
                  >
                    View full dashboard →
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
