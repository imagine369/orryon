"use client";

import { motion } from "framer-motion";
import {
  Settings, LayoutGrid, Bell, Search, Heart, Feather,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Panel = "dashboard" | "settings" | "health" | "journal" | "reset" | null;

interface NavBarHeaderActionsProps {
  openPanel: Panel;
  toggle: (panel: Exclude<Panel, null>) => void;
  notifCount: number;
  onOpenSearch: () => void;
  onToggleNotifications: () => void;
  notifOpen: boolean;
}

export function NavBarHeaderActions({
  openPanel,
  toggle,
  notifCount,
  onOpenSearch,
  onToggleNotifications,
  notifOpen,
}: NavBarHeaderActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onOpenSearch}
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
          animate={openPanel === "reset" ? { scale: 1 } : { scale: [0.88, 1.0, 0.88] }}
          transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            opacity: 0.72,
            background:
              "radial-gradient(circle at 50% 28%, #e0a8c8 0%, #cca0d8 16%, #a890d0 32%, #90a0d8 48%, #68b8d8 62%, #3ecfbe 76%, #1ab8a0 92%, #14b098 100%)",
          }}
        />
      </button>

      <button
        onClick={onToggleNotifications}
        className={cn(
          "relative flex items-center justify-center rounded-lg p-2 transition-colors",
          "text-white/60 hover:text-white hover:bg-white/5",
          notifOpen && "text-white bg-white/5",
        )}
      >
        <Bell className="h-5 w-5" strokeWidth={1.5} />
        {notifCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white" />
        )}
      </button>

      <button
        onClick={() => toggle("health")}
        className={cn(
          "flex items-center justify-center rounded-lg p-2 transition-colors",
          "text-white/60 hover:text-white hover:bg-white/5",
          openPanel === "health" && "text-white bg-white/5",
        )}
        aria-label="Health"
      >
        <Heart className="h-5 w-5" strokeWidth={1.5} />
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
  );
}
