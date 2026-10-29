// Tiny WebAudio synth: original blips and a fanfare, no samples.
import { useApp } from '../store/store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useApp.getState().prefs.sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.08) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sound = {
  blip: () => tone(880, 0, 0.07, 'square', 0.05),
  tap: () => tone(660, 0, 0.06, 'triangle', 0.09),
  tick: () => tone(1200, 0, 0.03, 'square', 0.03),
  success: () => {
    tone(784, 0, 0.1, 'triangle', 0.09);
    tone(1175, 0.09, 0.18, 'triangle', 0.09);
  },
  error: () => {
    tone(220, 0, 0.12, 'sawtooth', 0.05);
    tone(180, 0.1, 0.18, 'sawtooth', 0.05);
  },
  fanfare: () => {
    const notes: [number, number, number][] = [
      [523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.14], [1047, 0.42, 0.32],
      [784, 0.78, 0.12], [1047, 0.92, 0.6],
    ];
    for (const [f, s, d] of notes) {
      tone(f, s, d, 'square', 0.06);
      tone(f / 2, s, d, 'triangle', 0.06);
    }
  },
};

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
