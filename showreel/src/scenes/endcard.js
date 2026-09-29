import { C, FONT } from "../palette.js";
import { box, set, show, measure, baseline } from "../dom.js";
import * as A from "../anim.js";
import { CUE, WEEKDAYS } from "../timeline.js";
import { DOT_END } from "./type.js";

// 11.0 – 15.0s: the dot gets its ring back, a reel of weekdays spins in front of "day" and
// clunks onto "flexi". Tagline, URL, a glint, and a long, calm hold.

const FS = 176;
const WM = `700 ${FS}px ${FONT.display}`;
const LS = "-0.03em";
const MARK = DOT_END / 0.52;
const GAP = (MARK * 10) / 26;
// logo.tsx draws the ring in fixed pixels, so it stays a hairline at any size. Keep it light here too.
const RING_GAP = MARK * 0.068;
const RING_LINE = MARK * 0.027;
const LY = 462;
const REEL = [...WEEKDAYS, "flexi"];
const STEP = FS * 1.22;
const THETA = 0.9;
const DRUM_R = STEP / Math.sin(THETA);

let root, lockup, blobs, markOuter, markDot, reelWrap, reelWords, dayWord, shine, tagline, url;
let rings, bursts, geo;

// The reel snaps onto word i at TICKS[i]; the last snap is the landing.
const TICKS = [...CUE.ticks, CUE.land];

function reelPos(t) {
  let p = -1;
  for (let i = 0; i < TICKS.length; i++) {
    const last = i === TICKS.length - 1;
    const prev = TICKS[i - 1] ?? TICKS[i] - 0.25;
    const dur = last ? 0.16 : Math.min(0.1, (TICKS[i] - prev) * 0.85);
    const start = TICKS[i] - dur * 0.7;
    if (t >= start)
      p = i - 1 + (last ? A.outBack(2.4) : A.outBack(1.3))(A.clamp((t - start) / dur));
  }
  return p;
}

function prefixWidth(p) {
  if (p <= -1) return 0;
  const i = Math.floor(p);
  const w = (k) => (k < 0 ? 0 : geo.widths[Math.min(k, REEL.length - 1)]);
  return A.lerp(w(i), w(i + 1), A.clamp(p - i));
}

// Centred layout for the current reel position: a longer word pushes the mark left and "day"
// right by the same amount, so the lockup breathes around the centre and never overlaps.
function layoutAt(t) {
  const w = prefixWidth(reelPos(t));
  const markX = 960 - (MARK + GAP + w + geo.wDay) / 2 + MARK / 2;
  return { markX, dayX: markX + MARK / 2 + GAP + w };
}

export function build(stage) {
  root = box(stage, { w: 1920, h: 1080, style: { overflow: "hidden", display: "none" } });
  box(root, { w: 1920, h: 1080, style: { background: C.paper } });
  blobs = [
    [260, 180, 760, "oklch(0.75 0.12 285 / 0.30)"],
    [1640, 880, 820, "oklch(0.8 0.1 158 / 0.22)"],
    [1700, 140, 620, "oklch(0.85 0.1 70 / 0.26)"],
    [240, 960, 600, "oklch(0.8 0.1 20 / 0.16)"],
  ].map(([x, y, r, c]) =>
    box(root, {
      x: x - r,
      y: y - r,
      w: r * 2,
      h: r * 2,
      style: { borderRadius: "50%", background: `radial-gradient(circle, ${c}, transparent 68%)` },
    })
  );

  lockup = box(root, { w: 1920, h: 1080, style: { transformOrigin: `960px ${LY + 80}px` } });

  const widths = REEL.map((w) => measure(w, WM, LS).w);
  const wDay = measure("day", WM, LS).w;
  const total = MARK + GAP + widths[REEL.length - 1] + wDay;
  const left = 960 - total / 2;
  const xDay = left + MARK + GAP + widths[REEL.length - 1];
  const b = baseline(WM, "1");
  const base = LY + FS * 0.25 + 4;
  geo = { widths, xDay, wDay, base };

  const winTop = base - FS * 0.98;
  reelWrap = box(lockup, {
    x: 0,
    y: winTop,
    w: xDay + 4,
    h: FS * 1.3,
    style: { overflow: "hidden" },
  });
  set(
    reelWrap,
    "maskImage",
    "linear-gradient(transparent 0%, black 16%, black 86%, transparent 100%)"
  );
  reelWords = REEL.map((word, i) =>
    box(reelWrap, {
      x: xDay - widths[i],
      y: base - winTop - b,
      text: word,
      style: {
        font: WM,
        letterSpacing: LS,
        lineHeight: "1",
        color: C.ink,
        whiteSpace: "pre",
        transformOrigin: `50% ${b - FS * 0.3}px`,
      },
    })
  );
  dayWord = box(lockup, {
    x: xDay,
    y: base - b,
    text: "day",
    style: { font: WM, letterSpacing: LS, lineHeight: "1", color: C.primary, whiteSpace: "pre" },
  });
  // Glint: the wordmark again, painted with a moving highlight clipped to the glyphs.
  shine = box(lockup, {
    x: xDay - widths[REEL.length - 1],
    y: base - b,
    text: "flexiday",
    style: {
      font: WM,
      letterSpacing: LS,
      lineHeight: "1",
      whiteSpace: "pre",
      color: "transparent",
      backgroundImage:
        "linear-gradient(100deg, transparent 40%, oklch(1 0 0 / 0.75) 50%, transparent 60%)",
      backgroundSize: "300% 100%",
      backgroundRepeat: "no-repeat",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      opacity: 0,
    },
  });

  rings = [0, 1].map(() =>
    box(lockup, {
      w: 10,
      h: 10,
      style: { borderRadius: "50%", border: `4px solid ${C.primary}`, display: "none" },
    })
  );
  bursts = Array.from({ length: 12 }, () =>
    box(lockup, {
      w: 6,
      h: 40,
      style: { borderRadius: "3px", background: C.primary, display: "none" },
    })
  );
  markOuter = box(lockup, {
    w: MARK,
    h: MARK,
    style: { borderRadius: "50%", background: C.primary },
  });
  markDot = box(lockup, {
    w: DOT_END,
    h: DOT_END,
    style: { borderRadius: "50%", background: C.primary },
  });

  tagline = box(lockup, {
    x: 0,
    y: base + 96,
    w: 1920,
    h: 70,
    html: `<div style="display:inline-block;white-space:nowrap"><span style="font:500 40px ${FONT.sans};color:${C.inkMuted};letter-spacing:-0.01em">Time off, handled with </span><span style="font:italic 400 50px ${FONT.serif};color:${C.primary}">care.</span></div>`,
    style: { textAlign: "center", overflow: "hidden" },
  });
  url = box(lockup, {
    x: 0,
    y: base + 200,
    w: 1920,
    html: `<span style="display:inline-flex;align-items:center;gap:12px;padding:14px 28px;border-radius:999px;background:${C.surface};box-shadow:inset 0 0 0 1.5px ${C.borderStrong}, 0 10px 30px -14px oklch(0.3 0.04 288 / 0.35);font:700 26px ${FONT.sans};color:${C.ink};letter-spacing:-0.01em"><span style="width:12px;height:12px;border-radius:50%;background:${C.primary}"></span>flexi-day.com</span>`,
    style: { textAlign: "center", transformOrigin: "50% 50%" },
  });
}

export function render(t) {
  const active = t >= CUE.markForm;
  show(root, active);
  if (!active) return;
  const lt = t - CUE.markForm;

  blobs.forEach((bl, i) => {
    const p = A.tw(lt, 0.1 + i * 0.1, 1.2 + i * 0.1, A.outCubic);
    set(bl, "opacity", p);
    set(
      bl,
      "transform",
      `translate(${Math.sin(t * 0.5 + i) * 40}px, ${Math.cos(t * 0.4 + i * 2) * 30}px) scale(${0.8 + 0.2 * p})`
    );
  });

  const land = t - CUE.land;
  const punch =
    1 + 0.045 * A.wobble(land, 2.2, 6.5) + 0.028 * A.tw(t, CUE.land + 0.2, 15, A.inOutSine);
  const [kx, ky] = A.shake(t, CUE.land, 7, 0.28, 30, 11);
  set(lockup, "transform", `translate(${kx}px, ${ky}px) scale(${punch})`);

  const lay = layoutAt(t);
  const form = A.tw(t, CUE.markForm + 0.02, CUE.markForm + 0.26, A.glide);
  const mx = A.lerp(960, lay.markX, form);
  const my = A.lerp(540, LY, form);
  const shift = lay.dayX - geo.xDay;
  const ringIn = A.clamp(A.spring(lt, 2.2, 0.55), 0, 1.25);
  set(
    markDot,
    "transform",
    `translate(${mx - DOT_END / 2}px, ${my - DOT_END / 2}px) scale(${1 + 0.1 * A.wobble(land, 3, 8)})`
  );
  set(
    markDot,
    "boxShadow",
    `0 0 0 ${RING_GAP * ringIn}px ${C.paper}, 0 0 0 ${(RING_GAP + RING_LINE) * ringIn}px ${C.primary}`
  );
  const outer = A.spring(lt - 0.04, 1.8, 0.5);
  set(markOuter, "transform", `translate(${mx - MARK / 2}px, ${my - MARK / 2}px) scale(${outer})`);
  set(markOuter, "opacity", 0.18 * A.clamp(outer));

  // Text slides out from behind the mark; the reel rides along with "day".
  const reveal = A.tw(lt, 0.05, 0.3, A.outCubic);
  set(reelWrap, "transform", `translateX(${shift}px)`);
  set(reelWrap, "clipPath", `inset(0 0 0 ${mx + MARK / 2 + 4 - shift}px)`);
  set(dayWord, "opacity", reveal);
  set(dayWord, "transform", `translateX(${shift + (1 - reveal) * -40}px)`);

  // Drum reel: words ride a cylinder and flatten as they turn away.
  const p = reelPos(t);
  reelWords.forEach((node, i) => {
    const a = (i - p) * THETA;
    const on = Math.abs(a) < Math.PI / 2 - 0.02;
    show(node, on);
    if (!on) return;
    set(node, "transform", `translateY(${DRUM_R * Math.sin(a)}px) scaleY(${Math.cos(a)})`);
    set(node, "opacity", Math.cos(a) ** 3);
  });

  // Landing: shockwaves and a crown of burst lines around the mark.
  [
    [CUE.markForm, 0.7, 520],
    [CUE.land, 0.8, 760],
  ].forEach(([t0, dur, maxR], i) => {
    const q = A.tw(t, t0, t0 + dur, A.outExpo);
    const on = t >= t0 && q < 1;
    show(rings[i], on);
    if (!on) return;
    const d = A.lerp(MARK * 0.9, maxR * 2, q);
    set(rings[i], "width", `${d}px`);
    set(rings[i], "height", `${d}px`);
    set(rings[i], "transform", `translate(${mx - d / 2}px, ${my - d / 2}px)`);
    set(rings[i], "borderWidth", `${A.lerp(6, 0.8, q)}px`);
    set(rings[i], "opacity", (1 - q) * 0.8);
  });
  const bp = A.tw(t, CUE.land, CUE.land + 0.42, A.outCubic);
  bursts.forEach((node, i) => {
    const on = t >= CUE.land && bp < 1;
    show(node, on);
    if (!on) return;
    const len = Math.max(0, 44 * (1 - bp) * Math.min(1, bp * 6));
    set(node, "height", `${len}px`);
    set(node, "transformOrigin", `3px ${len}px`);
    set(
      node,
      "transform",
      `translate(${mx - 3}px, ${my - len}px) rotate(${(i / bursts.length) * 360 + 15}deg) translateY(${-(MARK * 0.62 + bp * 70)}px)`
    );
  });

  const sp = A.tw(t, CUE.glint[0], CUE.glint[1], A.inOutCubic);
  set(shine, "opacity", sp > 0 && sp < 1 ? 1 : 0);
  set(shine, "backgroundPosition", `${A.lerp(120, -20, sp)}% 0`);

  const tp = A.tw(t, CUE.tagline, CUE.tagline + 0.6, A.snap);
  set(tagline.firstChild, "transform", `translateY(${(1 - tp) * 110}%)`);
  const us = A.spring(t - CUE.url, 2.0, 0.55);
  set(url, "transform", `translateY(${(1 - A.clamp(us)) * 24}px) scale(${A.lerp(0.85, 1, us)})`);
  set(url, "opacity", A.clamp(us * 1.8));
}
