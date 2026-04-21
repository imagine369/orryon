/**
 * Voice helpers for orryon — xAI Speech-to-Text and Text-to-Speech.
 *
 * These call our same-origin `/api/voice/*` proxy, which forwards to
 * https://api.x.ai/v1/stt and https://api.x.ai/v1/tts with the server-side
 * XAI_API_KEY injected. The browser never sees the key.
 *
 * See `backend/routers/voice.py` for the server implementation.
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
 * Synthesize speech. Uses xAI TTS in production, falls back to browser
 * SpeechSynthesis API in demo mode so the Orb voice works immediately.
 */
export async function textToSpeech(
  text: string,
  voiceId: string = ORRYON_VOICE_ID,
  mode: VoiceMode = "chat",
): Promise<Blob> {
  const shaped = shapeForVoice(text, mode);

  // Demo mode: use browser's built-in speech synthesis (no backend needed)
  if (isDemoMode()) {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        reject(new Error("Speech synthesis not available"));
        return;
      }

      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(shaped);

      utterance.rate = mode === "anchor" ? 0.82 : 0.95;   // slower, more deliberate for Orb
      utterance.pitch = mode === "anchor" ? 0.92 : 1.0;   // slightly lower, calmer
      utterance.volume = 0.92;

      // Load voices if not already available (they load asynchronously)
      let voicesLoaded = synth.getVoices().length > 0;
      if (!voicesLoaded) {
        const onVoicesChanged = () => {
          synth.removeEventListener("voiceschanged", onVoicesChanged);
          voicesLoaded = true;
          assignVoice();
        };
        synth.addEventListener("voiceschanged", onVoicesChanged);
        // Some browsers need a small delay before voices are populated
        setTimeout(() => {
          if (!voicesLoaded) assignVoice();
        }, 120);
      } else {
        assignVoice();
      }

      function assignVoice() {
        const voices = synth.getVoices();
        // Prefer calm, warm female voices — ordered by quality for Orb voice
        const preferredVoices = [
          ...voices.filter((v) => v.name.toLowerCase().includes("samantha")),
          ...voices.filter((v) => v.name.toLowerCase().includes("karen")),
          ...voices.filter((v) => v.name.toLowerCase().includes("ava")),
          ...voices.filter((v) => v.name.toLowerCase().includes("female")),
          ...voices.filter((v) => v.name.toLowerCase().includes("victoria")),
        ];

        if (preferredVoices.length > 0) {
          utterance.voice = preferredVoices[0];
        }
      }

      utterance.onend = () => {
        // Return a silent blob so the Audio() element in SessionScreen doesn't break
        resolve(new Blob([], { type: "audio/mpeg" }));
      };

      utterance.onerror = (event) => {
        console.warn("SpeechSynthesis error:", event);
        // Still resolve with silent blob so UI doesn't break
        resolve(new Blob([], { type: "audio/mpeg" }));
      };

      synth.speak(utterance);
    });
  }

  // Production: call backend proxy to xAI TTS
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
