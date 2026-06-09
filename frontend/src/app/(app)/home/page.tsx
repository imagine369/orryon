"use client";

import { AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSubscription } from "@/lib/use-subscription";
import { useChatUsage } from "@/lib/use-chat-usage";
import { usePreferences } from "@/lib/use-preferences";
import {
  planAllowsVoiceInput,
  planAllowsVoiceOutput,
  planShowsSpeakResponsesToggle,
} from "@/lib/voice-plan";
import { deriveOrryonAliveState } from "@/lib/orryon-alive-state";
import { ChatSessionSidebar } from "@/components/chat-session-sidebar";
import { ChatActivationScreen } from "@/components/home/chat-activation-screen";
import { ChatEmptyState } from "@/components/home/chat-empty-state";
import { ChatActiveView } from "@/components/home/chat-active-view";
import { HomeChatModals } from "@/components/home/home-chat-modals";
import { useChatTransport } from "@/lib/use-chat-transport";
import { usePostCheckout } from "@/lib/use-post-checkout";
import { usePlanLimitModal } from "@/lib/use-plan-limit-modal";
import { useVoiceChat } from "@/lib/use-voice-chat";
import { useHomeChat, useChatSessions } from "@/lib/use-home-chat";
import { useHomeTasksDueToday } from "@/lib/use-home-tasks";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const { sub, refresh: refreshSub } = useSubscription();
  const { usage: chatUsage, reload: reloadChatUsage } = useChatUsage();
  const { prefs, update: updatePrefs } = usePreferences();
  const [sessionId, setSessionId] = useState("");

  useChatTransport();
  const tasksDueToday = useHomeTasksDueToday();
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
  const orryonAliveState = deriveOrryonAliveState(voice.status, chat.streaming, chat.thinking);

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
      <HomeChatModals
        pendingDelete={chat.pendingDelete}
        onConfirmDelete={chat.handleConfirmDelete}
        onCancelDelete={chat.handleCancelDelete}
        voiceLimitOpen={voice.limitOpen}
        onCloseVoiceLimit={() => voice.setLimitOpen(false)}
        voiceMinutesUsed={voice.limitInfo?.minutesUsed}
        voiceLimitMinutes={voice.limitInfo?.limitMinutes}
        upgradeOpen={open}
        onCloseUpgrade={() => setOpen(false)}
        upgradeInfo={info}
        plan={sub?.plan}
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
