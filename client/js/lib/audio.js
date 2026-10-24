/**
 * Small sound manager built on the Web Audio API: every sound is synthesised
 * (no audio files, so no licensing questions). The AudioContext is created on
 * the first user gesture to respect browser autoplay rules, volume is kept
 * low, and repeated calls of the same sound within a short window are ignored.
 */
// Sounds: scannerOn, qrDetected, lookupSuccess, invalid, statusUpdated, dropSuccess.
const SOUNDS = {
  scannerOn: [{ f: 520, at: 0, dur: 0.12, type: 'sine', slideTo: 880 }],
  qrDetected: [{ f: 1320, at: 0, dur: 0.07, type: 'square', gain: 0.35 }],
  lookupSuccess: [
    { f: 660, at: 0, dur: 0.12 },
    { f: 990, at: 0.1, dur: 0.18 },
  ],
  invalid: [
    { f: 220, at: 0, dur: 0.12, type: 'triangle' },
    { f: 180, at: 0.14, dur: 0.16, type: 'triangle' },
  ],
  statusUpdated: [
    { f: 523, at: 0, dur: 0.1 },
    { f: 659, at: 0.08, dur: 0.1 },
    { f: 784, at: 0.16, dur: 0.2 },
  ],
  dropSuccess: [
    { f: 140, at: 0, dur: 0.09, type: 'triangle', gain: 1.4 },
    { f: 880, at: 0.07, dur: 0.16 },
  ],
};

const KEY = 'aerotrack-sound';
const VOLUME = 0.08;

let ctx = null;
let enabled = readPref();
const lastPlayed = new Map();
const listeners = new Set();

function readPref() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function context() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from a click/tap handler so later sounds are allowed to play. */
export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

{
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

export function playSound(name) {
  if (!enabled) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < 400) return; // no machine-gun beeps
  lastPlayed.set(name, now);
  const c = context();
  if (!c || c.state !== 'running') return; // blocked until a user gesture: visual feedback still shows
  const t0 = c.currentTime + 0.01;
  for (const n of SOUNDS[name]) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.f, t0 + n.at);
    if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, t0 + n.at + n.dur);
    const peak = VOLUME * (n.gain ?? 1);
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(on) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked: preference lasts for this visit */
  }
  listeners.forEach((l) => l(on));
  if (on) {
    unlockAudio();
    playSound('qrDetected');
  }
}

export function subscribeSound(fn) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
