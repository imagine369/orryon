"use client";

import { useCallback, useState } from "react";
import type { PendingDestructiveAction } from "@/components/delete-confirm-modal";

/**
 * Destructive tool confirmation for chat (confirm_required SSE/WS events).
 * Backend blocks delete_* until user_confirmed=true; successful deletes are audit-logged.
 */
export function useDestructiveConfirm(
  runAI: (text: string) => void,
  onUserMessage?: (text: string) => void,
) {
  const [pendingDelete, setPendingDelete] =
    useState<PendingDestructiveAction | null>(null);

  const clearPending = useCallback(() => setPendingDelete(null), []);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const argsJson = JSON.stringify(pendingDelete.args || {});
    const text = [
      `Yes, I confirm. Proceed with ${pendingDelete.action} using user_confirmed=true.`,
      `Use these exact arguments: ${argsJson}`,
    ].join(" ");
    setPendingDelete(null);
    onUserMessage?.("Yes, confirm delete.");
    runAI(text);
  }, [pendingDelete, runAI, onUserMessage]);

  const handleCancelDelete = useCallback(() => {
    setPendingDelete(null);
    onUserMessage?.("Cancel — do not delete anything.");
    runAI("Cancel — do not delete anything.");
  }, [runAI, onUserMessage]);

  return {
    pendingDelete,
    setPendingDelete,
    clearPending,
    handleConfirmDelete,
    handleCancelDelete,
  };
}
