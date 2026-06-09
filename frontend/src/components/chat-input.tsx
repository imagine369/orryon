"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { type VoiceStatus, type MessageSource } from "@/lib/chat-input-helpers";
import { useVoiceRecording } from "@/lib/use-voice-recording";
import { ChatInputField } from "@/components/chat-input/chat-input-field";
import { ChatVoiceButton } from "@/components/chat-input/chat-voice-button";
import { ChatSendButton } from "@/components/chat-input/chat-send-button";

export type { VoiceStatus, MessageSource };

interface ChatInputProps {
  onSend: (message: string, source?: MessageSource) => void;
  disabled?: boolean;
  enableMic?: boolean;
  placeholder?: string;
  externalStatus?: VoiceStatus;
  onVoiceStatusChange?: (status: VoiceStatus) => void;
  onVoiceError?: (errorOrMessage: string | Error) => void;
  onVoiceUserGesture?: () => void;
}

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
          : "border-white/[0.09] hover:border-white/[0.14] focus-within:border-white/[0.18]",
      )}
    >
      <ChatInputField
        inputRef={inputRef}
        value={value}
        onChange={setValue}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        isMultiline={isMultiline}
        isRecording={isRecording}
        effectiveStatus={effectiveStatus}
        placeholder={placeholder}
      />
      {enableMic && (
        <ChatVoiceButton
          onClick={handleMicClick}
          disabled={disabled}
          isRecording={isRecording}
          isBusy={isBusy}
          micTooltip={micTooltip}
        />
      )}
      <ChatSendButton
        onClick={handleSend}
        disabled={disabled}
        canSend={!!value.trim()}
      />
    </div>
  );
}
