"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { type VoiceStatus, type MessageSource } from "@/lib/chat-input-helpers";
import { useVoiceRecording } from "@/lib/use-voice-recording";

export type { VoiceStatus, MessageSource };

interface ChatInputProps {
  onSend: (message: string, source?: MessageSource) => void;
  disabled?: boolean;
  /** Mic / STT — Premium + Premium Plus (chat bar). */
  enableMic?: boolean;
  placeholder?: string;
  /**
   * External status bubble (e.g. "thinking" while the AI streams,
   * "speaking" while TTS plays) — purely for visual feedback on the mic.
   */
  externalStatus?: VoiceStatus;
  onVoiceStatusChange?: (status: VoiceStatus) => void;
  onVoiceError?: (errorOrMessage: string | Error) => void;
  /**
   * Fires synchronously on the very first mic tap of a session. The parent
   * can use it to "unlock" a persistent HTMLAudioElement while we're still
   * inside the user gesture, so that later programmatic TTS playback is
   * not blocked by iOS Safari autoplay rules.
   */
  onVoiceUserGesture?: () => void;
}

// The input component fills 100% of its parent container.
// All max-width constraints must be applied by the parent (e.g. max-w-3xl mx-auto).
export function ChatInput({
  onSend,
  disabled,
  enableMic = false,
  placeholder = "Ask me anything…",
  externalStatus = "idle",
  onVoiceStatusChange,
  onVoiceError,
  onVoiceUserGesture,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { effectiveStatus, isRecording, isBusy, handleMicClick, micTooltip } =
    useVoiceRecording({
      disabled,
      externalStatus,
      onSend,
      onVoiceStatusChange,
      onVoiceError,
      onVoiceUserGesture,
    });

  // Auto-resize textarea to fit content, up to max-height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleSend = () => {
    const msg = value.trim();
    if (!msg || disabled) return;
    onSend(msg, "text");
    setValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isMultiline = value.includes("\n") || value.length > 80;

  return (
    <div
      className={cn(
        "flex w-full gap-2 border bg-[#141414] px-4 transition-colors duration-150",
        isMultiline ? "items-end py-2.5 rounded-2xl" : "items-center py-2.5 rounded-full",
        isRecording
          ? "border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          : "border-white/[0.09] hover:border-white/[0.14] focus-within:border-white/[0.18]"
      )}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          effectiveStatus === "listening"
            ? "Listening… tap mic to send"
            : effectiveStatus === "transcribing"
              ? "Transcribing…"
              : effectiveStatus === "thinking"
                ? "Thinking…"
                : placeholder
        }
        disabled={disabled}
        rows={1}
        className={cn(
          "flex-1 min-w-0 resize-none bg-transparent text-[15px] text-white/90 outline-none overflow-y-auto [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden",
          isMultiline ? "py-1 leading-relaxed" : "h-11 py-0 leading-[44px]",
          isRecording ? "placeholder:text-white/60" : "placeholder:text-white/30"
        )}
        style={{ maxHeight: "200px", scrollbarWidth: "none" }}
      />

      {/* Mic — Premium + Premium Plus */}
      {enableMic && (
        <button
          onClick={handleMicClick}
          disabled={disabled}
          aria-label={micTooltip}
          title={micTooltip}
          className={cn(
            "relative shrink-0 flex items-center justify-center rounded-full w-11 h-11 transition-all duration-200",
            isRecording
              ? "bg-white text-black scale-110"
              : effectiveStatus === "transcribing" || effectiveStatus === "thinking"
                ? "text-white/70"
                : "text-white/35 hover:text-white/65",
            disabled && "pointer-events-none opacity-25"
          )}
        >
          {isRecording && (
            <>
              <span className="pointer-events-none absolute inset-0 rounded-full bg-white/30 animate-ping" />
              <span className="pointer-events-none absolute inset-[-6px] rounded-full border border-white/20 animate-[ping_1.4s_ease-out_0.3s_infinite]" />
            </>
          )}

          {!isRecording && isBusy && (
            <span className="pointer-events-none absolute inset-[-2px] rounded-full border border-white/15 animate-pulse" />
          )}

          {isRecording ? (
            <span className="pointer-events-none relative flex items-end gap-[3px] h-5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-black"
                  style={{
                    height: "100%",
                    animation: `soundbar 0.9s ease-in-out ${i * 0.15}s infinite alternate`,
                  }}
                />
              ))}
            </span>
          ) : (
            <Mic className="h-8 w-8" strokeWidth={1.5} />
          )}
        </button>
      )}

      {/* Send button — unchanged */}
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className={cn(
          "shrink-0 flex items-center justify-center rounded-full w-11 h-11 transition-all duration-150",
          value.trim()
            ? "bg-white text-black hover:bg-white/90 active:scale-95"
            : "bg-white/[0.08] text-white/25 cursor-not-allowed"
        )}
      >
        <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
    </div>
  );
}
