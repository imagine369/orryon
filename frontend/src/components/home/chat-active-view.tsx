import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatThread } from "@/components/chat-thread";
import { UsageUpgradeBanner } from "@/components/usage-upgrade-banner";
import { CHAT_CONTAINER } from "@/lib/chat-helpers";
import type { OrryonAliveState } from "@/lib/orryon-alive-state";
import type { ChatMessage } from "@/lib/chat-types";
import type { ChatUsage } from "@/lib/use-chat-usage";
import { ChatHeaderActions } from "@/components/home/chat-header-actions";
import { UpgradeSuccessBanner } from "@/components/home/upgrade-success-banner";
import { ChatInputFooter } from "@/components/home/chat-input-footer";
import type { VoiceStatus } from "@/components/chat-input";
import type { MessageSource } from "@/components/chat-input";

interface ChatActiveViewProps {
  messages: ChatMessage[];
  streaming: boolean;
  thinking: boolean;
  toolLabel: string;
  copiedIndex: number | null;
  onCopy: (content: string, index: number) => void;
  onRetry: () => void;
  orryonAliveState: OrryonAliveState;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  upgradeBanner: boolean;
  plan?: string | null;
  chatUsage: ChatUsage | null;
  onUpgrade: () => void;
  showSpeakToggle: boolean;
  voiceOverlayOn: boolean;
  onToggleVoiceOverlay: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  onSend: (text: string, source?: MessageSource) => void;
  voiceInputOn: boolean;
  voiceStatus: VoiceStatus;
  onVoiceStatusChange: (status: VoiceStatus) => void;
  onVoiceError: (errorOrMessage: string | Error) => void;
  voiceError: string | null;
}

export function ChatActiveView({
  messages,
  streaming,
  thinking,
  toolLabel,
  copiedIndex,
  onCopy,
  onRetry,
  orryonAliveState,
  bottomRef,
  upgradeBanner,
  plan,
  chatUsage,
  onUpgrade,
  showSpeakToggle,
  voiceOverlayOn,
  onToggleVoiceOverlay,
  onOpenHistory,
  onNewChat,
  onSend,
  voiceInputOn,
  voiceStatus,
  onVoiceStatusChange,
  onVoiceError,
  voiceError,
}: ChatActiveViewProps) {
  return (
    <div className="flex h-full flex-col">
      <UpgradeSuccessBanner show={upgradeBanner} plan={plan} rounded="xl" />

      <ChatHeaderActions
        variant="chat"
        plan={plan}
        streaming={streaming}
        showSpeakToggle={showSpeakToggle}
        voiceOverlayOn={voiceOverlayOn}
        onToggleVoiceOverlay={onToggleVoiceOverlay}
        onOpenHistory={onOpenHistory}
        onNewChat={onNewChat}
      />

      <UsageUpgradeBanner usage={chatUsage} onUpgrade={onUpgrade} />

      <ScrollArea className="min-h-0 flex-1">
        <div className={`${CHAT_CONTAINER} py-8`}>
          <ChatThread
            messages={messages}
            streaming={streaming}
            thinking={thinking}
            toolLabel={toolLabel}
            copiedIndex={copiedIndex}
            onCopy={onCopy}
            onRetry={onRetry}
            aliveState={orryonAliveState}
          />
          <div ref={bottomRef} className="h-4" />
        </div>
      </ScrollArea>

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
  );
}
