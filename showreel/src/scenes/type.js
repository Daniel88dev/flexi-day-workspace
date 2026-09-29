import { C, FONT } from "../palette.js";
import { el, box, set, show, measure, baseline } from "../dom.js";
import * as A from "../anim.js";
import { CUE } from "../timeline.js";
import { irisGeometry } from "./balance.js";

// 7.7 – 11.0s: an iris opens out of the balance ring onto paper, and the tagline assembles word by
// word, each with its own move. The period is a dot that drops, and the camera dives into it.

export const DOT_END = 124;
const F1 = 150,
  F2 = 206;
const B1 = 470,
  B2 = 694;
const D0 = 30;
const SANS = `800 ${F1}px ${FONT.display}`;
const SERIF = `italic 400 ${F2}px ${FONT.serif}`;
const LS1 = "-0.045em";

let root, cam, iris, words, dot, dotRing, layout;

function wordBlock(parent, text, font, color, x, base, ls, clip) {
  const size = parseFloat(font.match(/(\d+)px/)[1]);
  const b = baseline(font, "1");
  const padX = size * 0.3;
  const top = base - size * 1.05;
  const { w } = measure(text, font, ls);
  const wrap = box(parent, {
    x: x - padX,
    y: top,
    w: w + padX * 2,
    h: size * 1.4,
    style: { overflow: clip ? "hidden" : "visible", whiteSpace: "pre" },
  });
  const inner = box(wrap, {
    x: padX,
    y: size * 1.05 - b,
    style: {
      font,
      color,
      lineHeight: "1",
      letterSpacing: ls,
      whiteSpace: "pre",
      transformOrigin: "0% 70%",
    },
  });
  const spans = [...text].map((ch) =>
    el(
      "span",
      {
        text: ch,
        style: { display: "inline-block", whiteSpace: "pre", transformOrigin: "50% 100%" },
      },
      inner
    )
  );
  return { wrap, inner, spans, x, w, size };
}

export function build(stage) {
  root = box(stage, { w: 1920, h: 1080, style: { overflow: "hidden", display: "none" } });
  box(root, { w: 1920, h: 1080, style: { background: C.paper } });
  cam = box(root, { w: 1920, h: 1080, style: { transformOrigin: "0 0" } });

  const sp = measure(" ", SANS, LS1).w;
  const wTime = measure("Time", SANS, LS1).w;
  const wOff = measure("off,", SANS, LS1).w;
  const wHandled = measure("handled", SANS, LS1).w;
  const wWith = measure("with", SANS, LS1).w;
  const wCare = measure("care", SERIF, "-0.01em").w;
  const L1 = wTime + sp + wOff + sp + wHandled;
  const L2 = wWith + sp * 0.9 + wCare + 8 + D0;
  const x1 = 960 - L1 / 2,
    x2 = 960 - L2 / 2;

  words = {
    time: wordBlock(cam, "Time", SANS, C.ink, x1, B1, LS1, true),
    off: wordBlock(cam, "off,", SANS, C.ink, x1 + wTime + sp, B1, LS1, true),
    handled: wordBlock(cam, "handled", SANS, C.ink, x1 + wTime + sp + wOff + sp, B1, LS1, false),
    with: wordBlock(cam, "with", SANS, C.ink, x2, B2, LS1, false),
    care: wordBlock(cam, "care", SERIF, C.primary, x2 + wWith + sp * 0.9, B2, "-0.01em", false),
  };
  const dotX = x2 + wWith + sp * 0.9 + wCare + 8 + D0 / 2;
  layout = {
    time: [x1 + wTime / 2, B1 - F1 * 0.36],
    timeOff: [x1 + (wTime + sp + wOff) / 2, B1 - F1 * 0.36],
    line1: [960, B1 - F1 * 0.36],
    both: [960, (B1 + B2) / 2 - F1 * 0.3],
    dot: [dotX, B2 - D0 / 2],
  };

  dotRing = box(cam, {
    w: 10,
    h: 10,
    style: { borderRadius: "50%", border: `3px solid ${C.primary}`, display: "none" },
  });
  dot = box(cam, {
    w: D0,
    h: D0,
    style: { borderRadius: "50%", background: C.primary, transformOrigin: "50% 100%" },
  });

  iris = box(stage, {
    w: 10,
    h: 10,
    style: {
      borderRadius: "50%",
      background: `linear-gradient(45deg, oklch(0.78 0.12 300), ${C.primaryDark})`,
      display: "none",
      pointerEvents: "none",
    },
  });
}

function camera(t) {
  const L = layout;
  const keys = [
    [7.6, L.time, A.linear],
    [8.34, L.time, A.glide],
    [8.72, L.timeOff, A.linear],
    [8.86, L.timeOff, A.glide],
    [9.24, L.line1, A.linear],
    [9.4, L.line1, A.glide],
    [9.84, L.both, A.linear],
    [CUE.pushDot[0], L.both, A.glide],
    [CUE.pushDot[1], L.dot],
  ];
  const F = A.kf(t, keys);
  const baseS = A.kf(t, [
    [7.6, 1.75, A.outCubic],
    [8.3, 1.55, A.glide],
    [8.72, 1.28, A.linear],
    [8.86, 1.28, A.glide],
    [9.24, 1.05, A.linear],
    [9.4, 1.05, A.glide],
    [9.84, 0.97, A.inOutSine],
    [CUE.pushDot[0], 1.0],
  ]);
  const pushP = A.tw(t, CUE.pushDot[0], CUE.pushDot[1], A.inCubic);
  const S = baseS * Math.pow(DOT_END / D0 / 1.0, pushP);
  return { F, S };
}

export function render(t) {
  const active = t >= CUE.iris[0] && t < CUE.pushDot[1] + 0.001;
  show(root, active);
  show(iris, false);
  if (!active) return;

  // Iris: paper opens inside the balance ring, the ring itself grows past the frame.
  const ip = A.tw(t, CUE.iris[0], CUE.iris[1], A.inCubic);
  if (ip < 1) {
    const g = irisGeometry(t);
    const r0 = g.r - g.sw / 2;
    const R = A.lerp(r0, 1250, ip);
    const sw = g.sw * (1 + ip * 5);
    set(root, "clipPath", `circle(${R}px at ${g.cx}px ${g.cy}px)`);
    show(iris, true);
    const d = 2 * (R + sw);
    set(iris, "width", `${d}px`);
    set(iris, "height", `${d}px`);
    set(
      iris,
      "maskImage",
      `radial-gradient(circle closest-side, transparent ${R - 0.5}px, black ${R + 0.5}px)`
    );
    set(iris, "transform", `translate(${g.cx - d / 2}px, ${g.cy - d / 2}px)`);
  } else {
    set(root, "clipPath", "none");
  }

  const { F, S } = camera(t);
  set(cam, "transform", `translate(960px, 540px) scale(${S}) translate(${-F[0]}px, ${-F[1]}px)`);

  const W = CUE.words;
  // "Time": letters rise out of the baseline, tipping upright.
  words.time.spans.forEach((s, i) => {
    const p = A.tw(t, W.time + i * 0.045, W.time + 0.5 + i * 0.045, A.snap);
    set(s, "transform", `translateY(${(1 - p) * 110}%) rotate(${(1 - p) * 14}deg)`);
  });
  // "off,": letters drop in from above and bounce.
  words.off.spans.forEach((s, i) => {
    const p = A.spring(t - W.off - i * 0.05, 2.5, 0.42);
    set(s, "transform", `translateY(${(1 - p) * -118}%)`);
  });
  // "handled": whips in from the right, stretched by its speed, and squashes to a stop.
  {
    const p = A.tw(t, W.handled - 0.02, W.handled + 0.4, A.snap);
    const v = (A.tw(t + 0.01, W.handled - 0.02, W.handled + 0.4, A.snap) - p) * 100;
    const settle = A.wobble(t - W.handled - 0.2, 2.8, 7) * 0.12;
    const stretch = 1 + Math.min(v * 0.9, 0.9) - settle;
    set(
      words.handled.inner,
      "transform",
      `translateX(${(1 - p) * 900}px) scaleX(${stretch}) skewX(${-v * 9}deg)`
    );
    set(words.handled.inner, "opacity", A.tw(t, W.handled - 0.02, W.handled + 0.06));
  }
  // "with": a focus pull.
  {
    const p = A.tw(t, W.with, W.with + 0.34, A.outCubic);
    set(words.with.inner, "transform", `scale(${A.lerp(1.35, 1, p)})`);
    set(words.with.inner, "filter", p < 1 ? `blur(${(1 - p) * 18}px)` : "none");
    set(words.with.inner, "opacity", p);
    set(words.with.inner, "transformOrigin", "50% 60%");
  }
  // "care": written left to right behind a soft mask.
  {
    const p = A.tw(t, W.care, W.care + 0.46, A.inOutCubic);
    const edge = A.lerp(-14, 100, p);
    const m = `linear-gradient(90deg, black ${edge}%, transparent ${edge + 14}%)`;
    set(words.care.inner, "maskImage", m);
    set(
      words.care.inner,
      "transform",
      `translateY(${(1 - A.tw(t, W.care, W.care + 0.5, A.snap)) * 22}px)`
    );
  }

  // The period drops like the very first dot, squashes, and settles.
  const [dx, dyEnd] = layout.dot;
  const fall = A.tw(t, CUE.periodDrop[0], CUE.periodDrop[1], A.inQuad);
  const dy = A.lerp(dyEnd - 420, dyEnd, fall);
  let sx, sy;
  if (t < CUE.periodDrop[1]) {
    sy = 1 + 0.5 * fall * fall;
    sx = 1 / Math.sqrt(sy);
  } else {
    const q =
      0.4 *
      Math.exp(-8 * (t - CUE.periodDrop[1])) *
      Math.cos(2 * Math.PI * 3.3 * (t - CUE.periodDrop[1]));
    sx = 1 + q;
    sy = 1 - q * 0.9;
  }
  show(dot, t >= CUE.periodDrop[0]);
  set(dot, "transform", `translate(${dx - D0 / 2}px, ${dy - D0 / 2}px) scale(${sx}, ${sy})`);
  const rp = A.tw(t, CUE.periodDrop[1], CUE.periodDrop[1] + 0.5, A.outExpo);
  show(dotRing, t >= CUE.periodDrop[1] && rp < 1);
  const rd = D0 + rp * 150;
  set(dotRing, "width", `${rd}px`);
  set(dotRing, "height", `${rd}px`);
  set(dotRing, "transform", `translate(${dx - rd / 2}px, ${dyEnd - rd / 2}px)`);
  set(dotRing, "opacity", 1 - rp);

  // Everything but the dot fades as the camera dives in.
  const fade = 1 - A.tw(t, CUE.pushDot[0] + 0.2, CUE.pushDot[1] - 0.04, A.inQuad);
  for (const w of Object.values(words)) set(w.wrap, "opacity", fade);
}
