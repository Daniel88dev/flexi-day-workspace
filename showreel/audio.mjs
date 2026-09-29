// Synthesises the soundtrack from the same cue sheet as the picture: 120 BPM in F major,
// Dm – B♭ – F – C – Dm – B♭/C – F, with every UI moment scored on its frame.
//
//   node audio.mjs   → out/soundtrack.wav (48 kHz, 24-bit stereo)
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CUE, BARS } from "./src/timeline.js";
import { flights } from "./src/scenes/calendar.js";
import { snap, tw } from "./src/anim.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const LEN = 15;
const N = Math.ceil(SR * (LEN + 0.05));
const TAU = Math.PI * 2;

const bus = () => [new Float32Array(N), new Float32Array(N)];
const dry = bus(),
  verb = bus(),
  echo = bus(),
  pads = bus(),
  bass = bus();

let seed = 1234567;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rand() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const db = (d) => Math.pow(10, d / 20);

function mix(dst, t0, mono, gain = 1, pan = 0) {
  const i0 = Math.round(t0 * SR);
  const a = ((pan + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * gain * Math.SQRT2,
    gr = Math.sin(a) * gain * Math.SQRT2;
  for (let i = 0; i < mono.length; i++) {
    const j = i0 + i;
    if (j < 0 || j >= N) continue;
    dst[0][j] += mono[i] * gl;
    dst[1][j] += mono[i] * gr;
  }
}

// Sends a sound to the dry bus and, scaled, to the reverb and echo buses.
function place(t0, mono, { gain = 1, pan = 0, rev = 0, dly = 0, to = dry } = {}) {
  mix(to, t0, mono, gain, pan);
  if (rev) mix(verb, t0, mono, gain * rev, pan);
  if (dly) mix(echo, t0, mono, gain * dly, pan);
}

// RBJ biquad, coefficients recomputed on demand for sweeps.
class Biquad {
  constructor(type, f, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(f, q);
  }
  set(f, q = this.q) {
    this.q = q;
    const w = (TAU * Math.min(f, SR * 0.45)) / SR;
    const cs = Math.cos(w),
      al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    const a0 = 1 + al,
      a1 = -2 * cs,
      a2 = 1 - al;
    if (this.type === "lp") [b0, b1, b2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
    else if (this.type === "hp") [b0, b1, b2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
    else [b0, b1, b2] = [al, 0, -al];
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }
  run(x) {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// PolyBLEP saw, so high notes don't alias.
function saw(phase, dt) {
  let v = 2 * phase - 1;
  if (phase < dt) {
    const t = phase / dt;
    v -= t + t - t * t - 1;
  } else if (phase > 1 - dt) {
    const t = (phase - 1) / dt;
    v -= t * t + t + t + 1;
  }
  return v;
}

// Every buffer ends in a short fade, so nothing stops while it still rings.
const render = (dur, fn, { tail = 0.008 } = {}) => {
  const out = new Float32Array(Math.ceil(dur * SR));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR, i);
  const k = Math.min(out.length, Math.round(tail * SR));
  for (let i = 0; i < k; i++) out[out.length - 1 - i] *= i / k;
  return out;
};

// ---------------------------------------------------------------- instruments

function kick(t0, { gain = 1, punch = 1 } = {}) {
  let ph = 0;
  const hp = new Biquad("hp", 2500);
  const s = render(1.0, (t) => {
    const f = 50 + 120 * punch * Math.exp(-t / 0.032);
    ph += f / SR;
    const body = Math.sin(TAU * ph) * Math.exp(-t / 0.19) * Math.min(1, t / 0.001);
    const click = hp.run(noise()) * Math.exp(-t / 0.004) * 0.5;
    return Math.tanh((body + click) * 1.6) * 0.8;
  });
  place(t0, s, { gain });
}

function clap(t0, { gain = 1, pan = 0 } = {}) {
  const bp = new Biquad("bp", 1300, 1.1);
  const s = render(0.8, (t) => {
    let env = 0;
    for (const o of [0, 0.011, 0.022])
      if (t >= o) env += Math.exp(-(t - o) / (o === 0.022 ? 0.12 : 0.008));
    const body = Math.sin(TAU * 190 * t) * Math.exp(-t / 0.05) * 0.4;
    return bp.run(noise()) * env * 0.9 + body;
  });
  place(t0, s, { gain, pan, rev: 0.35 });
}

function hat(t0, { gain = 1, open = false, pan = 0 } = {}) {
  const hp = new Biquad("hp", 7200, 0.9);
  const s = render(
    open ? 0.75 : 0.2,
    (t) => hp.run(noise()) * Math.exp(-t / (open ? 0.12 : 0.028))
  );
  place(t0, s, { gain, pan, rev: 0.08 });
}

function bassNote(t0, dur, midi, { gain = 1 } = {}) {
  const f = mtof(midi);
  let p1 = 0,
    p2 = 0;
  const lp = new Biquad("lp", 900, 0.9);
  const s = render(dur + 0.12, (t, i) => {
    p1 = (p1 + f / SR) % 1;
    p2 = (p2 + (f * 1.003) / SR) % 1;
    if (i % 32 === 0) lp.set(260 + 900 * Math.exp(-t / 0.09));
    const env =
      Math.min(1, t / 0.004) *
      (t > dur ? Math.exp(-(t - dur) / 0.015) : 0.85 + 0.15 * Math.exp(-t / 0.1));
    return (Math.sin(TAU * p1) * 0.7 + lp.run(saw(p2, f / SR)) * 0.55) * env;
  });
  place(t0, s, { gain, to: bass });
}

function padChord(
  t0,
  dur,
  notes,
  { gain = 1, cut0 = 900, cut1 = 2200, attack = 0.25, release = 0.7 } = {}
) {
  notes.forEach((m, k) => {
    const f = mtof(m);
    for (const [det, pan] of [
      [-0.09, -0.6],
      [0, 0],
      [0.09, 0.6],
    ]) {
      const ff = f * Math.pow(2, det / 12);
      let ph = rand();
      const lp = new Biquad("lp", cut0, 0.7);
      const s = render(dur + release * 1.6, (t, i) => {
        ph = (ph + ff / SR) % 1;
        if (i % 64 === 0) lp.set(cut0 + (cut1 - cut0) * Math.min(1, t / Math.max(dur, 0.01)));
        const env = Math.min(1, t / attack) * (t > dur ? Math.exp(-(t - dur) / (release / 3)) : 1);
        return lp.run(saw(ph, ff / SR)) * env;
      });
      place(t0, s, { gain: gain * 0.1 * (k === 0 ? 0.9 : 1), pan, to: pads });
    }
  });
}

function pluck(t0, midi, { gain = 1, pan = 0, dly = 0.35, bright = 1 } = {}) {
  const f = mtof(midi);
  let p1 = 0,
    p2 = 0;
  const lp = new Biquad("lp", 5000, 1.4);
  const s = render(1.3, (t, i) => {
    p1 = (p1 + f / SR) % 1;
    p2 = (p2 + (f * 2.002) / SR) % 1;
    if (i % 16 === 0) lp.set(350 + 6500 * bright * Math.exp(-t / 0.07));
    const v = saw(p1, f / SR) * 0.7 + (p2 < 0.5 ? 0.25 : -0.25);
    return lp.run(v) * Math.exp(-t / 0.2) * Math.min(1, t / 0.002);
  });
  place(t0, s, { gain: gain * 0.5, pan, rev: 0.3, dly });
}

function bell(
  t0,
  midi,
  { gain = 1, pan = 0, ratio = 3.5, index = 2.4, decay = 1.1, rev = 0.45 } = {}
) {
  const f = mtof(midi);
  const s = render(decay * 6, (t) => {
    const I = index * Math.exp(-t / 0.18);
    return (
      Math.sin(TAU * f * t + I * Math.sin(TAU * f * ratio * t)) *
      Math.exp(-t / decay) *
      Math.min(1, t / 0.002)
    );
  });
  place(t0, s, { gain: gain * 0.35, pan, rev, dly: 0.15 });
}

function whoosh(
  t0,
  dur,
  { gain = 1, f0 = 300, f1 = 4000, q = 1.6, peak = 0.7, pan0 = 0, pan1 = 0 } = {}
) {
  const bp = new Biquad("bp", f0, q);
  const s = new Float32Array(Math.ceil(dur * SR));
  for (let i = 0; i < s.length; i++) {
    const u = i / s.length;
    if (i % 32 === 0) bp.set(f0 * Math.pow(f1 / f0, u), q);
    const env = u < peak ? Math.pow(u / peak, 2.2) : Math.pow(1 - (u - peak) / (1 - peak), 1.6);
    s[i] = bp.run(noise()) * env;
  }
  // Pan sweep: split into chunks with interpolated pan.
  const chunks = 24;
  for (let c = 0; c < chunks; c++) {
    const a = Math.floor((c * s.length) / chunks),
      b = Math.floor(((c + 1) * s.length) / chunks);
    place(t0 + a / SR, s.subarray(a, b), {
      gain,
      pan: pan0 + (pan1 - pan0) * (c / (chunks - 1)),
      rev: 0.25,
    });
  }
}

function riser(t0, dur, { gain = 1, m0 = 53, m1 = 77 } = {}) {
  const hp = new Biquad("hp", 300, 0.8);
  let ph = 0;
  const s = render(
    dur,
    (t, i) => {
      const u = t / dur;
      if (i % 32 === 0) hp.set(300 * Math.pow(25, u));
      const f = mtof(m0 + (m1 - m0) * u * u);
      ph = (ph + f / SR) % 1;
      const env = Math.pow(u, 2.4);
      return (hp.run(noise()) * 0.7 + saw(ph, f / SR) * 0.18) * env;
    },
    { tail: 0.004 }
  );
  place(t0, s, { gain, rev: 0.3 });
}

function reverseSwell(tEnd, dur, { gain = 1 } = {}) {
  const hp = new Biquad("hp", 3000, 0.7);
  const s = render(dur, (t) => hp.run(noise()) * Math.pow(t / dur, 4), { tail: 0.003 });
  place(tEnd - dur, s, { gain, rev: 0.4 });
}

function impact(t0, { gain = 1, crash = 1 } = {}) {
  let ph = 0;
  const lp = new Biquad("lp", 140, 0.8);
  const hp = new Biquad("hp", 4500, 0.7);
  const s = render(4.2, (t) => {
    const f = 34 + 44 * Math.exp(-t / 0.22);
    ph += f / SR;
    const sub = Math.sin(TAU * ph) * Math.exp(-t / 0.6) * Math.min(1, t / 0.003);
    const thump = lp.run(noise()) * Math.exp(-t / 0.18) * 1.6;
    const cr = hp.run(noise()) * Math.exp(-t / 0.9) * 0.22 * crash * Math.min(1, t / 0.004);
    return Math.tanh((sub + thump) * 1.3) * 0.9 + cr;
  });
  place(t0, s, { gain, rev: 0.25 });
}

function click(t0, { gain = 1 } = {}) {
  const hp = new Biquad("hp", 3000);
  const s = render(0.18, (t) => {
    const tick = Math.sin(TAU * 2600 * t) * Math.exp(-t / 0.0035);
    const tsk = hp.run(noise()) * Math.exp(-t / 0.0015) * 0.6;
    const thock = Math.sin(TAU * 165 * t) * Math.exp(-t / 0.02) * 0.7;
    return tick * 0.6 + tsk + thock;
  });
  place(t0, s, { gain, rev: 0.1 });
}

function tick(t0, { gain = 1, f = 4200, pan = 0, q = 5 } = {}) {
  const bp = new Biquad("bp", f, q);
  const s = render(0.03, (t) => bp.run(noise()) * Math.exp(-t / 0.006) * (t < 0.0015 ? 1 : 0.6));
  place(t0, s, { gain, pan, rev: 0.05 });
}

function clack(t0, midi, { gain = 1, pan = 0 } = {}) {
  const bp = new Biquad("bp", 1800, 7);
  const f = mtof(midi);
  const s = render(0.28, (t) => {
    const n = bp.run(noise()) * Math.exp(-t / 0.012) * 1.6;
    const tone = Math.sin(TAU * f * t) * Math.exp(-t / 0.035) * 0.7;
    return n + tone;
  });
  place(t0, s, { gain, pan, rev: 0.12 });
}

function pop(t0, { gain = 1, f0 = 420, f1 = 980, pan = 0 } = {}) {
  let ph = 0;
  const s = render(0.36, (t) => {
    const f = f0 + (f1 - f0) * Math.min(1, t / 0.03);
    ph += f / SR;
    return Math.sin(TAU * ph) * Math.exp(-t / 0.045) * Math.min(1, t / 0.002);
  });
  place(t0, s, { gain, pan, rev: 0.2 });
}

function boop(t0, { gain = 1, f0 = 200, f1 = 92 } = {}) {
  let ph = 0;
  const s = render(1.3, (t) => {
    const f = f1 + (f0 - f1) * Math.exp(-t / 0.035);
    ph += f / SR;
    return Math.tanh(Math.sin(TAU * ph) * 1.4) * Math.exp(-t / 0.2) * Math.min(1, t / 0.002);
  });
  place(t0, s, { gain, rev: 0.3 });
}

function ping(t0, midi, { gain = 1, pan = 0, decay = 0.09 } = {}) {
  const f = mtof(midi);
  const s = render(
    decay * 5,
    (t) => Math.sin(TAU * f * t) * Math.exp(-t / decay) * Math.min(1, t / 0.001)
  );
  place(t0, s, { gain, pan, rev: 0.4, dly: 0.2 });
}

function swish(t0, dur, { gain = 1, pan0 = 0.6, pan1 = -0.6 } = {}) {
  whoosh(t0, dur, { gain, f0: 1200, f1: 6500, q: 1.2, peak: 0.55, pan0, pan1 });
}

// ---------------------------------------------------------------- score

const PENTA = [0, 2, 4, 7, 9]; // F major pentatonic from F
const penta = (k, base = 65) => base + 12 * Math.floor(k / 5) + PENTA[((k % 5) + 5) % 5];

// Bar 1 — genesis.
padChord(0, 2.0, [62, 65, 69, 76], { gain: 0.8, cut0: 350, cut1: 1400, attack: 0.9 });
whoosh(0.0, 0.5, { gain: 0.35, f0: 3200, f1: 500, q: 2.2, peak: 0.85 });
boop(CUE.dotLand, { gain: 0.6 });
kick(CUE.dotLand, { gain: 0.38, punch: 0.6 });
bell(CUE.dotLand + 0.02, 81, { gain: 0.45, ratio: 2, index: 1.2, decay: 1.4 });
bell(CUE.burst, 86, { gain: 0.35, ratio: 3.5, decay: 0.9, pan: -0.2 });
bell(CUE.burst + 0.04, 89, { gain: 0.3, ratio: 3.5, decay: 0.9, pan: 0.2 });
whoosh(CUE.burst - 0.02, 0.45, { gain: 0.45, f0: 600, f1: 5000, peak: 0.25, pan0: 0, pan1: 0 });
{
  const morphs = flights
    .map((f, i) => ({ t: f.start + f.dur * 0.5, x: f.p2[0], i }))
    .sort((a, b) => a.t - b.t);
  morphs.forEach((m, k) =>
    ping(m.t, penta(k % 10, 77), { gain: 0.07, pan: (m.x - 960) / 900, decay: 0.05 })
  );
}
whoosh(CUE.wipe[0], CUE.wipe[1] - CUE.wipe[0] + 0.05, {
  gain: 0.55,
  f0: 400,
  f1: 7000,
  q: 1.1,
  peak: 0.9,
});
reverseSwell(2.0, 0.6, { gain: 0.35 });

// Bar 2 — the calendar fills: every bar is a pluck, climbing the pentatonic.
padChord(2.0, 2.0, [62, 65, 70, 74], { gain: 0.9, cut0: 1100, cut1: 2600 });
bassNote(2.0, 0.9, 34);
bassNote(3.0, 0.5, 34);
bassNote(3.5, 0.45, 46);
kick(2.0);
kick(3.0, { gain: 0.9 });
clap(3.0, { gain: 0.6 });
for (let k = 0; k < 8; k++) hat(2.0 + k * 0.25, { gain: 0.1 + (k % 2) * 0.1, pan: 0.25 });
pop(CUE.bankFlip + 0.06, { gain: 0.35, f0: 300, f1: 700 });
BARS.forEach((b, k) =>
  pluck(b.at + 0.02, penta(k), {
    gain: 0.55,
    pan: ((b.c0 + b.c1) / 2 - 3) / 4.5,
    bright: 0.8 + k * 0.02,
  })
);
riser(3.35, 0.65, { gain: 0.4, m0: 58, m1: 82 });
whoosh(CUE.dive[0], CUE.dive[1] - CUE.dive[0], {
  gain: 0.6,
  f0: 250,
  f1: 3500,
  q: 1.3,
  peak: 0.95,
});

// Bar 3 — the drop: approve in one click.
impact(CUE.drop, { gain: 0.8 });
const groove = (t0, bars, { hats = true } = {}) => {
  for (let b = 0; b < bars * 4; b++) {
    const t = t0 + b * 0.5;
    kick(t);
    if (b % 2 === 1) clap(t, { gain: 0.75 });
    if (hats) {
      hat(t + 0.25, { gain: 0.32, open: true, pan: 0.2 });
      hat(t + 0.125, { gain: 0.1, pan: -0.3 });
      hat(t + 0.375, { gain: 0.12, pan: -0.3 });
    }
  }
};
groove(4.0, 1);
groove(6.0, 1);
const offbeatBass = (t0, bars, midi) => {
  for (let b = 0; b < bars * 4; b++) bassNote(t0 + b * 0.5 + 0.25, 0.2, midi);
};
offbeatBass(4.0, 1, 41);
padChord(4.0, 2.0, [60, 65, 69, 72], { gain: 1, cut0: 1500, cut1: 3200, attack: 0.02 });
whoosh(CUE.drop, 0.45, { gain: 0.35, f0: 2500, f1: 600, q: 1.5, peak: 0.15, pan0: 0.7, pan1: 0 });
for (let i = 0; i < 10; i++)
  tick(CUE.miniCal + i * 0.034 + 0.03, { gain: 0.3, f: 3600 + i * 120, pan: -0.2 + i * 0.05 });
click(CUE.click, { gain: 0.9 });
[84, 89, 93].forEach((m, i) =>
  bell(CUE.click + 0.16 + i * 0.045, m, {
    gain: 0.55,
    ratio: 2,
    index: 1.6,
    decay: 0.8,
    pan: -0.25 + i * 0.25,
  })
);
{
  const r = () => rand();
  for (let i = 0; i < 46; i++) {
    const t = CUE.click + 0.03 + Math.pow(r(), 1.8) * 0.85;
    ping(t, penta(Math.floor(r() * 10), 89), {
      gain: 0.05 + r() * 0.05,
      pan: r() * 1.6 - 0.8,
      decay: 0.03 + r() * 0.05,
    });
  }
}
pop(CUE.notify + 0.12, { gain: 0.35, f0: 600, f1: 1250, pan: 0.3 });
bell(CUE.notify + 0.14, 93, { gain: 0.25, ratio: 2, index: 0.8, decay: 0.5, pan: 0.3 });

// Bar 4 — whip down to the phone; the odometer ticks up.
whoosh(CUE.whip[0], CUE.whip[1] - CUE.whip[0] + 0.12, {
  gain: 0.9,
  f0: 5000,
  f1: 220,
  q: 1.0,
  peak: 0.52,
  pan0: 0.2,
  pan1: -0.2,
});
offbeatBass(6.0, 1, 36);
padChord(6.0, 2.0, [60, 64, 67, 72], { gain: 1, cut0: 1500, cut1: 3400, attack: 0.02 });
{
  let last = 0;
  for (let t = CUE.ring[0]; t <= CUE.ring[1]; t += 0.0005) {
    const v = Math.floor(15 * snap(tw(t, CUE.ring[0], CUE.ring[1])));
    if (v > last) {
      tick(t, { gain: 0.34, f: 2600 + v * 110, pan: 0.35, q: 6 });
      last = v;
    }
  }
}
[6.42, 6.52, 6.6, 6.68, 6.76].forEach((t, i) =>
  pop(t, { gain: 0.2, f0: 380 + i * 60, f1: 900 + i * 90, pan: [-0.4, 0.6, 0.7, 0.5, -0.5][i] })
);
riser(7.3, 0.42, { gain: 0.35, m0: 60, m1: 84 });
for (const t of [7.625, 7.75, 7.875]) clap(t, { gain: 0.35 + (t - 7.6) * 1.2 });
whoosh(CUE.iris[0] - 0.05, CUE.iris[1] - CUE.iris[0] + 0.1, {
  gain: 0.6,
  f0: 600,
  f1: 8000,
  q: 1.2,
  peak: 0.8,
});

// Bar 5 — the tagline, word by word.
padChord(8.0, 2.0, [62, 65, 69, 74], { gain: 0.95, cut0: 1300, cut1: 2800, attack: 0.03 });
offbeatBass(8.0, 1, 38);
const W = CUE.words;
kick(W.time);
impact(W.time, { gain: 0.25, crash: 0.4 });
kick(W.off);
clap(W.off, { gain: 0.6 });
for (let i = 0; i < 4; i++)
  pop(W.off + 0.08 + i * 0.05, { gain: 0.14, f0: 900 - i * 80, f1: 500 - i * 40 });
kick(W.handled);
clap(W.with, { gain: 0.6 });
swish(W.handled - 0.06, 0.32, { gain: 0.55, pan0: 0.8, pan1: -0.1 });
kick(W.with, { gain: 0.8 });
for (let b = 0; b < 8; b++) hat(8.0 + b * 0.25 + 0.125, { gain: 0.12, pan: 0.3 });
[77, 81, 84].forEach((m, i) =>
  bell(W.care + i * 0.07, m, { gain: 0.45, ratio: 2, index: 1.1, decay: 1.2, pan: -0.3 + i * 0.3 })
);
boop(CUE.periodDrop[1], { gain: 0.65, f0: 260, f1: 120 });
ping(CUE.periodDrop[1] + 0.01, 89, { gain: 0.12, decay: 0.2 });

// Bar 6 — hold your breath: the push into the dot, the weekday reel.
padChord(10.0, 1.0, [62, 65, 70, 74], {
  gain: 0.9,
  cut0: 1600,
  cut1: 1100,
  attack: 0.02,
  release: 0.3,
});
padChord(11.0, 0.94, [60, 65, 67, 72], {
  gain: 0.75,
  cut0: 900,
  cut1: 2600,
  attack: 0.1,
  release: 0.05,
});
kick(10.0);
bassNote(10.0, 0.45, 34);
bassNote(11.0, 0.9, 36);
riser(10.35, 0.65, { gain: 0.45, m0: 55, m1: 79 });
reverseSwell(CUE.pushDot[1], 0.55, { gain: 0.4 });
bell(CUE.markForm, 89, { gain: 0.35, ratio: 3.5, decay: 0.8 });
boop(CUE.markForm, { gain: 0.35, f0: 180, f1: 110 });
// A C7 arpeggio climbs the reel, so the landing resolves V7 → I.
[72, 76, 79, 82, 84, 88, 91].forEach((m, i) => clack(CUE.ticks[i], m, { gain: 0.55, pan: 0.15 }));
riser(11.1, 0.83, { gain: 0.5, m0: 60, m1: 89 });

// Bar 7 — land on flexiday, then breathe out.
impact(CUE.land, { gain: 1.0, crash: 1.3 });
kick(CUE.land, { gain: 1.1 });
padChord(CUE.land, 2.6, [60, 65, 69, 72, 79], {
  gain: 1.05,
  cut0: 3200,
  cut1: 1300,
  attack: 0.01,
  release: 0.9,
});
bassNote(CUE.land, 2.85, 41, { gain: 1.0 });
[77, 81, 84, 89].forEach((m, i) =>
  bell(CUE.land + i * 0.035, m, {
    gain: 0.45,
    ratio: 2,
    index: 1.4,
    decay: 1.6,
    pan: -0.45 + i * 0.3,
  })
);
[53, 57, 60, 65].forEach((m) => pluck(CUE.land, m, { gain: 0.35, dly: 0.2, bright: 1.2 }));
pluck(CUE.tagline + 0.08, 84, { gain: 0.4, pan: -0.2, dly: 0.45 });
pluck(CUE.url + 0.05, 89, { gain: 0.35, pan: 0.25, dly: 0.45 });
whoosh(CUE.glint[0], CUE.glint[1] - CUE.glint[0], {
  gain: 0.25,
  f0: 3000,
  f1: 10000,
  q: 2.5,
  peak: 0.5,
  pan0: -0.6,
  pan1: 0.6,
});
ping(CUE.glint[0] + 0.3, 101, { gain: 0.12, decay: 0.3, pan: 0.2 });
for (let b = 0; b < 4; b++) hat(12.5 + b * 0.5, { gain: 0.08 * (1 - b / 5), open: true, pan: 0.3 });

// ---------------------------------------------------------------- mix

// Sidechain: pads and bass duck under every kick-like hit.
const kicks = [
  2,
  3,
  ...[0, 1, 2, 3].map((b) => 4 + b * 0.5),
  ...[0, 1, 2, 3].map((b) => 6 + b * 0.5),
  8,
  8.5,
  9,
  9.5,
  10,
  12,
];
const duckAt = (t) => {
  let d = 1;
  for (const k of kicks)
    if (t >= k && t < k + 0.4) d = Math.min(d, 1 - 0.6 * Math.exp(-(t - k) / 0.09));
  return d;
};
const bassHp = [new Biquad("hp", 38, 0.8), new Biquad("hp", 38, 0.8)];
for (let i = 0; i < N; i++) {
  const d = duckAt(i / SR);
  for (const ch of [0, 1]) {
    dry[ch][i] += pads[ch][i] * d * 0.85 + bassHp[ch].run(bass[ch][i]) * (0.35 + 0.65 * d) * 0.42;
  }
}
// Pads reach the reverb through their own send, ducked too.
for (let i = 0; i < N; i++) {
  const d = duckAt(i / SR);
  verb[0][i] += pads[0][i] * d * 0.35;
  verb[1][i] += pads[1][i] * d * 0.35;
}

// Freeverb: parallel damped combs into series allpasses, per channel.
function freeverb(input, spread, { room = 0.84, damp = 0.3 } = {}) {
  const k = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({
    buf: new Float32Array(Math.round((d + spread) * k)),
    i: 0,
    store: 0,
  }));
  const aps = [556, 441, 341, 225].map((d) => ({
    buf: new Float32Array(Math.round((d + spread) * k)),
    i: 0,
  }));
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const x = input[n] * 0.015;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.store = o * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * room;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = y + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = b - y;
    }
    out[n] = y;
  }
  return out;
}
const wetL = freeverb(verb[0], 0),
  wetR = freeverb(verb[1], 23);

// Ping-pong echo, three-sixteenths, darkened.
function pingPong(inL, inR, time = 0.375, fb = 0.38) {
  const d = Math.round(time * SR);
  const outL = new Float32Array(N),
    outR = new Float32Array(N);
  const lpL = new Biquad("lp", 3500),
    lpR = new Biquad("lp", 3500);
  for (let n = 0; n < N; n++) {
    const fl = n >= d ? outR[n - d] : 0;
    const fr = n >= d ? outL[n - d] : 0;
    outL[n] = lpL.run(inL[n] + fl * fb);
    outR[n] = lpR.run(inR[n] + fr * fb);
  }
  return [outL, outR];
}
const [echoL, echoR] = pingPong(echo[0], echo[1]);

const master = [new Float32Array(N), new Float32Array(N)];
const hpL = new Biquad("hp", 32),
  hpR = new Biquad("hp", 32);
for (let n = 0; n < N; n++) {
  master[0][n] = hpL.run(dry[0][n] + wetL[n] * 0.9 + echoL[n] * 0.5);
  master[1][n] = hpR.run(dry[1][n] + wetR[n] * 0.9 + echoR[n] * 0.5);
}

// Gentle glue: normalise, soft-clip, normalise to -1 dBFS, fade the tail.
let peak = 0;
for (const ch of master) for (const v of ch) peak = Math.max(peak, Math.abs(v));
const drive = 1.35;
for (const ch of master)
  for (let n = 0; n < N; n++) ch[n] = Math.tanh((ch[n] / peak) * drive) / Math.tanh(drive);
peak = 0;
for (const ch of master) for (const v of ch) peak = Math.max(peak, Math.abs(v));
const g = db(-1) / peak;
const total = Math.round(LEN * SR);
for (const ch of master)
  for (let n = 0; n < total; n++) {
    const t = n / SR;
    const fade = Math.min(1, t / 0.004) * (t > LEN - 0.9 ? Math.pow((LEN - t) / 0.9, 1.5) : 1);
    ch[n] *= g * fade;
  }

// 24-bit PCM WAV.
const bytes = 3,
  data = Buffer.alloc(total * 2 * bytes);
for (let n = 0; n < total; n++)
  for (let c = 0; c < 2; c++) {
    const v = Math.max(-1, Math.min(1, master[c][n]));
    data.writeIntLE(Math.round(v * 8388607), (n * 2 + c) * bytes, bytes);
  }
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2 * bytes, 28);
header.writeUInt16LE(2 * bytes, 32);
header.writeUInt16LE(bytes * 8, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
const outDir = path.join(ROOT, "out");
fs.mkdirSync(outDir, { recursive: true });
const raw = path.join(outDir, "soundtrack-raw.wav");
fs.writeFileSync(raw, Buffer.concat([header, data]));

// Two-pass EBU R128 normalisation: measure, then apply linearly to -14 LUFS / -1.5 dBTP.
const target = "I=-14:TP=-1.5:LRA=11";
const probe = spawnSync(
  "ffmpeg",
  ["-hide_banner", "-i", raw, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"],
  {
    encoding: "utf8",
  }
);
const jsonStart = probe.stderr.lastIndexOf("{");
const m = JSON.parse(probe.stderr.slice(jsonStart, probe.stderr.indexOf("}", jsonStart) + 1));
const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
const mastered = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    raw,
    "-af",
    `loudnorm=${target}:${measured}:linear=true`,
    "-ar",
    "48000",
    "-c:a",
    "pcm_s24le",
    path.join(outDir, "soundtrack.wav"),
  ],
  { encoding: "utf8" }
);
if (mastered.status !== 0) throw new Error(mastered.stderr);
console.log(
  `soundtrack → out/soundtrack.wav (${(total / SR).toFixed(2)}s, input ${m.input_i} LUFS → -14 LUFS)`
);
