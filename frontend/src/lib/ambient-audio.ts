/**
 * Wake / sleep soundscapes for Smart Ambient Pickup — synthesized via Web Audio
 * (no audio files, works offline). Free tier: non-verbal SFX only.
 */

import type { AmbientSoundStyle } from "@/lib/ambient-plan";

let _ctx: AudioContext | null = null;
let _wakeStop: (() => void) | null = null;
let _settleStop: (() => void) | null = null;
let _wakeMaster: GainNode | null = null;
let _settleMaster: GainNode | null = null;
let _wakeStopTimeoutId: ReturnType<typeof setTimeout> | null = null;
let _settleStopTimeoutId: ReturnType<typeof setTimeout> | null = null;

function disconnectGain(node: GainNode | null): void {
  if (!node) return;
  try {
    node.disconnect();
  } catch {
    // already disconnected
  }
}

function clearWakeStopTimeout(): void {
  if (_wakeStopTimeoutId !== null) {
    clearTimeout(_wakeStopTimeoutId);
    _wakeStopTimeoutId = null;
  }
}

function clearSettleStopTimeout(): void {
  if (_settleStopTimeoutId !== null) {
    clearTimeout(_settleStopTimeoutId);
    _settleStopTimeoutId = null;
  }
}

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    type W = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext || (window as W).webkitAudioContext!;
    _ctx = new AC();
  }
  if (_ctx.state === "suspended") {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

/** Call inside a user gesture before ambient mode needs audio (iOS Safari). */
export function primeAmbientAudioContext(): void {
  if (typeof window === "undefined") return;
  try {
    getCtx().resume().catch(() => {});
  } catch {
    // ignore
  }
}

function stopWakeSound(): void {
  clearWakeStopTimeout();
  try {
    _wakeStop?.();
  } catch {
    // ignore
  }
  _wakeStop = null;
  disconnectGain(_wakeMaster);
  _wakeMaster = null;
}

function stopSettleSound(): void {
  clearSettleStopTimeout();
  try {
    _settleStop?.();
  } catch {
    // ignore
  }
  _settleStop = null;
  disconnectGain(_settleMaster);
  _settleMaster = null;
}

/** Rising warm tone — ~2s “Soft Glow Rise”. */
function synthSoftGlowRise(ctx: AudioContext, dest: AudioNode): () => void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const harm = ctx.createOscillator();
  harm.type = "triangle";

  const gain = ctx.createGain();
  const harmGain = ctx.createGain();
  const now = ctx.currentTime;
  const dur = 2.0;

  osc.frequency.setValueAtTime(196, now);
  osc.frequency.exponentialRampToValueAtTime(392, now + dur * 0.72);
  osc.frequency.exponentialRampToValueAtTime(330, now + dur);

  harm.frequency.setValueAtTime(392, now);
  harm.frequency.exponentialRampToValueAtTime(784, now + dur * 0.65);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.35);
  gain.gain.linearRampToValueAtTime(0.18, now + dur * 0.7);
  gain.gain.linearRampToValueAtTime(0, now + dur);

  harmGain.gain.setValueAtTime(0, now);
  harmGain.gain.linearRampToValueAtTime(0.06, now + 0.4);
  harmGain.gain.linearRampToValueAtTime(0, now + dur);

  osc.connect(gain);
  harm.connect(harmGain);
  gain.connect(dest);
  harmGain.connect(dest);
  osc.start(now);
  harm.start(now);
  osc.stop(now + dur + 0.05);
  harm.stop(now + dur + 0.05);

  return () => {
    try {
      osc.stop();
      harm.stop();
      gain.disconnect();
      harmGain.disconnect();
    } catch {
      // already stopped
    }
  };
}

/** Bell-like bloom — ~2.1s “Crystal Bloom”. */
function synthCrystalBloom(ctx: AudioContext, dest: AudioNode): () => void {
  const freqs = [880, 1174.66, 1567.98];
  const stops: (() => void)[] = [];
  const now = ctx.currentTime;

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const start = now + i * 0.12;
    const dur = 1.65 - i * 0.15;

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.14 - i * 0.025, start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    stops.push(() => {
      try {
        osc.stop();
        gain.disconnect();
      } catch {
        // ignore
      }
    });
  });

  return () => stops.forEach((fn) => fn());
}

/** Gentle descending chime when settling to sleep — ~1.2s. */
function synthSettlingChime(ctx: AudioContext, dest: AudioNode): () => void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const dur = 1.2;

  osc.frequency.setValueAtTime(392, now);
  osc.frequency.exponentialRampToValueAtTime(262, now + dur);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.06);
  gain.gain.linearRampToValueAtTime(0, now + dur);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(now);
  osc.stop(now + dur + 0.05);

  return () => {
    try {
      osc.stop();
      gain.disconnect();
    } catch {
      // ignore
    }
  };
}

/** Play non-verbal wake SFX (free tier). Premium still hears this under TTS. */
export function playAmbientWakeSound(style: AmbientSoundStyle): void {
  if (typeof window === "undefined") return;
  stopWakeSound();
  stopSettleSound();

  try {
    const ctx = getCtx();
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    _wakeMaster = master;

    const stopSynth =
      style === "crystal_bloom"
        ? synthCrystalBloom(ctx, master)
        : synthSoftGlowRise(ctx, master);
    _wakeStop = () => {
      stopSynth();
      disconnectGain(master);
      if (_wakeMaster === master) _wakeMaster = null;
    };

    _wakeStopTimeoutId = setTimeout(() => {
      _wakeStopTimeoutId = null;
      stopWakeSound();
    }, 2_500);
  } catch {
    // non-fatal
  }
}

/** Soft settling sound when returning to sleep. */
export function playAmbientSettleSound(): void {
  if (typeof window === "undefined") return;
  stopWakeSound();
  stopSettleSound();

  try {
    const ctx = getCtx();
    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    _settleMaster = master;

    const stopSynth = synthSettlingChime(ctx, master);
    _settleStop = () => {
      stopSynth();
      disconnectGain(master);
      if (_settleMaster === master) _settleMaster = null;
    };
    _settleStopTimeoutId = setTimeout(() => {
      _settleStopTimeoutId = null;
      stopSettleSound();
    }, 1_400);
  } catch {
    // non-fatal
  }
}
