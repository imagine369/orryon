import { ChatInput, type VoiceStatus, type MessageSource } from "@/components/chat-input";
import { HEALTH_DISCLAIMER_SHORT, PRO_TEXT_ONLY_HINT } from "@/lib/life-os-copy";
import { CHAT_CONTAINER } from "@/lib/chat-helpers";

interface ChatInputFooterProps {
  onSend: (message: string, source?: MessageSource) => void;
  disabled: boolean;
  enableMic: boolean;
  voiceStatus: VoiceStatus;
  onVoiceStatusChange: (status: VoiceStatus) => void;
  onVoiceError: (errorOrMessage: string | Error) => void;
  voiceError: string | null;
  plan?: string | null;
}

export function ChatInputFooter({
  onSend,
  disabled,
  enableMic,
  voiceStatus,
  onVoiceStatusChange,
  onVoiceError,
  voiceError,
  plan,
}: ChatInputFooterProps) {
  return (
    <div
      className="shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-3"
      style={{
        paddingBottom: "max(1.25rem, calc(0.75rem + env(safe-area-inset-bottom)))",
      }}
    >
      <div className={CHAT_CONTAINER}>
        {voiceError && (
          <p className="mb-2 text-center text-[12px] text-white/55">{voiceError}</p>
        )}
        {(plan === "pro" || plan === "trial") && (
          <p className="mb-2 text-center text-[11px] leading-snug text-white/40 px-2">
            {PRO_TEXT_ONLY_HINT}
          </p>
        )}
        <ChatInput
          onSend={onSend}
          disabled={disabled}
          enableMic={enableMic}
          externalStatus={voiceStatus}
          onVoiceStatusChange={onVoiceStatusChange}
          onVoiceError={onVoiceError}
        />
        <p className="mt-2 text-center text-[10px] leading-snug text-white/25 px-2">
          {HEALTH_DISCLAIMER_SHORT}
        </p>
      </div>
    </div>
  );
}
