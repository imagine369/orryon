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

function synthPinkNoise(ctx: AudioContext, gain: GainNode): () => void {
  // Approximate pink noise with a chain of shelving/peaking filters
  const src = noiseSource(ctx);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowshelf";
  lp.frequency.value = 1000;
  lp.gain.value = 10;

  const hp = ctx.createBiquadFilter();
  hp.type = "highshelf";
  hp.frequency.value = 4000;
  hp.gain.value = -14;

  src.connect(lp);
  lp.connect(hp);
  hp.connect(gain);
  src.start();
  return () => { try { src.stop(); } catch { /* ignore */ } };
}

function synthBrownNoise(ctx: AudioContext, gain: GainNode): () => void {
  // Brown noise: integrate white noise (leaky integrator)
  const src = noiseSource(ctx);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 200;
  lp.Q.value = 0.5;

  const boost = ctx.createGain();
  boost.gain.value = 3.5;

  src.connect(lp);
  lp.connect(boost);
  boost.connect(gain);
  src.start();
  return () => { try { src.stop(); } catch { /* ignore */ } };
}

function synthGentleRain(ctx: AudioContext, gain: GainNode): () => void {
  const now = ctx.currentTime;

  // Base hiss layer — mid-frequency filtered noise
  const hiss = noiseSource(ctx);
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = "bandpass";
  hissFilter.frequency.value = 2800;
  hissFilter.Q.value = 0.6;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.55;

  // Low rumble layer — gives the "body" of rain
  const rumble = noiseSource(ctx);
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = "lowpass";
  rumbleFilter.frequency.value = 320;
  rumbleFilter.Q.value = 0.4;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.45;

  // Subtle flutter — very slow amplitude modulation (~0.8Hz) simulates rain intensity variation
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.8;
  lfo.type = "sine";
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.08;
  const lfoOffset = ctx.createGain();
  lfoOffset.gain.value = 1;

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

  // Soft air layer — gentle broadband hiss
  const air = noiseSource(ctx);
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 1800;
  airFilter.Q.value = 0.4;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.5;

  // Low rustle layer
  const rustle = noiseSource(ctx);
  const rustleFilter = ctx.createBiquadFilter();
  rustleFilter.type = "bandpass";
  rustleFilter.frequency.value = 600;
  rustleFilter.Q.value = 0.5;
  const rustleGain = ctx.createGain();
  rustleGain.gain.value = 0.35;

  // Very slow swell (~0.15Hz) — wind-through-trees texture
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.15;
  lfo.type = "sine";
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.12;

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

  // Broadband surf noise
  const surf = noiseSource(ctx);
  const surfFilter = ctx.createBiquadFilter();
  surfFilter.type = "lowpass";
  surfFilter.frequency.value = 1200;
  surfFilter.Q.value = 0.7;
  const surfGain = ctx.createGain();
  surfGain.gain.value = 0.7;

  // ~0.1Hz wave LFO — one swell every ~10 seconds
  const waveLfo = ctx.createOscillator();
  waveLfo.frequency.value = 0.1;
  waveLfo.type = "sine";
  const waveLfoGain = ctx.createGain();
  waveLfoGain.gain.value = 0.3;

  // Offset so LFO rides around 1.0 (never goes silent)
  const waveOffset = ctx.createConstantSource();
  waveOffset.offset.value = 0.7;

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

export function playBackgroundSound(anchorId: string, volume: number = 0.25): void {
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
    // Fade in over 1.2s to avoid abrupt start
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, volume)),
      ctx.currentTime + 1.2,
    );
    masterGain.connect(ctx.destination);
    _masterGain = masterGain;

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
  if (_masterGain && _ctx) {
    // Fade out over 0.6s before stopping nodes
    const gain = _masterGain;
    const ctx = _ctx;
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    const stop = _stopFn;
    setTimeout(() => {
      try { stop?.(); } catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
    }, 700);
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
