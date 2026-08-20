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
import { AmbientOverlay } from "@/components/ambient/ambient-overlay";
import { resolveAmbientAliveState } from "@/lib/ambient-alive-state";
import { deriveOrryonAliveState } from "@/lib/orryon-alive-state";
import { useAmbientOrryon } from "@/lib/use-ambient-orryon";
import { ChatSessionSidebar } from "@/components/chat-session-sidebar";
import { ChatActivationScreen } from "@/components/home/chat-activation-screen";
import { ChatEmptyState } from "@/components/home/chat-empty-state";
import { ChatActiveView } from "@/components/home/chat-active-view";
import { HomeChatModals } from "@/components/home/home-chat-modals";
import { GoogleConnectBanner } from "@/components/home/google-connect-banner";
import { useChatTransport } from "@/lib/use-chat-transport";
import { usePostCheckout } from "@/lib/use-post-checkout";
import { usePlanLimitModal } from "@/lib/use-plan-limit-modal";
import { useVoiceChat } from "@/lib/use-voice-chat";
import { useHomeChat, useChatSessions } from "@/lib/use-home-chat";
import { useHomeTasksDueToday } from "@/lib/use-home-tasks";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { MessageSource, VoiceStatus } from "@/components/chat-input";

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

  const billingOn = Boolean(sub?.billing_enabled);
  const voiceInputOn = planAllowsVoiceInput(sub?.plan, billingOn);
  const voiceOverlayOn = planAllowsVoiceOutput(sub?.plan, prefs.voice_overlay_enabled, billingOn);
  const showSpeakToggle = planShowsSpeakResponsesToggle(sub?.plan, billingOn);
  const orryonAliveState = deriveOrryonAliveState(voice.status, chat.streaming, chat.thinking);

  const ambient = useAmbientOrryon({
    prefs,
    plan: sub?.plan,
    voiceStatus: voice.status,
    chatStreaming: chat.streaming,
    chatThinking: chat.thinking,
  });

  const displayAliveState = resolveAmbientAliveState(
    ambient.ambientState,
    orryonAliveState,
  );

  const {
    touchActivity,
    reportMotionResumed,
    primeAmbientWake,
    isAmbientEnabled,
  } = ambient;
  const { handleSend: sendChatMessage, handleRetry: retryChatMessage } = chat;
  const { setStatus: setVoiceStatus } = voice;

  const handleSend = useCallback(
    (text: string, source?: MessageSource) => {
      touchActivity();
      sendChatMessage(text, source);
    },
    [touchActivity, sendChatMessage],
  );

  const handleOrbTap = useCallback(() => {
    reportMotionResumed();
  }, [reportMotionResumed]);

  const handleRetry = useCallback(() => {
    touchActivity();
    retryChatMessage();
  }, [touchActivity, retryChatMessage]);

  const handleVoiceStatusChange = useCallback(
    (status: VoiceStatus) => {
      if (
        status === "listening" ||
        status === "transcribing" ||
        status === "speaking"
      ) {
        touchActivity();
      }
      setVoiceStatus(status);
    },
    [touchActivity, setVoiceStatus],
  );

  const wakePrimedRef = useRef(false);
  useEffect(() => {
    if (!isAmbientEnabled) {
      wakePrimedRef.current = false;
      return;
    }
    if (wakePrimedRef.current) return;

    const prime = () => {
      if (wakePrimedRef.current) return;
      wakePrimedRef.current = true;
      void primeAmbientWake();
    };

    window.addEventListener("pointerdown", prime, { once: true, passive: true });
    window.addEventListener("touchstart", prime, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("touchstart", prime);
    };
  }, [isAmbientEnabled, primeAmbientWake]);

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
    onSend: handleSend,
    streaming: chat.streaming,
    voiceInputOn,
    voiceStatus: voice.status,
    onVoiceStatusChange: handleVoiceStatusChange,
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

      <Suspense fallback={null}>
        <GoogleConnectBanner />
      </Suspense>

      {chat.messages.length === 0 ? (
        <ChatEmptyState
          orryonAliveState={orryonAliveState}
          ambientEnabled={ambient.isAmbientEnabled}
          ambientState={ambient.ambientState}
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
          onRetry={handleRetry}
          orryonAliveState={displayAliveState}
          bottomRef={chat.bottomRef}
          upgradeBanner={upgradeBanner}
          chatUsage={chatUsage}
          onUpgrade={() => router.push("/upgrade")}
          {...sharedProps}
        />
      )}

      <AmbientOverlay
        ambientEnabled={ambient.isAmbientEnabled}
        ambientState={ambient.ambientState}
        aliveState={displayAliveState}
        hasMessages={chat.messages.length > 0}
        onOrbTap={handleOrbTap}
      />
    </>
  );
}
