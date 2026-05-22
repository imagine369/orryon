"use client";

import { motion, AnimatePresence } from "framer-motion";

export interface PendingDestructiveAction {
  action: string;
  message: string;
  args?: Record<string, unknown>;
}

interface DeleteConfirmModalProps {
  pending: PendingDestructiveAction | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function actionLabel(action: string): string {
  return action.replace(/^delete_/, "").replace(/_/g, " ");
}

export function DeleteConfirmModal({
  pending,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/75 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-sm rounded-2xl border border-red-500/25 bg-[#0c0c0c] p-5 shadow-2xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            role="alertdialog"
            aria-labelledby="delete-confirm-title"
          >
            <p
              id="delete-confirm-title"
              className="text-base font-semibold text-white/90 mb-2"
            >
              Confirm deletion
            </p>
            <p className="text-sm text-white/55 leading-relaxed mb-1">
              {pending.message ||
                `Permanently remove this ${actionLabel(pending.action)}?`}
            </p>
            <p className="text-xs text-white/35 mb-5">This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-full border border-white/15 py-2.5 text-sm text-white/70 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 rounded-full bg-red-600/90 py-2.5 text-sm font-medium text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
