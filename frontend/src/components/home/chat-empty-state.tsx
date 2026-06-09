import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getGreeting, CHAT_CONTAINER } from "@/lib/chat-helpers";
import { formatDisplayName } from "@/lib/format-display-name";
import { AmbientAvatar } from "@/components/ambient/ambient-avatar";
import { OrryonAliveAvatar } from "@/components/orryon-alive-avatar";
import type { AmbientAvatarState } from "@/lib/ambient-avatar-state";
import {
  resolveAmbientAliveState,
  shouldShowAmbientCenterAvatar,
} from "@/lib/ambient-alive-state";
import { ChatStarterPrompts } from "@/components/chat-starter-prompts";
import type { OrryonAliveState } from "@/lib/orryon-alive-state";
import { ChatHeaderActions, BreathePromoEmpty } from "@/components/home/chat-header-actions";
import { UpgradeSuccessBanner } from "@/components/home/upgrade-success-banner";
import { ChatInputFooter } from "@/components/home/chat-input-footer";
import type { VoiceStatus } from "@/components/chat-input";
import type { MessageSource } from "@/components/chat-input";

interface ChatEmptyStateProps {
  orryonAliveState: OrryonAliveState;
  ambientEnabled?: boolean;
  ambientState?: AmbientAvatarState;
  tasksDueToday: number | null;
  upgradeBanner: boolean;
  plan?: string | null;
  showSpeakToggle: boolean;
  voiceOverlayOn: boolean;
  onToggleVoiceOverlay: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  onSend: (text: string, source?: MessageSource) => void;
  streaming: boolean;
  voiceInputOn: boolean;
  voiceStatus: VoiceStatus;
  onVoiceStatusChange: (status: VoiceStatus) => void;
  onVoiceError: (errorOrMessage: string | Error) => void;
  voiceError: string | null;
}

export function ChatEmptyState({
  orryonAliveState,
  ambientEnabled = false,
  ambientState = "sleeping",
  tasksDueToday,
  upgradeBanner,
  plan,
  showSpeakToggle,
  voiceOverlayOn,
  onToggleVoiceOverlay,
  onOpenHistory,
  onNewChat,
  onSend,
  streaming,
  voiceInputOn,
  voiceStatus,
  onVoiceStatusChange,
  onVoiceError,
  voiceError,
}: ChatEmptyStateProps) {
  const { user } = useAuth();
  const greeting = getGreeting();
  const showAmbientCenter = shouldShowAmbientCenterAvatar(
    ambientEnabled,
    ambientState,
    false,
  );
  const displayAliveState = resolveAmbientAliveState(
    ambientState,
    orryonAliveState,
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className={`${CHAT_CONTAINER} flex shrink-0 items-center justify-end py-3`}>
        <ChatHeaderActions
          variant="empty"
          showSpeakToggle={showSpeakToggle}
          voiceOverlayOn={voiceOverlayOn}
          onToggleVoiceOverlay={onToggleVoiceOverlay}
          onOpenHistory={onOpenHistory}
          onNewChat={onNewChat}
        />
      </div>

      <UpgradeSuccessBanner show={upgradeBanner} plan={plan} rounded="full" />

      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="mb-5 md:mb-6">
            {showAmbientCenter ? (
              <AmbientAvatar
                ambientState={ambientState}
                aliveState={displayAliveState}
                size={96}
                className="md:scale-110"
                idlePulse
                priority
              />
            ) : (
              <OrryonAliveAvatar
                size={96}
                state={orryonAliveState}
                idlePulse
                priority
              />
            )}
          </div>
          <p className="mb-4 max-w-[260px] text-center text-[15px] leading-tight text-white/50">
            {greeting}
            {user?.display_name ? `, ${formatDisplayName(user.display_name)}` : ""}.
          </p>
          <ChatStarterPrompts onPick={onSend} disabled={streaming} />

          {tasksDueToday !== null && tasksDueToday > 0 && (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-4 py-2.5 text-sm text-white/45 transition hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white/75"
            >
              <span className="text-white/25" aria-hidden>
                ✦
              </span>
              <span>
                {greeting}. You have {tasksDueToday} task
                {tasksDueToday !== 1 ? "s" : ""} due today.
              </span>
            </Link>
          )}

          {plan === "starter" && <BreathePromoEmpty />}
        </div>

        <ChatInputFooter
          onSend={onSend}
          disabled={streaming}
          enableMic={voiceInputOn}
          voiceStatus={voiceStatus}
          onVoiceStatusChange={onVoiceStatusChange}
          onVoiceError={onVoiceError}
          voiceError={voiceError}
          plan={plan}
        />
      </div>
    </div>
  );
}
