"use client";

import { useState, useRef, useEffect } from "react";
import { pickRecorderMimeType, speechToText, VoiceLimitError } from "@/lib/voice";
import {
  type VoiceStatus,
  type MessageSource,
  SILENCE_RMS_THRESHOLD,
  SILENCE_HANG_MS,
  NO_SPEECH_TIMEOUT_MS,
  MAX_RECORDING_MS,
  stickyDeniedHelpText,
} from "@/lib/chat-input-helpers";

interface UseVoiceRecordingOptions {
  disabled?: boolean;
  externalStatus?: VoiceStatus;
  onSend: (message: string, source?: MessageSource) => void;
  onVoiceStatusChange?: (status: VoiceStatus) => void;
  onVoiceError?: (errorOrMessage: string | Error) => void;
  onVoiceUserGesture?: () => void;
}

export function useVoiceRecording({
  disabled,
  externalStatus = "idle",
  onSend,
  onVoiceStatusChange,
  onVoiceError,
  onVoiceUserGesture,
}: UseVoiceRecordingOptions) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopReasonRef = useRef<"user" | "silence" | "no-speech" | "max" | "error" | null>(null);

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
    if (typeof window !== "undefined" && !window.isSecureContext) {
      onVoiceError?.(
        "Voice only works over HTTPS. Open the site at its https:// URL and try again.",
      );
      return;
    }

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
      // Permissions API unavailable — fall through to getUserMedia.
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
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

    try {
      type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
      const AC =
        typeof window !== "undefined"
          ? window.AudioContext || (window as WebkitWindow).webkitAudioContext
          : undefined;
      if (AC) {
        const ctx = new AC();
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
        let lastLoudAt: number | null = null;
        let speechDetected = false;

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const now = performance.now();

          if (rms > SILENCE_RMS_THRESHOLD) {
            lastLoudAt = now;
            if (!speechDetected) speechDetected = true;
          }

          if (speechDetected) {
            if (lastLoudAt && now - lastLoudAt > SILENCE_HANG_MS) {
              finishRecording("silence");
              return;
            }
          } else if (now - startedAt > NO_SPEECH_TIMEOUT_MS) {
            finishRecording("no-speech");
            return;
          }

          vadRafRef.current = requestAnimationFrame(tick);
        };
        vadRafRef.current = requestAnimationFrame(tick);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[voice] VAD setup failed, falling back to manual stop:", err);
    }

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
        updateStatus("idle");
        onSend(text, "voice");
      } catch (err) {
        updateStatus("idle");
        if (err instanceof VoiceLimitError) {
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
    if (externalStatus === "thinking" || externalStatus === "speaking") return;

    if (voiceStatus === "listening") {
      stopRecording();
      return;
    }
    if (voiceStatus === "transcribing") return;
    onVoiceUserGesture?.();
    void startRecording();
  };

  useEffect(() => {
    if (externalStatus === "listening" && voiceStatus !== "listening" && !disabled) {
      void startRecording();
    }
    if (externalStatus === "idle" && voiceStatus === "listening") {
      stopRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalStatus, disabled]);

  const micTooltip =
    effectiveStatus === "listening"
      ? "Tap to stop"
      : effectiveStatus === "transcribing"
        ? "Transcribing…"
        : effectiveStatus === "thinking"
          ? "Thinking…"
          : "Tap to talk";

  return {
    voiceStatus,
    effectiveStatus,
    isRecording,
    isBusy,
    handleMicClick,
    micTooltip,
  };
}
