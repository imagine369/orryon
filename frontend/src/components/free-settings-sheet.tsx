"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ArrowUpRight, Loader2, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface FreeSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

type View = "main" | "delete-confirm";

/**
 * Minimal settings sheet for free-tier users on /breathe.
 * Covers: display name edit, email display, upgrade CTA, delete account, sign out.
 * Uses only existing design tokens — no new colours.
 */
export function FreeSettingsSheet({ open, onClose, onUpgrade }: FreeSettingsSheetProps) {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>("main");

  // Display name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.display_name || "");
  const [nameSaving, setNameSaving] = useState(false);

  // Delete flow
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setView("main");
        setEditingName(false);
        setDeleteError("");
      }, 300);
    }
  }, [open]);

  useEffect(() => {
    setNameInput(user?.display_name || "");
  }, [user?.display_name]);

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === user?.display_name) { setEditingName(false); return; }
    setNameSaving(true);
    try {
      await api.patch("/api/settings", { display_name: trimmed });
    } catch { /* non-fatal */ } finally {
      setNameSaving(false);
      setEditingName(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await api.delete("/api/account");
      await logout();
    } catch {
      setDeleteError("Couldn't delete account — please try again.");
      setDeleteLoading(false);
    }
  };

  const initials = ((user?.display_name || user?.email || "?"))
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.9 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-[#111] border-t border-white/[0.08] pb-safe"
            style={{ maxHeight: "85vh", overflowY: "auto" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-2 pb-4">
              <h2 className="text-base font-semibold text-white/85">
                {view === "delete-confirm" ? "Delete account" : "Account"}
              </h2>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-11 h-11 text-white/30 hover:text-white/60 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Main view ── */}
            {view === "main" && (
              <div className="px-5 pb-8 space-y-4">

                {/* Profile */}
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                  <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-white/70 shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveName();
                            if (e.key === "Escape") setEditingName(false);
                          }}
                          className="flex-1 bg-white/[0.07] border border-white/15 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none focus:border-white/25"
                          placeholder="Display name"
                        />
                        <button
                          onClick={saveName}
                          disabled={nameSaving}
                          className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 transition"
                        >
                          {nameSaving
                            ? <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin" />
                            : <Check className="w-3.5 h-3.5 text-white/70" strokeWidth={2} />}
                        </button>
                        <button
                          onClick={() => setEditingName(false)}
                          className="w-11 h-11 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition"
                        >
                          <X className="w-3.5 h-3.5 text-white/30" strokeWidth={2} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white/85 truncate">
                            {user?.display_name || "Set a name"}
                          </p>
                          <p className="text-xs text-white/30 mt-0.5 truncate">{user?.email}</p>
                        </div>
                        <button
                          onClick={() => { setNameInput(user?.display_name || ""); setEditingName(true); }}
                          className="text-xs text-white/35 hover:text-white/60 transition px-2 py-1 rounded-lg hover:bg-white/5 ml-2 shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Plan badge */}
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                  <div>
                    <p className="text-sm text-white/60">Current plan</p>
                    <p className="text-xs text-white/30 mt-0.5">Breathing is always free</p>
                  </div>
                  <span className="text-[10px] font-semibold tracking-widest text-white/40 uppercase px-2.5 py-1 rounded-full border border-white/10">
                    Free
                  </span>
                </div>

                {/* Upgrade CTA */}
                <button
                  onClick={() => { onClose(); onUpgrade(); }}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-2xl bg-white/[0.07] border border-white/[0.08] hover:bg-white/[0.10] active:bg-white/[0.05] transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-white/90">Upgrade to Pro</p>
                    <p className="text-xs text-white/35 mt-0.5">
                      AI concierge, budgets, goals, and more
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-white/30 shrink-0" />
                </button>

                {/* Divider */}
                <div className="border-t border-white/[0.05] my-2" />

                {/* Sign out */}
                <button
                  onClick={async () => { onClose(); await logout(); }}
                  className="w-full text-left px-4 py-3 rounded-2xl text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
                >
                  Sign out
                </button>

                {/* Delete account */}
                <button
                  onClick={() => setView("delete-confirm")}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm text-white/20 hover:text-white/40 hover:bg-white/[0.03] transition-colors"
                >
                  <span>Delete account</span>
                  <ChevronRight className="w-4 h-4 text-white/15" />
                </button>
              </div>
            )}

            {/* ── Delete confirm view ── */}
            {view === "delete-confirm" && (
              <div className="px-5 pb-8 space-y-4">
                <p className="text-sm text-white/50 leading-relaxed">
                  This permanently deletes your account and all data — breathing history,
                  streaks, and everything else. This cannot be undone.
                </p>

                {deleteError && (
                  <p className="text-xs text-red-400/80 px-1">{deleteError}</p>
                )}

                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className={cn(
                    "w-full py-3.5 rounded-2xl text-sm font-medium transition-colors",
                    "bg-white/[0.06] border border-white/10 text-white/50",
                    "hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400/80",
                    deleteLoading && "opacity-50 pointer-events-none"
                  )}
                >
                  {deleteLoading
                    ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</span>
                    : "Yes, permanently delete everything"}
                </button>

                <button
                  onClick={() => setView("main")}
                  className="w-full py-3 text-sm text-white/30 hover:text-white/50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
