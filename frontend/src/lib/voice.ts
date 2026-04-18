/**
 * Voice helpers for orryon — xAI Speech-to-Text and Text-to-Speech.
 *
 * These call our same-origin `/api/voice/*` proxy, which forwards to
 * https://api.x.ai/v1/stt and https://api.x.ai/v1/tts with the server-side
 * XAI_API_KEY injected. The browser never sees the key.
 *
 * See `backend/routers/voice.py` for the server implementation.
 */

import { getApiBase } from "@/lib/api";
import {
  ORRYON_VOICE_ID,
  shapeForVoice,
  type VoiceMode,
} from "@/lib/voice-config";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("orryon_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

  const res = await fetch(`${getApiBase()}/api/voice/stt`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Transcription failed (${res.status})`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}

/**
 * POST text to xAI TTS and return the synthesized MP3 as a Blob.
 *
 * Defaults to the Orryon voice (`sal`, per `docs/voice-direction.md`). The
 * `mode` argument controls prosody shaping: `"chat"` ships text as-is, while
 * `"breathing"` wraps the utterance in speech tags so guided breath counts
 * land at a real breath's pace.
 */
export async function textToSpeech(
  text: string,
  voiceId: string = ORRYON_VOICE_ID,
  mode: VoiceMode = "chat",
): Promise<Blob> {
  const shaped = shapeForVoice(text, mode);

  const res = await fetch(`${getApiBase()}/api/voice/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ text: shaped, voice: voiceId }),
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
