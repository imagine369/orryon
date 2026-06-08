"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSubscription } from "@/lib/use-subscription";
import { api } from "@/lib/api";
import { useChatUsage } from "@/lib/use-chat-usage";
import { usePreferences } from "@/lib/use-preferences";
import {
  planAllowsVoiceInput,
  planAllowsVoiceOutput,
  planShowsSpeakResponsesToggle,
} from "@/lib/voice-plan";
import { deriveOrryonAliveState } from "@/lib/orryon-alive-state";
import { DeleteConfirmModal } from "@/components/delete-confirm-modal";
import { VoiceLimitModal } from "@/components/voice-limit-modal";
import { UpgradeLimitModal } from "@/components/upgrade-limit-modal";
import { ChatSessionSidebar } from "@/components/chat-session-sidebar";
import { ChatActivationScreen } from "@/components/home/chat-activation-screen";
import { ChatEmptyState } from "@/components/home/chat-empty-state";
import { ChatActiveView } from "@/components/home/chat-active-view";
import { useChatTransport } from "@/lib/use-chat-transport";
import { usePostCheckout } from "@/lib/use-post-checkout";
import { usePlanLimitModal } from "@/lib/use-plan-limit-modal";
import { useVoiceChat } from "@/lib/use-voice-chat";
import { useHomeChat, useChatSessions } from "@/lib/use-home-chat";

export default function HomePage() {
  const router = useRouter();
  const { sub, refresh: refreshSub } = useSubscription();
  const { usage: chatUsage, reload: reloadChatUsage } = useChatUsage();
  const { prefs, update: updatePrefs } = usePreferences();

  const [sessionId, setSessionId] = useState("");
  const [tasksDueToday, setTasksDueToday] = useState<number | null>(null);

  useChatTransport();

  const { activating, activationPlan, upgradeBanner } = usePostCheckout(sub, refreshSub);
  const { open, setOpen, info, openModal } = usePlanLimitModal(sub?.plan, chatUsage);
  const voice = useVoiceChat();

  const chat = useHomeChat({
    sessionId,
    setSessionId,
    plan: sub?.plan,
    chatUsage,
    reloadChatUsage,
    openPlanLimitModal: openModal,
  });

  const sessions = useChatSessions(
    sessionId,
    setSessionId,
    chat.clearMessages,
    chat.replaceMessages,
  );

  const voiceInputOn = planAllowsVoiceInput(sub?.plan);
  const voiceOverlayOn = planAllowsVoiceOutput(sub?.plan, prefs.voice_overlay_enabled);
  const showSpeakToggle = planShowsSpeakResponsesToggle(sub?.plan);
  const orryonAliveState = deriveOrryonAliveState(
    voice.status,
    chat.streaming,
    chat.thinking,
  );

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    api
      .get<{ open_tasks: { due_date: string }[] }>("/api/dashboard/stats")
      .then((stats) => {
        if (stats?.open_tasks) {
          const count = stats.open_tasks.filter((t) => t.due_date === today).length;
          setTasksDueToday(count);
        }
      })
      .catch(() => {});
  }, []);

  if (activating) {
    return <ChatActivationScreen activationPlan={activationPlan} />;
  }

  const sharedProps = {
    plan: sub?.plan,
    showSpeakToggle,
    voiceOverlayOn,
    onToggleVoiceOverlay: () =>
      updatePrefs({ voice_overlay_enabled: !prefs.voice_overlay_enabled }),
    onOpenHistory: sessions.handleOpenHistory,
    onNewChat: sessions.handleNewChat,
    onSend: chat.handleSend,
    streaming: chat.streaming,
    voiceInputOn,
    voiceStatus: voice.status,
    onVoiceStatusChange: voice.setStatus,
    onVoiceError: voice.handleError,
    voiceError: voice.error,
  };

  return (
    <>
      <DeleteConfirmModal
        pending={chat.pendingDelete}
        onConfirm={chat.handleConfirmDelete}
        onCancel={chat.handleCancelDelete}
      />

      <VoiceLimitModal
        open={voice.limitOpen}
        onClose={() => voice.setLimitOpen(false)}
        onContinueText={() => voice.setLimitOpen(false)}
        onUpgrade={() => {
          voice.setLimitOpen(false);
          router.push("/upgrade");
        }}
        minutesUsed={voice.limitInfo?.minutesUsed}
        limitMinutes={voice.limitInfo?.limitMinutes}
      />

      <UpgradeLimitModal
        open={open}
        onClose={() => setOpen(false)}
        onUpgrade={() => {
          setOpen(false);
          router.push("/upgrade");
        }}
        kind={info?.kind ?? "usage"}
        plan={info?.plan ?? sub?.plan ?? "pro"}
        upgradePlan={info?.upgradePlan}
        messagesUsed={info?.messagesUsed ?? 0}
        messageLimit={info?.messageLimit ?? 0}
        spendUsd={info?.spendUsd ?? 0}
        spendCapUsd={info?.spendCapUsd ?? 0}
      />

      <AnimatePresence>
        {sessions.historyOpen && (
          <ChatSessionSidebar
            open={sessions.historyOpen}
            onClose={() => sessions.setHistoryOpen(false)}
            sessions={sessions.sessions}
            sessionsLoading={sessions.sessionsLoading}
            activeSessionId={sessionId}
            onNewChat={sessions.handleNewChat}
            onSelectSession={sessions.handleSelectSession}
            onDeleteSession={sessions.handleDeleteSession}
          />
        )}
      </AnimatePresence>

      {chat.messages.length === 0 ? (
        <ChatEmptyState
          orryonAliveState={orryonAliveState}
          tasksDueToday={tasksDueToday}
          upgradeBanner={upgradeBanner}
          {...sharedProps}
        />
      ) : (
        <ChatActiveView
          messages={chat.messages}
          thinking={chat.thinking}
          toolLabel={chat.toolLabel}
          copiedIndex={chat.copiedIndex}
          onCopy={chat.handleCopy}
          onRetry={chat.handleRetry}
          orryonAliveState={orryonAliveState}
          bottomRef={chat.bottomRef}
          upgradeBanner={upgradeBanner}
          chatUsage={chatUsage}
          onUpgrade={() => router.push("/upgrade")}
          {...sharedProps}
        />
      )}
    </>
  );
}
