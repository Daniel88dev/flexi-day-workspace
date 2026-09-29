export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, p) => a + (b - a) * p;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));

export const linear = (x) => x;
export const inQuad = (x) => x * x;
export const outQuad = (x) => 1 - (1 - x) * (1 - x);
export const inOutQuad = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export const inCubic = (x) => x * x * x;
export const outCubic = (x) => 1 - Math.pow(1 - x, 3);
export const inOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const inQuart = (x) => x * x * x * x;
export const outQuart = (x) => 1 - Math.pow(1 - x, 4);
export const inOutQuart = (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2);
export const inQuint = (x) => x ** 5;
export const outQuint = (x) => 1 - Math.pow(1 - x, 5);
export const inOutQuint = (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2);
export const inExpo = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
export const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const inOutExpo = (x) =>
  x <= 0
    ? 0
    : x >= 1
      ? 1
      : x < 0.5
        ? Math.pow(2, 20 * x - 10) / 2
        : (2 - Math.pow(2, -20 * x + 10)) / 2;
export const inSine = (x) => 1 - Math.cos((x * Math.PI) / 2);
export const outSine = (x) => Math.sin((x * Math.PI) / 2);
export const inOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
export const outBack =
  (s = 1.70158) =>
  (x) =>
    1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
export const inBack =
  (s = 1.70158) =>
  (x) =>
    (s + 1) * x * x * x - s * x * x;

// WebKit UnitBezier: solve x(t) = x for t, return y(t).
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0,
      hi = 1;
    t = x;
    while (lo < hi) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
      if (hi - lo < 1e-7) break;
    }
    return sy(t);
  };
}

// Signature curves: a hard expo-like ease-out and a long, confident in-out.
export const snap = bezier(0.16, 1, 0.3, 1);
export const glide = bezier(0.65, 0, 0.25, 1);
export const swoop = bezier(0.85, 0, 0.15, 1);

export const tw = (t, t0, t1, ease = linear) => ease(clamp((t - t0) / (t1 - t0)));

// kf(t, [[time, value, easeToNext], ...]) — numbers or equal-length arrays.
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0, e = inOutCubic] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t < t1) {
      const p = e((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], p)) : lerp(v0, v1, p);
    }
  }
  return keys[keys.length - 1][1];
}

// Damped harmonic oscillator step response: 0 at t<=0, settles on 1.
export function spring(t, freq = 2, damping = 0.5) {
  if (t <= 0) return 0;
  const w0 = 2 * Math.PI * freq;
  if (damping < 1) {
    const wd = w0 * Math.sqrt(1 - damping * damping);
    return (
      1 -
      Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + ((damping * w0) / wd) * Math.sin(wd * t))
    );
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

// Decaying sine: an impulse that rings out. 0 at t<=0.
export const wobble = (t, freq = 6, decay = 6) =>
  t <= 0 ? 0 : Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * t);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(i, seed) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth 1D value noise in [-1, 1].
export function noise(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
}

// Camera shake that starts at t0 and dies away.
export function shake(t, t0, amp = 10, dur = 0.35, freq = 28, seed = 1) {
  if (t < t0 || t > t0 + dur) return [0, 0];
  const k = Math.pow(1 - (t - t0) / dur, 2) * amp;
  return [noise((t - t0) * freq, seed) * k, noise((t - t0) * freq, seed + 7) * k];
}

export function quadBezier(p0, p1, p2, u) {
  const a = 1 - u;
  return [
    a * a * p0[0] + 2 * a * u * p1[0] + u * u * p2[0],
    a * a * p0[1] + 2 * a * u * p1[1] + u * u * p2[1],
  ];
}

export function cubicBezierPoint(p0, p1, p2, p3, u) {
  const a = 1 - u;
  const b0 = a * a * a,
    b1 = 3 * a * a * u,
    b2 = 3 * a * u * u,
    b3 = u * u * u;
  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
  ];
}
