"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { pickRecorderMimeType, speechToText } from "@/lib/voice";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** When true, the mic is wired to xAI STT + TTS round-trip. */
  voiceMode?: boolean;
  /** External status (e.g. "thinking" during AI stream, "speaking" during TTS). */
  externalStatus?: VoiceStatus;
  /** Notifies the parent of recording lifecycle transitions. */
  onVoiceStatusChange?: (status: VoiceStatus) => void;
  /** Surface recording / transcription errors to the parent. */
  onVoiceError?: (message: string) => void;
}

// The input component fills 100% of its parent container.
// All max-width constraints must be applied by the parent (e.g. max-w-3xl mx-auto).
export function ChatInput({
  onSend,
  disabled,
  placeholder = "Ask me anything…",
  voiceMode = false,
  externalStatus = "idle",
  onVoiceStatusChange,
  onVoiceError,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [showVoiceOffHint, setShowVoiceOffHint] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Status actually displayed = external (thinking/speaking) overrides local (listening/transcribing).
  const effectiveStatus: VoiceStatus =
    externalStatus !== "idle" ? externalStatus : voiceStatus;

  const isRecording = voiceStatus === "listening";
  const isBusy =
    effectiveStatus === "listening" ||
    effectiveStatus === "transcribing" ||
    effectiveStatus === "thinking" ||
    effectiveStatus === "speaking";

  const updateStatus = (next: VoiceStatus) => {
    setVoiceStatus(next);
    onVoiceStatusChange?.(next);
  };

  // Auto-resize textarea to fit content, up to max-height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Clean up the MediaStream on unmount so the browser mic indicator goes away.
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
    };
  }, []);

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

  // ── Voice-mode recording lifecycle ────────────────────────────────────────
  //
  // Tap mic → getUserMedia → MediaRecorder → Blob → xAI STT → onSend(text).

  const stopMicTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onVoiceError?.("Microphone access is not available in this browser.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onVoiceError?.("Microphone permission denied.");
      return;
    }

    const mimeType = pickRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    audioChunksRef.current = [];
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stopMicTracks();
      const chunks = audioChunksRef.current;
      audioChunksRef.current = [];
      const type = mimeType || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type });

      if (blob.size < 400) {
        updateStatus("idle");
        onVoiceError?.("Didn't catch that — try again.");
        return;
      }

      updateStatus("transcribing");
      try {
        const text = await speechToText(blob);
        if (!text) {
          updateStatus("idle");
          onVoiceError?.("Didn't catch that — try again.");
          return;
        }
        // Handoff to the Grok chat flow. Parent will flip externalStatus
        // to "thinking" / "speaking" as the response + TTS play out.
        updateStatus("idle");
        onSend(text);
      } catch (err) {
        updateStatus("idle");
        onVoiceError?.(err instanceof Error ? err.message : "Transcription failed.");
      }
    };

    recorder.onerror = () => {
      stopMicTracks();
      updateStatus("idle");
      onVoiceError?.("Recording failed. Please try again.");
    };

    recorder.start();
    updateStatus("listening");
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopMicTracks();
      updateStatus("idle");
    }
  };

  const handleMicClick = () => {
    if (disabled) return;

    if (!voiceMode) {
      // Mic stays visible but inert with a brief "Voice Mode off" hint.
      setShowVoiceOffHint(true);
      window.setTimeout(() => setShowVoiceOffHint(false), 1600);
      return;
    }

    // If AI is currently thinking/speaking, ignore taps — parent owns that state.
    if (externalStatus === "thinking" || externalStatus === "speaking") return;

    if (voiceStatus === "listening") {
      stopRecording();
      return;
    }
    if (voiceStatus === "transcribing") return;
    void startRecording();
  };

  const micTooltip = !voiceMode
    ? "Voice Mode off"
    : effectiveStatus === "listening"
      ? "Tap to stop"
      : effectiveStatus === "transcribing"
        ? "Transcribing…"
        : effectiveStatus === "thinking"
          ? "Thinking…"
          : effectiveStatus === "speaking"
            ? "Speaking…"
            : "Tap to talk";

  const isMultiline = value.includes("\n") || value.length > 80;

  // The outline animates the same way on both Web-Speech "listening" (legacy) and
  // xAI "listening" (new). Visuals are intentionally identical.
  const glow = isRecording;

  return (
    <div
      className={cn(
        "flex w-full items-end gap-2 border bg-[#141414] px-4 py-2.5 transition-colors duration-150",
        isMultiline ? "rounded-2xl" : "rounded-full",
        glow
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
            ? "Listening…"
            : effectiveStatus === "transcribing"
              ? "Transcribing…"
              : effectiveStatus === "thinking"
                ? "Thinking…"
                : effectiveStatus === "speaking"
                  ? "Speaking…"
                  : showVoiceOffHint
                    ? "Voice Mode is off — enable it to talk"
                    : placeholder
        }
        disabled={disabled}
        rows={1}
        className={cn(
          "flex-1 min-w-0 resize-none bg-transparent text-[15px] text-white/90 outline-none py-1 leading-relaxed overflow-y-auto [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden",
          glow ? "placeholder:text-white/60" : "placeholder:text-white/30"
        )}
        style={{ maxHeight: "200px", scrollbarWidth: "none" }}
      />

      {/* Mic button — preserves EXACT visual design. Behavior depends on voiceMode. */}
      <button
        onClick={handleMicClick}
        disabled={disabled}
        aria-label={micTooltip}
        title={micTooltip}
        className={cn(
          "relative shrink-0 flex items-center justify-center rounded-full w-10 h-10 transition-all duration-200",
          isRecording
            ? "bg-white text-black scale-110"
            : effectiveStatus === "transcribing" || effectiveStatus === "thinking"
              ? "text-white/70"
              : effectiveStatus === "speaking"
                ? "text-white/80"
                : voiceMode
                  ? "text-white/55 hover:text-white/85"
                  : "text-white/35 hover:text-white/65",
          disabled && "pointer-events-none opacity-25"
        )}
      >
        {/* Pulsing rings when listening */}
        {isRecording && (
          <>
            <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" />
            <span className="absolute inset-[-6px] rounded-full border border-white/20 animate-[ping_1.4s_ease-out_0.3s_infinite]" />
          </>
        )}

        {/* Subtle ring while transcribing / thinking / speaking */}
        {!isRecording && isBusy && (
          <span
            className={cn(
              "absolute inset-[-2px] rounded-full border",
              effectiveStatus === "speaking"
                ? "border-white/25 animate-[ping_1.8s_ease-out_infinite]"
                : "border-white/15 animate-pulse"
            )}
          />
        )}

        {isRecording ? (
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

      {/* Send button — unchanged */}
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
