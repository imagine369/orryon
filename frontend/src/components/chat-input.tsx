"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  variant?: "center" | "bottom";
}

export function ChatInput({ onSend, disabled, placeholder = "Ask me anything…", variant = "bottom" }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setSpeechSupported(
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

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

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join("");
      setValue(transcript);
    };

    recognition.onend = () => {
      setListening(false);
      inputRef.current?.focus();
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-full border bg-[#1c1c1e] px-4 py-2 transition-colors duration-200",
        listening ? "border-white/30" : "border-white/10",
        variant === "bottom" && "mx-auto max-w-xl",
        variant === "center" && "mx-auto max-w-lg",
      )}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={listening ? "Listening…" : placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 min-w-0 resize-none bg-transparent text-white text-[15px] placeholder:text-white/35 outline-none py-1.5 max-h-32"
      />

      {/* Mic button — Grok-style: left of send, no background at rest */}
      {speechSupported && (
        <button
          onClick={toggleListening}
          disabled={disabled}
          aria-label={listening ? "Stop listening" : "Start voice input"}
          className={cn(
            "shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all duration-200",
            listening
              ? "bg-white text-black scale-100"
              : "text-white/40 hover:text-white/70 scale-95 hover:scale-100",
            disabled && "opacity-30 cursor-not-allowed",
          )}
        >
          {listening
            ? <Square className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" />
            : <Mic className="h-4 w-4" strokeWidth={1.5} />
          }
        </button>
      )}

      {/* Send button */}
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
