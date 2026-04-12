"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  variant?: "center" | "bottom";
}

export function ChatInput({ onSend, disabled, placeholder = "Ask me anything…", variant = "bottom" }: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const msg = value.trim();
    if (!msg || disabled) return;
    onSend(msg);
    setValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-full border border-white/10 bg-[#1c1c1e] px-4 py-2",
        variant === "bottom" && "mx-auto max-w-xl",
        variant === "center" && "mx-auto max-w-lg",
      )}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-white text-[15px] placeholder:text-white/35 outline-none py-1.5 max-h-32"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className={cn(
          "shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all",
          value.trim()
            ? "bg-white text-black hover:bg-gray-200 scale-100"
            : "bg-white/20 text-white/40 scale-95",
        )}
      >
        <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
