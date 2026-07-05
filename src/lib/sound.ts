// Lightweight, synthesized UI sounds (Web Audio API) — no asset files, works
// offline, tiny. Deliberately few and subtle: move, capture, check, error,
// brilliant. Triggered only by user interaction so autoplay policies are happy.

type SoundName = "move" | "capture" | "check" | "error" | "brilliant";

let ctx: AudioContext | null = null;
let muted = false;

const STORAGE_KEY = "bv_sound_muted";

// Read the saved preference lazily (client only).
function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

let initialized = false;
function ensureInit() {
  if (initialized) return;
  initialized = true;
  muted = loadMuted();
}

export function isMuted(): boolean {
  ensureInit();
  return muted;
}

export function setMuted(next: boolean) {
  ensureInit();
  muted = next;
  try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
}

export function toggleMuted(): boolean {
  setMuted(!isMuted());
  return muted;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Resume if the browser suspended it before a user gesture.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// A single enveloped tone.
function tone(
  audio: AudioContext,
  { freq, type = "sine", start = 0, dur = 0.09, gain = 0.12, glideTo }: {
    freq: number; type?: OscillatorType; start?: number; dur?: number; gain?: number; glideTo?: number;
  },
) {
  const t0 = audio.currentTime + start;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  // Fast attack, smooth decay — avoids clicks.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Short filtered-noise burst (used for the "capture" thud).
function noise(audio: AudioContext, { dur = 0.08, gain = 0.09, cutoff = 900 } = {}) {
  const t0 = audio.currentTime;
  const frames = Math.floor(audio.sampleRate * dur);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const lp = audio.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  const g = audio.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(lp); lp.connect(g); g.connect(audio.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

export function play(name: SoundName) {
  ensureInit();
  if (muted) return;
  const audio = getCtx();
  if (!audio) return;
  try {
    switch (name) {
      case "move":
        tone(audio, { freq: 220, type: "triangle", dur: 0.07, gain: 0.10 });
        break;
      case "capture":
        noise(audio, { dur: 0.09, gain: 0.10, cutoff: 1100 });
        tone(audio, { freq: 150, type: "square", dur: 0.08, gain: 0.07 });
        break;
      case "check":
        tone(audio, { freq: 660, type: "sine", dur: 0.09, gain: 0.09 });
        tone(audio, { freq: 880, type: "sine", start: 0.07, dur: 0.10, gain: 0.09 });
        break;
      case "error":
        tone(audio, { freq: 300, type: "sawtooth", dur: 0.22, gain: 0.08, glideTo: 120 });
        break;
      case "brilliant":
        // Bright ascending arpeggio.
        tone(audio, { freq: 523, type: "sine", start: 0.00, dur: 0.12, gain: 0.10 });
        tone(audio, { freq: 659, type: "sine", start: 0.09, dur: 0.12, gain: 0.10 });
        tone(audio, { freq: 784, type: "sine", start: 0.18, dur: 0.16, gain: 0.11 });
        break;
    }
  } catch { /* audio best-effort */ }
}
