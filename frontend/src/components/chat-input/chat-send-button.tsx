"use client";

import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatSendButtonProps {
  onClick: () => void;
  disabled?: boolean;
  canSend: boolean;
}

export function ChatSendButton({ onClick, disabled, canSend }: ChatSendButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || !canSend}
      aria-label="Send message"
      className={cn(
        "shrink-0 flex items-center justify-center rounded-full w-11 h-11 transition-all duration-150",
        canSend
          ? "bg-white text-black hover:bg-white/90 active:scale-95"
          : "bg-white/[0.08] text-white/25 cursor-not-allowed",
      )}
    >
      <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} />
    </button>
  );
}
