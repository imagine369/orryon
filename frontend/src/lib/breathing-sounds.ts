/**
 * Background soundscapes and haptics for Orryon's Reset Anchors.
 *
 * All sounds are synthesized in real-time using the Web Audio API —
 * zero files, zero network, zero cost, works offline.
 *
 * Soundscape map (research-backed):
 *   pink-noise   — filtered white noise (-3dB/oct): focus, anxiety reduction
 *   brown-noise  — integrated white noise (-6dB/oct): deep focus, calm
 *   gentle-rain  — low-pass filtered noise + subtle amplitude flutter
 *   forest       — layered noise bands + slow ~0.15Hz modulation
 *   ocean        — noise sculpted by a slow 0.1Hz sine LFO (wave rhythm)
 *   silence      — nothing
 */

export type Soundscape =
  | "pink-noise"
  | "gentle-rain"
  | "forest"
  | "ocean"
  | "brown-noise"
  | "silence";

export interface SoundConfig {
  default: Soundscape;
  alternatives?: Soundscape[];
  description: string;
  scientificBasis: string;
}

export const ANCHOR_SOUNDS: Record<string, SoundConfig> = {
  "quick-box-reset": {
    default: "pink-noise",
    alternatives: ["brown-noise", "silence"],
    description: "Pink noise for cognitive clarity",
    scientificBasis: "Pink noise reduces intrusive thoughts and enhances focus (Nature Communications, 2026)",
  },
  "double-inhale": {
    default: "gentle-rain",
    alternatives: ["ocean", "silence"],
    description: "Gentle rain for rapid nervous system reset",
    scientificBasis: "Rain sounds strongly activate parasympathetic response (HRV studies, 2025)",
  },
  "grounding-anchor-3min": {
    default: "forest",
    alternatives: ["gentle-rain", "silence"],
    description: "Forest sounds for sensory grounding",
    scientificBasis: "Nature sounds enhance 5-4-3-2-1 grounding practice (ACT research)",
  },
  "midday-reset-5min": {
    default: "pink-noise",
    alternatives: ["brown-noise", "gentle-rain"],
    description: "Pink noise for mental clarity reset",
    scientificBasis: "Pink noise improves afternoon decision quality (cognitive boundary research)",
  },
  "focus-return-4min": {
    default: "brown-noise",
    alternatives: ["pink-noise", "silence"],
    description: "Brown noise for deep focus",
    scientificBasis: "Low-frequency brown noise enhances sustained attention (2026 attention studies)",
  },
  "evening-release-7min": {
    default: "ocean",
    alternatives: ["gentle-rain", "silence"],
    description: "Ocean waves for parasympathetic activation",
    scientificBasis: "Slow ocean rhythms optimal for evening autonomic down-regulation",
  },
  "sleep-descent": {
    default: "gentle-rain",
    alternatives: ["ocean", "silence"],
    description: "Gentle rain for sleep onset",
    scientificBasis: "Rain is most effective for sleep onset (sleep research, 2026)",
  },
  "do-nothing": {
    default: "silence",
    alternatives: ["pink-noise"],
    description: "Silence for pure awareness",
    scientificBasis: "Minimal auditory input best for open awareness meditation",
  },
};

// ── Web Audio state ───────────────────────────────────────────────────────────

let _ctx: AudioContext | null = null;
let _masterGain: GainNode | null = null;
let _stopFn: (() => void) | null = null;
let _currentSoundscape: Soundscape | null = null;
let _stopTimeoutId: ReturnType<typeof setTimeout> | null = null;
let _generation = 0; // incremented each time we start a new sound; stops are self-invalidating

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    type W = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext || (window as W).webkitAudioContext!;
    _ctx = new AC();
  }
  return _ctx;
}

/** Fill a buffer with white noise samples. */
function whiteNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Looping white-noise source node. */
function noiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = whiteNoiseBuffer(ctx, 4);
  src.loop = true;
  return src;
}

// ── Soundscape synthesizers ───────────────────────────────────────────────────

// All synth functions output at a normalised ~0.25 level into the master gain.
// The master itself is then set to 0.12 so the result is genuinely background-
// level — present but never distracting.

function synthPinkNoise(ctx: AudioContext, gain: GainNode): () => void {
  const src = noiseSource(ctx);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowshelf";
  lp.frequency.value = 1000;
  lp.gain.value = 6;        // was 10 — softer boost

  const hp = ctx.createBiquadFilter();
  hp.type = "highshelf";
  hp.frequency.value = 4000;
  hp.gain.value = -18;      // was -14 — more high-end rolloff

  const lvl = ctx.createGain();
  lvl.gain.value = 0.22;    // normalise output level

  src.connect(lp);
  lp.connect(hp);
  hp.connect(lvl);
  lvl.connect(gain);
  src.start();
  return () => { try { src.stop(); } catch { /* ignore */ } };
}

function synthBrownNoise(ctx: AudioContext, gain: GainNode): () => void {
  const src = noiseSource(ctx);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  lp.Q.value = 0.5;

  const lvl = ctx.createGain();
  lvl.gain.value = 0.28;    // was 3.5× — brought right down

  src.connect(lp);
  lp.connect(lvl);
  lvl.connect(gain);
  src.start();
  return () => { try { src.stop(); } catch { /* ignore */ } };
}

function synthGentleRain(ctx: AudioContext, gain: GainNode): () => void {
  const now = ctx.currentTime;

  const hiss = noiseSource(ctx);
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = "bandpass";
  hissFilter.frequency.value = 2800;
  hissFilter.Q.value = 0.6;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.18;  // was 0.55

  const rumble = noiseSource(ctx);
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = "lowpass";
  rumbleFilter.frequency.value = 320;
  rumbleFilter.Q.value = 0.4;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.12;  // was 0.45

  // Subtle flutter ~0.8Hz
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.8;
  lfo.type = "sine";
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.03;  // was 0.08

  lfo.connect(lfoGain);
  lfoGain.connect(hissGain.gain);

  hiss.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(gain);

  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(gain);

  hiss.start();
  rumble.start();
  lfo.start(now);

  return () => {
    try { hiss.stop(); } catch { /* ignore */ }
    try { rumble.stop(); } catch { /* ignore */ }
    try { lfo.stop(); } catch { /* ignore */ }
  };
}

function synthForest(ctx: AudioContext, gain: GainNode): () => void {
  const now = ctx.currentTime;

  const air = noiseSource(ctx);
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 1800;
  airFilter.Q.value = 0.4;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.18;  // was 0.5

  const rustle = noiseSource(ctx);
  const rustleFilter = ctx.createBiquadFilter();
  rustleFilter.type = "bandpass";
  rustleFilter.frequency.value = 600;
  rustleFilter.Q.value = 0.5;
  const rustleGain = ctx.createGain();
  rustleGain.gain.value = 0.10;  // was 0.35

  // Very slow swell ~0.15Hz
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.15;
  lfo.type = "sine";
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.04;  // was 0.12

  lfo.connect(lfoGain);
  lfoGain.connect(airGain.gain);

  air.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(gain);

  rustle.connect(rustleFilter);
  rustleFilter.connect(rustleGain);
  rustleGain.connect(gain);

  air.start();
  rustle.start();
  lfo.start(now);

  return () => {
    try { air.stop(); } catch { /* ignore */ }
    try { rustle.stop(); } catch { /* ignore */ }
    try { lfo.stop(); } catch { /* ignore */ }
  };
}

function synthOcean(ctx: AudioContext, gain: GainNode): () => void {
  const now = ctx.currentTime;

  const surf = noiseSource(ctx);
  const surfFilter = ctx.createBiquadFilter();
  surfFilter.type = "lowpass";
  surfFilter.frequency.value = 900;  // was 1200 — less harsh
  surfFilter.Q.value = 0.7;
  const surfGain = ctx.createGain();
  surfGain.gain.value = 0.20;  // was 0.7

  // ~0.1Hz wave LFO — one swell every ~10 seconds
  const waveLfo = ctx.createOscillator();
  waveLfo.frequency.value = 0.1;
  waveLfo.type = "sine";
  const waveLfoGain = ctx.createGain();
  waveLfoGain.gain.value = 0.08;  // was 0.3 — gentler swell

  const waveOffset = ctx.createConstantSource();
  waveOffset.offset.value = 0.20;  // keep base level consistent

  waveLfo.connect(waveLfoGain);
  waveLfoGain.connect(surfGain.gain);
  waveOffset.connect(surfGain.gain);

  surf.connect(surfFilter);
  surfFilter.connect(surfGain);
  surfGain.connect(gain);

  surf.start();
  waveLfo.start(now);
  waveOffset.start(now);

  return () => {
    try { surf.stop(); } catch { /* ignore */ }
    try { waveLfo.stop(); } catch { /* ignore */ }
    try { waveOffset.stop(); } catch { /* ignore */ }
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getSoundForAnchor(anchorId: string): SoundConfig {
  return ANCHOR_SOUNDS[anchorId] || ANCHOR_SOUNDS["quick-box-reset"];
}

/**
 * Call this synchronously inside a tap/click handler (a user gesture) before
 * opening the session. Browsers require a gesture to resume an AudioContext —
 * calling resume() inside a useEffect (outside the gesture) silently fails.
 */
export function primeAudioContext(): void {
  if (typeof window === "undefined") return;
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  } catch { /* ignore */ }
}

export function playBackgroundSound(anchorId: string, volume: number = 0.12): void {
  // Cancel any pending deferred stop from a previous fade-out
  stopBackgroundSound();

  if (typeof window === "undefined") return;

  const config = getSoundForAnchor(anchorId);
  if (config.default === "silence") {
    _currentSoundscape = "silence";
    return;
  }

  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const masterGain = ctx.createGain();
    // Fade in over 1.2s — never jarring
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, volume)),
      ctx.currentTime + 1.2,
    );
    masterGain.connect(ctx.destination);
    _masterGain = masterGain;
    _generation++;

    let stopNodes: () => void;
    switch (config.default) {
      case "pink-noise":  stopNodes = synthPinkNoise(ctx, masterGain);  break;
      case "brown-noise": stopNodes = synthBrownNoise(ctx, masterGain); break;
      case "gentle-rain": stopNodes = synthGentleRain(ctx, masterGain); break;
      case "forest":      stopNodes = synthForest(ctx, masterGain);     break;
      case "ocean":       stopNodes = synthOcean(ctx, masterGain);      break;
      default:            stopNodes = synthPinkNoise(ctx, masterGain);
    }

    _stopFn = stopNodes;
    _currentSoundscape = config.default;
  } catch (e) {
    console.warn("Could not start background sound:", e);
  }
}

export function stopBackgroundSound(): void {
  // Cancel any previously scheduled deferred stop so nodes don't stack
  if (_stopTimeoutId !== null) {
    clearTimeout(_stopTimeoutId);
    _stopTimeoutId = null;
  }

  if (_masterGain && _ctx) {
    const gain = _masterGain;
    const stop = _stopFn;
    const gen = _generation;
    const ctx = _ctx;

    // Fade out over ~0.5s, then stop nodes — but only if no new sound has
    // started in the meantime (generation guard prevents stacking)
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    _stopTimeoutId = setTimeout(() => {
      _stopTimeoutId = null;
      if (_generation !== gen) return; // a new sound started — leave it alone
      try { stop?.(); } catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
    }, 600);
  }

  _stopFn = null;
  _masterGain = null;
  _currentSoundscape = null;
}

export function isSoundPlaying(): boolean {
  return _masterGain !== null;
}

// ── Haptics ───────────────────────────────────────────────────────────────────

export function triggerHaptics(pattern: number[] = [100, 50, 100]): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    const safePattern = pattern.every((n) => n > 0) ? pattern : [100, 50, 100];
    navigator.vibrate(safePattern);
  } catch {
    console.debug("Haptics not available");
  }
}

/**
 * Short, phase-specific haptic pulse derived from step text.
 *
 *   inhale  → double soft tap  [60, 40, 60]   — start breathing in
 *   hold    → single firm tap  [90]            — stay
 *   exhale  → long soft pulse  [140]           — let it go
 *   other   → very gentle tap  [40]            — transition cue
 */
export function getHapticPatternForStep(
  _anchorId: string,
  _stepIndex: number,
  stepText: string,
): number[] {
  const lower = stepText.toLowerCase();
  if (/\bin\b|inhale|breathe in/.test(lower))   return [60, 40, 60];
  if (/hold|pause|stay/.test(lower))             return [90];
  if (/out\b|exhale|release|let go/.test(lower)) return [140];
  return [40];
}
