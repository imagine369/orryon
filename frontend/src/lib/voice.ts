/**
 * Voice helpers for orryon — xAI Speech-to-Text and Text-to-Speech.
 *
 * Used only for the chat assistant (sal voice). Breathing / Reset Anchor
 * sessions use synthesized soundscapes (Web Audio API) with no TTS.
 *
 * Keys are never exposed to the browser — injected server-side.
 * See `backend/routers/voice.py`.
 */

import { clientHeaders, getApiBase, getCsrfToken, isDemoMode } from "@/lib/api";
import { signRequest } from "@/lib/signing";
import {
  ORRYON_VOICE_ID,
  shapeForVoice,
  type VoiceMode,
} from "@/lib/voice-config";

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
    throw new Error(body.detail || `Transcription failed (${res.status})`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}

/**
 * Synthesize chat assistant speech via xAI TTS (`sal` voice).
 * Falls back to browser SpeechSynthesis in demo mode.
 */
export async function textToSpeech(
  text: string,
  voiceId: string = ORRYON_VOICE_ID,
  mode: VoiceMode = "chat",
): Promise<Blob> {
  const shaped = shapeForVoice(text, mode);

  if (isDemoMode()) {
    return _browserTTS(shaped, mode);
  }

  const bodyStr = JSON.stringify({ text: shaped, voice: voiceId });
  const sigHeaders = await signRequest("POST", "/api/voice/tts", bodyStr);

  const res = await fetch(`${getApiBase()}/api/voice/tts`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json", ...sigHeaders }),
    body: bodyStr,
    credentials: "same-origin",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Voice synthesis failed (${res.status})`);
  }

  return res.blob();
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
