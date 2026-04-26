/**
 * Voice helpers for orryon.
 *
 * Two TTS paths:
 *   textToSpeech()    — xAI `sal`, used for chat assistant replies.
 *   orbTextToSpeech() — ElevenLabs "Erin - Meditation Guide" (gentle female),
 *                       used exclusively for breathing / Reset Anchor cues.
 *                       Falls back to xAI `eve` if no ElevenLabs key is set.
 *
 * Neither key is ever exposed to the browser — both are injected server-side.
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
 * Synthesize orb / breathing cues via ElevenLabs "Erin - Meditation Guide"
 * (gentle, peaceful female voice). Falls back to browser SpeechSynthesis in
 * demo mode. Server falls back to xAI `eve` if no ElevenLabs key is set.
 *
 * Always sends plain text — prosody shaping is handled server-side via
 * ElevenLabs voice_settings (stability, speed) rather than SSML tags.
 */
export async function orbTextToSpeech(text: string): Promise<Blob> {
  if (isDemoMode()) {
    return _browserTTS(text, "anchor");
  }

  const bodyStr = JSON.stringify({ text: text.trim() });
  const sigHeaders = await signRequest("POST", "/api/voice/orb-tts", bodyStr);

  const res = await fetch(`${getApiBase()}/api/voice/orb-tts`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json", ...sigHeaders }),
    body: bodyStr,
    credentials: "same-origin",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Orb voice synthesis failed (${res.status})`);
  }

  return res.blob();
}

/**
 * Browser SpeechSynthesis fallback for demo mode.
 * Picks the softest available female voice.
 */
function _browserTTS(text: string, mode: VoiceMode): Promise<Blob> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve(new Blob([], { type: "audio/mpeg" }));
      return;
    }

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate   = mode === "anchor" ? 0.78 : 0.92;
    utterance.pitch  = mode === "anchor" ? 0.88 : 0.96;
    utterance.volume = mode === "anchor" ? 0.72 : 0.85;

    const assignVoice = () => {
      const voices = synth.getVoices();
      // Prefer soft female voices — Samantha (macOS) is the closest to Erin
      const preferred = [
        ...voices.filter((v) => v.name.toLowerCase().includes("samantha")),
        ...voices.filter((v) => v.name.toLowerCase().includes("karen")),
        ...voices.filter((v) => v.name.toLowerCase().includes("ava")),
        ...voices.filter((v) => v.name.toLowerCase().includes("victoria")),
        ...voices.filter((v) => v.name.toLowerCase().includes("female")),
      ];
      if (preferred.length > 0) utterance.voice = preferred[0];
    };

    if (synth.getVoices().length > 0) {
      assignVoice();
    } else {
      const onChanged = () => {
        synth.removeEventListener("voiceschanged", onChanged);
        assignVoice();
      };
      synth.addEventListener("voiceschanged", onChanged);
      setTimeout(assignVoice, 120);
    }

    utterance.onend = () => resolve(new Blob([], { type: "audio/mpeg" }));
    utterance.onerror = () => resolve(new Blob([], { type: "audio/mpeg" }));
    synth.speak(utterance);
  });
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
