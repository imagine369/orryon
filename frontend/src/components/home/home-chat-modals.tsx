"use client";

import { useRouter } from "next/navigation";
import { DeleteConfirmModal } from "@/components/delete-confirm-modal";
import { VoiceLimitModal } from "@/components/voice-limit-modal";
import { UpgradeLimitModal } from "@/components/upgrade-limit-modal";
import type { PendingDestructiveAction } from "@/components/delete-confirm-modal";
import type { PlanLimitModalState } from "@/lib/use-plan-limit-modal";

interface HomeChatModalsProps {
  pendingDelete: PendingDestructiveAction | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  voiceLimitOpen: boolean;
  onCloseVoiceLimit: () => void;
  voiceMinutesUsed?: number;
  voiceLimitMinutes?: number;
  upgradeOpen: boolean;
  onCloseUpgrade: () => void;
  upgradeInfo: PlanLimitModalState | null;
  plan?: string;
}

export function HomeChatModals({
  pendingDelete,
  onConfirmDelete,
  onCancelDelete,
  voiceLimitOpen,
  onCloseVoiceLimit,
  voiceMinutesUsed,
  voiceLimitMinutes,
  upgradeOpen,
  onCloseUpgrade,
  upgradeInfo,
  plan,
}: HomeChatModalsProps) {
  const router = useRouter();

  return (
    <>
      <DeleteConfirmModal
        pending={pendingDelete}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
      <VoiceLimitModal
        open={voiceLimitOpen}
        onClose={onCloseVoiceLimit}
        onContinueText={onCloseVoiceLimit}
        onUpgrade={() => {
          onCloseVoiceLimit();
          router.push("/upgrade");
        }}
        minutesUsed={voiceMinutesUsed}
        limitMinutes={voiceLimitMinutes}
      />
      <UpgradeLimitModal
        open={upgradeOpen}
        onClose={onCloseUpgrade}
        onUpgrade={() => {
          onCloseUpgrade();
          router.push("/upgrade");
        }}
        kind={upgradeInfo?.kind ?? "usage"}
        plan={upgradeInfo?.plan ?? plan ?? "pro"}
        upgradePlan={upgradeInfo?.upgradePlan}
        messagesUsed={upgradeInfo?.messagesUsed ?? 0}
        messageLimit={upgradeInfo?.messageLimit ?? 0}
        spendUsd={upgradeInfo?.spendUsd ?? 0}
        spendCapUsd={upgradeInfo?.spendCapUsd ?? 0}
      />
    </>
  );
}
