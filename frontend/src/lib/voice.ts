/**
 * Voice helpers for orryon — xAI Speech-to-Text and Text-to-Speech.
 *
 * Orryon speaks with the eve voice for Pro, Premium, and Premium Plus (minute caps per plan).
 * Breathing / Reset Anchor sessions use synthesized soundscapes (Web Audio API) with no TTS.
 *
 * Keys are never exposed to the browser — injected server-side.
 * See `backend/routers/voice.py`.
 */

/** Thrown when the user has exhausted their monthly voice-minute cap. */
export class VoiceLimitError extends Error {
  readonly minutesUsed: number;
  readonly limitMinutes: number;

  constructor(minutesUsed: number, limitMinutes: number) {
    super("voice_limit_reached");
    this.name = "VoiceLimitError";
    this.minutesUsed = minutesUsed;
    this.limitMinutes = limitMinutes;
  }
}

import { clientHeaders, getApiBase, getCsrfToken } from "@/lib/api";
import { signRequest } from "@/lib/signing";

function legacyBearer(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("orryon_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const csrf = getCsrfToken();
  return {
    ...clientHeaders(),
    ...legacyBearer(),
    ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    ...extra,
  };
}

/**
 * POST a recorded audio clip to xAI STT and return the transcribed text.
 *
 * Accepts any Blob MediaRecorder produces (webm/opus, mp4/aac, wav, …).
 */
export async function speechToText(audioBlob: File | Blob): Promise<string> {
  const form = new FormData();
  const filename =
    audioBlob instanceof File
      ? audioBlob.name
      : `recording.${(audioBlob.type.split("/")[1] || "webm").split(";")[0]}`;
  form.append("file", audioBlob, filename);

  // Multipart bodies are signed with an empty payload (see backend/signing.py);
  // the HMAC still binds method + path + timestamp + nonce.
  const sigHeaders = await signRequest("POST", "/api/voice/stt", null);
  const res = await fetch(`${getApiBase()}/api/voice/stt`, {
    method: "POST",
    headers: authHeaders(sigHeaders),
    body: form,
    credentials: "same-origin",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    // Structured 402 from voice-minute cap enforcement
    if (
      res.status === 402 &&
      typeof detail === "object" &&
      detail?.code === "voice_limit_reached"
    ) {
      throw new VoiceLimitError(detail.minutes_used ?? 0, detail.limit_minutes ?? 0);
    }
    throw new Error(
      typeof detail === "string" ? detail : `Transcription failed (${res.status})`
    );
  }

  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}


/**
 * POST text to the xAI TTS endpoint and play the returned audio.
 * Silently ignores errors so voice overlay is never a blocking concern.
 */
export async function textToSpeech(text: string): Promise<void> {
  try {
    const bodyStr = JSON.stringify({ text });
    const sigHeaders = await signRequest("POST", "/api/voice/tts", bodyStr);
    const res = await fetch(`${getApiBase()}/api/voice/tts`, {
      method: "POST",
      headers: authHeaders({ ...sigHeaders, "Content-Type": "application/json" }),
      body: bodyStr,
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    // Non-fatal — voice overlay never blocks the UI
  }
}

/**
 * Pick the best MediaRecorder MIME type supported by the current browser.
 * Safari prefers mp4/aac, Chrome/Firefox prefer webm/opus.
 */
export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}
