"use client";

import { type KeyboardEvent, type RefObject } from "react";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "@/lib/chat-input-helpers";

interface ChatInputFieldProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  isMultiline: boolean;
  isRecording: boolean;
  effectiveStatus: VoiceStatus;
  placeholder: string;
}

export function ChatInputField({
  inputRef,
  value,
  onChange,
  onKeyDown,
  disabled,
  isMultiline,
  isRecording,
  effectiveStatus,
  placeholder,
}: ChatInputFieldProps) {
  const statusPlaceholder =
    effectiveStatus === "listening"
      ? "Listening… tap mic to send"
      : effectiveStatus === "transcribing"
        ? "Transcribing…"
        : effectiveStatus === "thinking"
          ? "Thinking…"
          : placeholder;

  return (
    <textarea
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={statusPlaceholder}
      disabled={disabled}
      rows={1}
      className={cn(
        "flex-1 min-w-0 resize-none bg-transparent text-[15px] text-white/90 outline-none overflow-y-auto [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden",
        isMultiline ? "py-1 leading-relaxed" : "h-11 py-0 leading-[44px]",
        isRecording ? "placeholder:text-white/60" : "placeholder:text-white/30",
      )}
      style={{ maxHeight: "200px", scrollbarWidth: "none" }}
    />
  );
}
