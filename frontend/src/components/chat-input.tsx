"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, Mic } from "lucide-react";
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
        className={cn(
          "flex-1 min-w-0 resize-none bg-transparent text-[15px] text-white/90 outline-none py-1 leading-relaxed overflow-y-auto [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden",
          listening ? "placeholder:text-white/60" : "placeholder:text-white/30"
        )}
        style={{ maxHeight: "200px", scrollbarWidth: "none" }}
      />

      {/* Mic button */}
      {speechSupported && (
        <button
          onClick={toggleListening}
          disabled={disabled}
          aria-label={listening ? "Stop listening" : "Start voice input"}
          className={cn(
            "relative shrink-0 flex items-center justify-center rounded-full w-10 h-10 transition-all duration-200",
            listening
              ? "bg-white text-black scale-110"
              : "text-white/35 hover:text-white/65",
            disabled && "pointer-events-none opacity-25"
          )}
        >
          {/* Pulsing rings when listening */}
          {listening && (
            <>
              <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" />
              <span className="absolute inset-[-6px] rounded-full border border-white/20 animate-[ping_1.4s_ease-out_0.3s_infinite]" />
            </>
          )}

          {listening ? (
            /* Animated soundwave bars */
            <span className="relative flex items-end gap-[3px] h-5">
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

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className={cn(
          "shrink-0 flex items-center justify-center rounded-full w-10 h-10 transition-all duration-150",
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
