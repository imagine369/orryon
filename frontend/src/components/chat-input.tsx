"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { pickRecorderMimeType, speechToText, VoiceLimitError } from "@/lib/voice";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

export type MessageSource = "text" | "voice";

interface ChatInputProps {
  onSend: (message: string, source?: MessageSource) => void;
  disabled?: boolean;
  /** Mic / STT — Premium Plus chat bar only (Premium uses Live Orryon). */
  enableMic?: boolean;
  placeholder?: string;
  /**
   * External status bubble (e.g. "thinking" while Grok streams,
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

// Silence / VAD tuning. Values picked to feel like Siri / ChatGPT voice:
// - ~1.4s of quiet after the user has spoken triggers auto-stop.
// - 8s without ever hearing speech cancels the turn with an error.
// - 30s hard cap so nothing can hold the mic open forever.
const SILENCE_RMS_THRESHOLD = 0.012; // 0..1, tuned against typical room noise
const SILENCE_HANG_MS = 1400;
const NO_SPEECH_TIMEOUT_MS = 8000;
const MAX_RECORDING_MS = 30_000;

/**
 * Returns a browser-specific, actionable hint for recovering from a
 * "sticky denied" mic permission. The OS-level toggle and the browser's
 * global mic toggle don't fix this — only the per-site permission does —
 * so generic "allow mic access" advice actively misleads users.
 */
function stickyDeniedHelpText(): string {
  if (typeof navigator === "undefined") {
    return "Microphone permission is blocked for this site.";
  }
  const ua = navigator.userAgent.toLowerCase();
  // Order matters: Brave/Edge/Opera UAs all contain "chrome" too.
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isBrave = "brave" in (navigator as unknown as Record<string, unknown>);
  const isFirefox = ua.includes("firefox");
  const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium");
  const isChrome = ua.includes("chrome") || ua.includes("chromium");

  if (isIOS) {
    return "Mic is blocked for this site in iOS. Tap the AA / \u2026 menu in the address bar → Website Settings → Microphone → Allow, then reload.";
  }
  if (isBrave) {
    return "Mic is blocked for this site in Brave. Tap the padlock in the URL bar → Site settings → change Microphone from Block to Allow, then reload.";
  }
  if (isFirefox) {
    return "Mic is blocked for this site in Firefox. Tap the padlock in the URL bar → Connection Secure → More information → Permissions → uncheck 'Use Default' next to Microphone and set it to Allow, then reload.";
  }
  if (isSafari) {
    return "Mic is blocked for this site in Safari. Safari \u2192 Settings \u2192 Websites \u2192 Microphone \u2192 set this site to Allow, then reload.";
  }
  if (isChrome) {
    return "Mic is blocked for this site in Chrome. Tap the padlock in the URL bar → Site settings → change Microphone from Block to Allow, then reload.";
  }
  return "Mic is blocked for this site. Open your browser's site/permissions settings for this URL and set Microphone to Allow, then reload.";
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
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // Voice-activity detection so the recorder auto-stops after a short silence
  // once the user has clearly started and then stopped speaking. Without this
  // the recorder sits open forever waiting for a second tap.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reason a stop was initiated, so onstop knows whether to treat as abort.
  const stopReasonRef = useRef<"user" | "silence" | "no-speech" | "max" | "error" | null>(null);

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
      if (vadRafRef.current !== null) cancelAnimationFrame(vadRafRef.current);
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      analyserRef.current = null;
      audioCtxRef.current = null;
    };
  }, []);

  // Live Orryon / external voice trigger bridge
  // When the parent (e.g. floating Live Orryon buddy) sets externalStatus="listening",
  // automatically start the microphone. When it goes back to "idle", stop recording.
  useEffect(() => {
    if (externalStatus === "listening" && voiceStatus !== "listening" && !disabled) {
      void startRecording();
    }
    if (externalStatus === "idle" && voiceStatus === "listening") {
      stopRecording();
    }
  }, [externalStatus, disabled]);

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

  // ── Voice recording lifecycle ─────────────────────────────────────────────
  //
  // Tap mic → getUserMedia → MediaRecorder → Blob → xAI STT → onSend(text, "voice").

  const stopMicTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  };

  const teardownVAD = () => {
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    analyserRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    ctx?.close().catch(() => {});
  };

  /**
   * Stop the current recording for a given reason. The reason is stashed
   * so `recorder.onstop` can decide whether to transcribe or abort.
   */
  const finishRecording = (reason: "user" | "silence" | "no-speech" | "max" | "error") => {
    stopReasonRef.current = reason;
    teardownVAD();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopMicTracks();
      updateStatus("idle");
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onVoiceError?.("Microphone access is not available in this browser.");
      return;
    }
    // Browsers require a secure origin for getUserMedia — localhost is OK
    // but plain http:// isn't. Catch this up front so the error points at
    // the real problem rather than "permission denied".
    if (typeof window !== "undefined" && !window.isSecureContext) {
      onVoiceError?.(
        "Voice only works over HTTPS. Open the site at its https:// URL and try again.",
      );
      return;
    }

    // Pre-flight: if the browser already has a sticky "denied" decision for
    // this site, getUserMedia will reject *without ever prompting* and the
    // user has no way to recover from OS / global browser settings — the
    // per-site permission has to be flipped manually. Detect that here and
    // surface a concrete, browser-specific instruction.
    try {
      const perms = (navigator as Navigator & {
        permissions?: { query?: (d: PermissionDescriptor) => Promise<PermissionStatus> };
      }).permissions;
      const status = await perms?.query?.({ name: "microphone" as PermissionName });
      if (status?.state === "denied") {
        onVoiceError?.(stickyDeniedHelpText());
        return;
      }
    } catch {
      // Permissions API is not supported everywhere (older Safari). Fall
      // through to getUserMedia — it'll throw NotAllowedError below and
      // we'll handle it the same way.
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Surface the actual browser error so users (and logs) can tell
      // the difference between "denied", "no mic plugged in", "mic busy",
      // and "blocked by extension / privacy shield".
      const e = err as DOMException | Error;
      const name = (e as DOMException)?.name || "";
      // eslint-disable-next-line no-console
      console.error("[voice] getUserMedia failed:", name, e);
      const msg =
        name === "NotAllowedError" || name === "SecurityError"
          ? stickyDeniedHelpText()
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone was detected on this device."
            : name === "NotReadableError" || name === "TrackStartError"
              ? "Your microphone is in use by another app. Close it (Zoom, Discord, etc.) and try again."
              : name === "AbortError"
                ? "Recording was interrupted. Please try again."
                : `Couldn't access the microphone (${name || "unknown error"}).`;
      onVoiceError?.(msg);
      return;
    }

    const mimeType = pickRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    audioChunksRef.current = [];
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;
    stopReasonRef.current = null;

    // ── Voice Activity Detection ────────────────────────────────────────────
    // Attach an AnalyserNode to the live mic stream so we can watch the
    // audio energy in real time and auto-stop when the user goes quiet.
    // Without this, users tap once and then wait forever, not realizing
    // they'd need to tap again to submit.
    try {
      type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const AC =
        typeof window !== "undefined"
          ? window.AudioContext || (window as WebkitWindow).webkitAudioContext
          : undefined;
      if (AC) {
        const ctx = new AC();
        // Safari can create an AudioContext in "suspended" state — resume
        // inside this (still-live) user gesture chain.
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;

        const buf = new Float32Array(analyser.fftSize);
        const startedAt = performance.now();
        let lastLoudAt: number | null = null; // timestamp of last above-threshold sample
        let speechDetected = false;

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getFloatTimeDomainData(buf);
          // Compute RMS energy of the current frame (0..~1).
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const now = performance.now();

          if (rms > SILENCE_RMS_THRESHOLD) {
            lastLoudAt = now;
            if (!speechDetected) speechDetected = true;
          }

          if (speechDetected) {
            // Once we've heard the user, hanging silence auto-submits.
            if (lastLoudAt && now - lastLoudAt > SILENCE_HANG_MS) {
              finishRecording("silence");
              return;
            }
          } else if (now - startedAt > NO_SPEECH_TIMEOUT_MS) {
            // User tapped mic but never said anything — abort cleanly.
            finishRecording("no-speech");
            return;
          }

          vadRafRef.current = requestAnimationFrame(tick);
        };
        vadRafRef.current = requestAnimationFrame(tick);
      }
    } catch (err) {
      // VAD is a best-effort enhancement. If AudioContext fails for any
      // reason (rare Safari edge cases, locked-down WebViews), we still
      // fall back to the manual "tap again to stop" behavior.
      // eslint-disable-next-line no-console
      console.warn("[voice] VAD setup failed, falling back to manual stop:", err);
    }

    // Hard safety cap — no single utterance should hold the mic >30s.
    maxDurationTimerRef.current = setTimeout(() => {
      finishRecording("max");
    }, MAX_RECORDING_MS);

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const reason = stopReasonRef.current;
      stopReasonRef.current = null;
      teardownVAD();
      stopMicTracks();

      const chunks = audioChunksRef.current;
      audioChunksRef.current = [];

      // If the VAD fired "no-speech", don't even try to transcribe silence.
      if (reason === "no-speech") {
        updateStatus("idle");
        onVoiceError?.("I didn't hear anything — try again.");
        return;
      }

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
        // Handoff to the Grok chat flow; parent will flip externalStatus
        // to "thinking" / "speaking" as the response + TTS play out.
        updateStatus("idle");
        onSend(text, "voice");
      } catch (err) {
        updateStatus("idle");
        if (err instanceof VoiceLimitError) {
          // Pass the typed error object so the parent can show the limit modal.
          onVoiceError?.(err);
        } else {
          onVoiceError?.(err instanceof Error ? err.message : "Transcription failed.");
        }
      }
    };

    recorder.onerror = () => {
      stopReasonRef.current = "error";
      teardownVAD();
      stopMicTracks();
      updateStatus("idle");
      onVoiceError?.("Recording failed. Please try again.");
    };

    recorder.start();
    updateStatus("listening");
  };

  const stopRecording = () => {
    finishRecording("user");
  };

  const handleMicClick = () => {
    if (disabled) return;
    // If AI is currently thinking/speaking, ignore taps — parent owns that state.
    if (externalStatus === "thinking" || externalStatus === "speaking") return;

    if (voiceStatus === "listening") {
      stopRecording();
      return;
    }
    if (voiceStatus === "transcribing") return;
    // Fire the parent's unlock hook *synchronously* inside the tap. iOS
    // Safari will only allow later audio.play() if the element has been
    // interacted with during a user gesture — this has to happen before
    // the `await navigator.mediaDevices.getUserMedia(...)` microtask hop.
    onVoiceUserGesture?.();
    void startRecording();
  };

  const micTooltip =
    effectiveStatus === "listening"
      ? "Tap to stop"
      : effectiveStatus === "transcribing"
        ? "Transcribing…"
        : effectiveStatus === "thinking"
          ? "Thinking…"
          : "Tap to talk";

  const isMultiline = value.includes("\n") || value.length > 80;

  return (
    <div
      className={cn(
        "flex w-full items-end gap-2 border bg-[#141414] px-4 py-2.5 transition-colors duration-150",
        isMultiline ? "rounded-2xl" : "rounded-full",
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
          "flex-1 min-w-0 resize-none bg-transparent text-[15px] text-white/90 outline-none py-1 leading-relaxed overflow-y-auto [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden",
          isRecording ? "placeholder:text-white/60" : "placeholder:text-white/30"
        )}
        style={{ maxHeight: "200px", scrollbarWidth: "none" }}
      />

      {/* Mic — Premium Plus chat only; Premium uses Live Orryon speak-in */}
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
