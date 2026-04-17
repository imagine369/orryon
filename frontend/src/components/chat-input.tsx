"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// The input component fills 100% of its parent container.
// All max-width constraints must be applied by the parent (e.g. max-w-3xl mx-auto).
export function ChatInput({
  onSend,
  disabled,
  placeholder = "Ask me anything…",
}: ChatInputProps) {
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

  // Auto-resize textarea to fit content, up to max-height
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleSend = () => {
    const msg = value.trim();
    if (!msg || disabled) return;
    onSend(msg);
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
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const isMultiline = value.includes("\n") || value.length > 80;

  return (
    <div
      className={cn(
        "flex w-full items-end gap-2 border bg-[#141414] px-4 py-2.5 transition-colors duration-150",
        isMultiline ? "rounded-2xl" : "rounded-full",
        listening
          ? "border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          : "border-white/[0.09] hover:border-white/[0.14] focus-within:border-white/[0.18]"
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
        className="flex-1 min-w-0 resize-none bg-transparent text-[15px] text-white/90 placeholder:text-white/30 outline-none py-1 leading-relaxed overflow-y-auto"
        style={{ maxHeight: "200px" }}
      />

      {/* Mic button */}
      {speechSupported && (
        <button
          onClick={toggleListening}
          disabled={disabled}
          aria-label={listening ? "Stop listening" : "Start voice input"}
          className={cn(
            "shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all duration-150",
            listening
              ? "bg-white text-black"
              : "text-white/35 hover:text-white/65",
            disabled && "pointer-events-none opacity-25"
          )}
        >
          {listening ? (
            <Square className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" />
          ) : (
            <Mic className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      )}

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className={cn(
          "shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all duration-150",
          value.trim()
            ? "bg-white text-black hover:bg-white/90 active:scale-95"
            : "bg-white/[0.08] text-white/25 cursor-not-allowed"
        )}
      >
        <ArrowUp className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
