"use client";

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatVoiceButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isRecording: boolean;
  isBusy: boolean;
  micTooltip: string;
}

export function ChatVoiceButton({
  onClick,
  disabled,
  isRecording,
  isBusy,
  micTooltip,
}: ChatVoiceButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={micTooltip}
      title={micTooltip}
      className={cn(
        "relative shrink-0 flex items-center justify-center rounded-full w-11 h-11 transition-all duration-200",
        isRecording
          ? "bg-white text-black scale-110"
          : isBusy
            ? "text-white/70"
            : "text-white/35 hover:text-white/65",
        disabled && "pointer-events-none opacity-25",
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
  );
}
