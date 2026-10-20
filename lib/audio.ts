/* change 48: the demo's synthesized voices, loaded the first time sound is
   on (components/Demo.tsx keeps the one AudioContext and its master gain;
   every voice routes through \`out\`). Moved from Demo.tsx verbatim. */

import { RING_BURST_DUR } from "@/lib/timeline";

/* One ring burst: BOTH sines (440 + 480 Hz) from a single oscillator — they
   are harmonics 11 and 12 of a 40 Hz fundamental, so one PeriodicWave
   carries the exact pair. 20ms attack, 80ms release, gain 0.12. */
export function playRing(actx: AudioContext, out: AudioNode, when: number) {
  const real = new Float32Array(13);
  const imag = new Float32Array(13);
  imag[11] = 1;
  imag[12] = 1;
  const osc = actx.createOscillator();
  osc.setPeriodicWave(actx.createPeriodicWave(real, imag));
  osc.frequency.value = 40;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.12, when + 0.02);
  g.gain.setValueAtTime(0.12, when + RING_BURST_DUR - 0.08);
  g.gain.linearRampToValueAtTime(0, when + RING_BURST_DUR);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + RING_BURST_DUR + 0.05);
}

/* The banner chime: triangle gliding 880 -> 1320 Hz over 90ms, 220ms
   release, gain 0.10. */
export function playChime(actx: AudioContext, out: AudioNode, when: number) {
  const osc = actx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(880, when);
  osc.frequency.linearRampToValueAtTime(1320, when + 0.09);
  const g = actx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.1, when + 0.015);
  g.gain.setValueAtTime(0.1, when + 0.09);
  g.gain.linearRampToValueAtTime(0, when + 0.31);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + 0.36);
}

/* The landing tone: one 220 Hz sine, 60ms, gain 0.08 — the confirmation
   card touching down on her phone. */
export function playLand(actx: AudioContext, out: AudioNode, when: number) {
  const osc = actx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 220;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.08, when + 0.008);
  g.gain.setValueAtTime(0.08, when + 0.04);
  g.gain.linearRampToValueAtTime(0, when + 0.06);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + 0.1);
}

/* change 30 (G6): one flap step = one 12ms sine at 1200Hz, gain 0.04,
   through the shared master gain. */
export function playFlapTick(actx: AudioContext, out: AudioNode) {
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = "sine";
  osc.frequency.value = 1200;
  g.gain.setValueAtTime(0.04, actx.currentTime);
  g.gain.linearRampToValueAtTime(0, actx.currentTime + 0.012);
  osc.connect(g);
  g.connect(out);
  osc.start(actx.currentTime);
  osc.stop(actx.currentTime + 0.014);
}

