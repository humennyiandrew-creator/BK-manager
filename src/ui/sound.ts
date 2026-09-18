// Web Audio synth engine — no downloaded audio files. Lazily created AudioContext,
// resumed on first user gesture (i.e. the first play() call, normally from a click).
import { create } from 'zustand';

export type SoundName =
  | 'click' | 'hover' | 'confirm' | 'cancel' | 'error' | 'notify'
  | 'swish' | 'rim' | 'whistle' | 'buzzer' | 'dribble' | 'crowdCheer';

const STORAGE_KEY = 'bk-audio-settings';

interface Persisted { master: number; sfx: number; ambience: number; muted: boolean }

function loadPersisted(): Persisted {
  const fallback: Persisted = { master: 0.8, sfx: 0.8, ambience: 0.6, muted: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return fallback;
}

function persist(v: Persisted) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

interface AudioSettingsState extends Persisted {
  setMaster: (v: number) => void;
  setSfx: (v: number) => void;
  setAmbience: (v: number) => void;
  setMuted: (v: boolean) => void;
}

export const useAudioSettings = create<AudioSettingsState>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch);
    const { master, sfx, ambience, muted } = get();
    persist({ master, sfx, ambience, muted });
    applyVolumes();
  };
  return {
    ...loadPersisted(),
    setMaster: (master) => update({ master: clamp01(master) }),
    setSfx: (sfx) => update({ sfx: clamp01(sfx) }),
    setAmbience: (ambience) => update({ ambience: clamp01(ambience) }),
    setMuted: (muted) => update({ muted })
  };
});

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

// --- engine ---

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let ambienceGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    masterGain = ctx.createGain();
    sfxGain = ctx.createGain();
    ambienceGain = ctx.createGain();
    sfxGain.connect(masterGain);
    ambienceGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ });
  return ctx;
}

function applyVolumes() {
  if (!masterGain || !sfxGain || !ambienceGain) return;
  const { master, sfx, ambience, muted } = useAudioSettings.getState();
  masterGain.gain.value = muted ? 0 : master;
  sfxGain.gain.value = sfx;
  ambienceGain.gain.value = ambience;
}

function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
    const len = c.sampleRate * 2;
    noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Gain node with a quick attack + exponential decay envelope, connected to dest. */
function env(c: AudioContext, dest: AudioNode, attack: number, decay: number, peak: number, t0: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(dest);
  return g;
}

function tone(
  c: AudioContext, dest: AudioNode, freq: number, type: OscillatorType,
  attack: number, decay: number, peak: number, t0: number, glideTo?: number
) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + attack + decay);
  const g = env(c, dest, attack, decay, peak, t0);
  osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.05);
}

function noiseBurst(
  c: AudioContext, dest: AudioNode, filterType: BiquadFilterType, freq: number, q: number,
  attack: number, decay: number, peak: number, t0: number
) {
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);
  const filt = c.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.value = freq;
  filt.Q.value = q;
  const g = env(c, dest, attack, decay, peak, t0);
  src.connect(filt).connect(g);
  src.start(t0);
  src.stop(t0 + attack + decay + 0.05);
}

export function play(name: SoundName) {
  const c = ensureCtx();
  if (!c || !sfxGain) return;
  const t0 = c.currentTime;
  switch (name) {
    case 'click': tone(c, sfxGain, 1100, 'triangle', 0.001, 0.05, 0.16, t0); break;
    case 'hover': tone(c, sfxGain, 1800, 'sine', 0.001, 0.03, 0.035, t0); break;
    case 'confirm':
      tone(c, sfxGain, 620, 'triangle', 0.001, 0.08, 0.18, t0);
      tone(c, sfxGain, 930, 'triangle', 0.06, 0.1, 0.16, t0 + 0.06);
      break;
    case 'cancel':
      tone(c, sfxGain, 520, 'triangle', 0.001, 0.06, 0.15, t0);
      tone(c, sfxGain, 340, 'triangle', 0.05, 0.09, 0.13, t0 + 0.05);
      break;
    case 'error': tone(c, sfxGain, 220, 'square', 0.001, 0.16, 0.16, t0, 160); break;
    case 'notify':
      tone(c, sfxGain, 880, 'sine', 0.001, 0.1, 0.14, t0);
      tone(c, sfxGain, 1320, 'sine', 0.08, 0.14, 0.12, t0 + 0.08);
      break;
    case 'swish':
      noiseBurst(c, sfxGain, 'bandpass', 3400, 0.9, 0.005, 0.18, 0.14, t0);
      tone(c, sfxGain, 95, 'sine', 0.001, 0.09, 0.18, t0 + 0.05);
      break;
    case 'rim':
      tone(c, sfxGain, 900, 'square', 0.001, 0.05, 0.1, t0);
      tone(c, sfxGain, 1350, 'square', 0.001, 0.04, 0.07, t0 + 0.01);
      tone(c, sfxGain, 620, 'square', 0.001, 0.06, 0.06, t0 + 0.02);
      break;
    case 'whistle': tone(c, sfxGain, 2700, 'sawtooth', 0.01, 0.38, 0.14, t0); break;
    case 'buzzer': tone(c, sfxGain, 196, 'square', 0.02, 0.78, 0.22, t0); break;
    case 'dribble': tone(c, sfxGain, 100, 'sine', 0.001, 0.08, 0.22, t0); break;
    case 'crowdCheer': noiseBurst(c, sfxGain, 'bandpass', 1000, 0.7, 0.05, 1.3, 0.22, t0); break;
  }
}

// --- looping arena ambience ---

let crowdSource: AudioBufferSourceNode | null = null;
let crowdFilter: BiquadFilterNode | null = null;
let crowdIntensityGain: GainNode | null = null;

export function startCrowd() {
  const c = ensureCtx();
  if (!c || !ambienceGain || crowdSource) return;
  crowdSource = c.createBufferSource();
  crowdSource.buffer = getNoiseBuffer(c);
  crowdSource.loop = true;
  crowdFilter = c.createBiquadFilter();
  crowdFilter.type = 'bandpass';
  crowdFilter.frequency.value = 700;
  crowdFilter.Q.value = 0.5;
  crowdIntensityGain = c.createGain();
  crowdIntensityGain.gain.value = 0.25;
  crowdSource.connect(crowdFilter).connect(crowdIntensityGain).connect(ambienceGain);
  crowdSource.start();
}

export function stopCrowd() {
  if (crowdSource) {
    try { crowdSource.stop(); } catch { /* ignore */ }
    crowdSource.disconnect();
  }
  crowdSource = null;
  crowdFilter = null;
  crowdIntensityGain = null;
}

/** 0..1 crowd energy — scales loudness and brightens the filter. */
export function crowdIntensity(v: number) {
  if (!crowdIntensityGain || !crowdFilter || !ctx) return;
  const clamped = clamp01(v);
  crowdIntensityGain.gain.setTargetAtTime(0.15 + clamped * 0.55, ctx.currentTime, 0.3);
  crowdFilter.frequency.setTargetAtTime(600 + clamped * 900, ctx.currentTime, 0.3);
}
