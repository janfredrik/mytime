// Synthesizes the soundtrack for promo.html, synced to its keystroke/stamp timeline, and writes a WAV.
// Usage: node promo/audio.mjs   (needs CHROME pointing at a Chromium binary, like render.mjs)
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---- Timeline from the page itself ----
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage();
await page.goto('file://' + path.join(dir, 'promo.html') + '?capture');
const EV = await page.evaluate(() => EV.map((e) => ({ t: e.t, kind: e.kind, key: e.key ?? null, c: e.c ?? null })));
await browser.close();

// ---- Engine ----
const SR = 48000, DUR = 10, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N), SL = new Float32Array(N), SRb = new Float32Array(N);
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function render(dur, fn) {
  const n = Math.round(dur * SR), a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = fn(i / SR, i);
  return a;
}
function mix(sig, t0, { gain = 1, pan = 0, send = 0 } = {}) {
  const s0 = Math.round(t0 * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < sig.length; i++) {
    const k = s0 + i;
    if (k < 0 || k >= N) continue;
    const v = sig[i] * gain;
    L[k] += v * gl; R[k] += v * gr;
    if (send) { SL[k] += v * gl * send; SRb[k] += v * gr * send; }
  }
}
// Biquad; f may be a function of time for sweeps.
function filter(sig, type, f, q = 0.707) {
  const out = new Float32Array(sig.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
  const coef = (fc) => {
    const w = (TAU * Math.min(fc, SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let B0, B1, B2;
    if (type === 'lp') { B0 = (1 - c) / 2; B1 = 1 - c; B2 = B0; }
    else if (type === 'hp') { B0 = (1 + c) / 2; B1 = -(1 + c); B2 = B0; }
    else { B0 = al; B1 = 0; B2 = -al; }
    const A0 = 1 + al;
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = (-2 * c) / A0; a2 = (1 - al) / A0;
  };
  if (typeof f === 'number') coef(f);
  for (let i = 0; i < sig.length; i++) {
    if (typeof f === 'function' && i % 32 === 0) coef(f(i / SR));
    const x = sig[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}
const saw = (ph, f, maxH = 14) => {
  let s = 0;
  const H = Math.min(maxH, Math.floor(SR / 2 / f));
  for (let k = 1; k <= H; k++) s += Math.sin(ph * k) / k;
  return s * 0.55;
};
const adsr = (t, dur, a, r) => Math.min(1, t / a) * Math.min(1, Math.max(0, (dur - t) / r));

// ---- Instruments ----
const kick = (t0, g = 0.9) => {
  let ph = 0;
  mix(render(0.4, (t) => { ph += (TAU * (44 + 120 * Math.exp(-t / 0.028))) / SR; return Math.sin(ph) * Math.exp(-t / 0.13) + noise() * Math.exp(-t / 0.002) * 0.3; }), t0, { gain: g });
};
const hat = (t0, g = 0.12, pan = 0.25) => mix(filter(render(0.08, (t) => noise() * Math.exp(-t / 0.022)), 'hp', 7500), t0, { gain: g, pan });
const tick = (t0, hi) => mix(filter(render(0.05, (t) => noise() * Math.exp(-t / 0.006)), 'bp', hi ? 4200 : 3100, 6), t0, { gain: 0.55, pan: hi ? 0.15 : -0.15, send: 0.25 });
function key(t0, label) {
  const enter = label === '⏎' || label === '→';
  const bp = enter ? 1500 : 2300 + rnd() * 900;
  const click = filter(render(0.06, (t) => noise() * Math.exp(-t / (enter ? 0.016 : 0.009))), 'bp', bp, 1.4);
  const thump = render(0.06, (t) => Math.sin(TAU * (enter ? 140 : 190) * t) * Math.exp(-t / 0.018));
  const sig = click.map((v, i) => v + thump[i] * 0.5);
  mix(sig, t0, { gain: enter ? 0.5 : 0.38, pan: (rnd() - 0.5) * 0.5 });
}
function bell(t0, f, g = 0.3, pan = 0, decay = 1.1) {
  const parts = [[1, 1, decay], [2.0, 0.45, decay * 0.5], [3.01, 0.22, decay * 0.3], [4.17, 0.12, decay * 0.2]];
  mix(render(decay * 2.5, (t) => parts.reduce((s, [m, a, d]) => s + a * Math.sin(TAU * f * m * t) * Math.exp(-t / d), 0) * Math.min(1, t / 0.002)), t0, { gain: g, pan, send: 0.45 });
}
function stamp(t0, i) {
  let ph = 0;
  mix(render(0.25, (t) => { ph += (TAU * (60 + 70 * Math.exp(-t / 0.02))) / SR; return Math.sin(ph) * Math.exp(-t / 0.07); }), t0, { gain: 0.6 });
  mix(filter(render(0.08, (t) => noise() * Math.exp(-t / 0.012)), 'lp', 1400), t0, { gain: 0.35 });
  const notes = [76, 79, 81, 84, 88]; // E5 G5 A5 C6 E6: climbs as the week fills
  bell(t0 + 0.015, mtof(notes[i]), 0.26, -0.3 + i * 0.15);
}
function whoosh(t0, dur, from, to, g = 0.35) {
  const sig = filter(render(dur, () => noise()), 'bp', (t) => from * Math.pow(to / from, t / dur), 1.2);
  mix(sig.map((v, i) => v * Math.pow(Math.sin((Math.PI * i) / sig.length), 2)), t0, { gain: g, send: 0.3 });
}
function boom(t0, g = 0.8) {
  let ph = 0;
  mix(render(1.4, (t) => { ph += (TAU * (32 + 60 * Math.exp(-t / 0.08))) / SR; return Math.sin(ph) * Math.exp(-t / 0.45); }), t0, { gain: g, send: 0.3 });
  mix(filter(render(0.5, (t) => noise() * Math.exp(-t / 0.09)), 'lp', 300), t0, { gain: 0.5, send: 0.4 });
}
function pad(t0, dur, midis, { g = 0.08, cutoff = 1800, a = 0.25, r = 0.5, send = 0.35 } = {}) {
  midis.forEach((m, n) => {
    const f = mtof(m);
    [-0.09, 0, 0.08].forEach((det, j) => {
      const fr = f * Math.pow(2, det / 12);
      const sig = render(dur, (t) => saw(TAU * fr * t + j * 2.1, fr) * adsr(t, dur, a, r));
      mix(filter(sig, 'lp', cutoff), t0, { gain: g, pan: (j - 1) * 0.5 * (n % 2 ? 1 : -1), send });
    });
  });
}
function bass(t0, dur, m, g = 0.32) {
  const f = mtof(m);
  const sig = render(dur, (t) => saw(TAU * f * t, f, 10) * adsr(t, dur, 0.004, 0.04));
  mix(filter(sig, 'lp', (t) => 180 + 1400 * Math.exp(-t / 0.07), 1.2), t0, { gain: g });
}

// ---- Score ----
// Scene A (0–2.3): low drone, a clock ticking, a hit on «Til nå.»
pad(0, 2.6, [33, 40, 45], { g: 0.07, cutoff: 380, a: 0.4, r: 0.5, send: 0.2 });
for (let t = 0.1, i = 0; t < 2.1; t += 0.5, i++) tick(t, i % 2 === 0);
boom(1.15, 0.85);
whoosh(1.8, 0.7, 2500, 250, 0.22); // the old screen falls away

// Teal reveal and title
whoosh(2.05, 0.75, 300, 6000, 0.38);
pad(2.45, 1.25, [60, 64, 67, 71, 74], { g: 0.05, cutoff: 3200, a: 0.12, r: 0.45 });
bell(2.5, mtof(84), 0.16, 0.2, 1.4);
bell(2.62, mtof(91), 0.1, -0.2, 1.2);
whoosh(3.0, 0.7, 500, 5000, 0.28); // into the app

// Groove under the app (3.45–8.3), 125 bpm
const BEAT = 0.48, G0 = 3.45;
const chords = [[48, [60, 64, 67, 72]], [45, [57, 60, 64, 69]], [41, [57, 60, 65, 69]]];
for (let b = 0; b < 10; b++) {
  const t = G0 + b * BEAT;
  const [root, notes] = chords[Math.min(2, Math.floor(b / 4))];
  kick(t, b === 0 ? 1 : 0.75);
  hat(t + BEAT / 2);
  if (b % 2) hat(t + BEAT * 0.75, 0.06, -0.25);
  bass(t, BEAT * 0.45, root - 12);
  bass(t + BEAT / 2, BEAT * 0.4, root);
  if (b % 4 === 0) pad(t, BEAT * Math.min(4, 10 - b), notes, { g: 0.035, cutoff: 1500, a: 0.05, r: 0.3 });
}
// Typing and stamps straight from the page timeline
for (const e of EV) {
  if (e.key) key(e.t, e.key);
  if (e.kind === 'stamp') stamp(e.t, e.c);
}
// Export: mouse click, then a success chime
mix(filter(render(0.03, (t) => noise() * Math.exp(-t / 0.003)), 'bp', 3500, 2), 7.27, { gain: 0.5 });
mix(filter(render(0.03, (t) => noise() * Math.exp(-t / 0.003)), 'bp', 3000, 2), 7.38, { gain: 0.35 });
bell(7.47, mtof(84), 0.22, -0.1);
bell(7.57, mtof(91), 0.22, 0.1);

// End card: riser, hit, big warm chord and a sparkle
whoosh(7.9, 0.75, 400, 7000, 0.35);
boom(8.6, 0.75);
pad(8.6, 1.4, [36, 48, 55, 59, 62, 64, 71, 76], { g: 0.04, cutoff: 2600, a: 0.04, r: 1.0, send: 0.5 });
[79, 84, 88, 91].forEach((m, i) => bell(8.62 + i * 0.07, mtof(m), 0.14, -0.3 + i * 0.2, 1.6));
bell(9.0, mtof(96), 0.08, 0, 1.4);

// ---- Reverb (Schroeder) on the send bus ----
function reverb(inp, offs) {
  const out = new Float32Array(N);
  for (const [d0, fb] of [[1557, 0.82], [1617, 0.81], [1491, 0.83], [1422, 0.8]]) {
    const d = Math.round((d0 + offs) * (SR / 44100)), buf = new Float32Array(d);
    let p = 0, lp = 0;
    for (let i = 0; i < N; i++) { const y = buf[p]; lp = y * 0.7 + lp * 0.3; buf[p] = inp[i] + lp * fb; p = (p + 1) % d; out[i] += y * 0.25; }
  }
  for (const d0 of [225, 556]) {
    const d = Math.round((d0 + offs) * (SR / 44100)), buf = new Float32Array(d);
    let p = 0;
    for (let i = 0; i < N; i++) { const b = buf[p], y = -out[i] + b; buf[p] = out[i] + b * 0.5; out[i] = y; p = (p + 1) % d; }
  }
  return out;
}
const RL = reverb(SL, 0), RR = reverb(SRb, 23);

// ---- Master: sum, soft clip, fade, normalize, 16-bit WAV ----
const out = new Int16Array(N * 2);
let peak = 0;
const mL = new Float32Array(N), mR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, i / (SR * 0.01), (N - i) / (SR * 0.3));
  mL[i] = Math.tanh((L[i] + RL[i] * 0.35) * 1.1) * fade;
  mR[i] = Math.tanh((R[i] + RR[i] * 0.35) * 1.1) * fade;
  peak = Math.max(peak, Math.abs(mL[i]), Math.abs(mR[i]));
}
const norm = 0.89 / peak;
for (let i = 0; i < N; i++) { out[i * 2] = mL[i] * norm * 32767; out[i * 2 + 1] = mR[i] * norm * 32767; }
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + out.byteLength, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
header.writeUInt32LE(out.byteLength, 40);
writeFileSync(path.join(dir, 'soundtrack.wav'), Buffer.concat([header, Buffer.from(out.buffer)]));
console.log('wrote soundtrack.wav, events:', EV.length);
