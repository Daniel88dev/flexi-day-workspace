import { C, TEAM, FONT } from "../palette.js";
import { el, box, set, show } from "../dom.js";
import * as A from "../anim.js";
import { CUE, BARS } from "../timeline.js";

// 0.0 – 4.0s: a dot falls, blooms into the logo mark, bursts into June's calendar, the theme
// wipes from night to paper, the team's time off sweeps in, and the camera dives into
// Marco's pending request.

const TW = 166,
  TH = 126,
  G = 12;
const GX = 343,
  GY = 253;
const CARD = { x: 303, y: 109, w: 1314, h: 862 };
const CX = 960,
  CY = 540;
const LANE_Y = 38,
  LANE_H = 24,
  LANE_GAP = 4;
const TODAY = { r: 2, c: 3 };
const TYPE_COLOR = { vacation: C.vacation, home: C.home, sick: C.sick, pto: C.pto, bank: C.bank };

const cellX = (c) => GX + c * (TW + G);
const cellY = (r) => GY + r * (TH + G);

const MARK = 190;
const DOT = MARK * 0.52;
const DATE_DOT = 30;

const DIVE = BARS.find((b) => b.dive);
const barRect = (b) => ({
  x: cellX(b.c0) + 8,
  y: cellY(b.r) + LANE_Y + b.lane * (LANE_H + LANE_GAP),
  w: (b.c1 - b.c0 + 1) * (TW + G) - G - 16,
  h: LANE_H,
});
const DIVE_RECT = barRect(DIVE);
const DIVE_F = [DIVE_RECT.x + DIVE_RECT.w / 2, DIVE_RECT.y + DIVE_RECT.h / 2];

let root, darkWorld, lightWorld, dotWorld, lightLayer, wipeRing, glow, diveFill;
let heroDot, heroNum, markOuter, rings;
const tiles = [];
const bars = [];
let card, title, subtitle, weekdays, legend, caption;

function tileSpec(i) {
  const r = Math.floor(i / 7),
    c = i % 7;
  const day = i + 1;
  const jul = day > 30;
  const tx = cellX(c) + TW / 2,
    ty = cellY(r) + TH / 2;
  return {
    i,
    r,
    c,
    day: jul ? day - 30 : day,
    jul,
    weekend: c >= 5,
    today: r === TODAY.r && c === TODAY.c,
    tx,
    ty,
  };
}

function makeTile(parent, spec, dark) {
  const node = box(parent, {
    w: 24,
    h: 24,
    style: { transformOrigin: "50% 50%", borderRadius: "12px", overflow: "hidden" },
  });
  const num = box(node, {
    x: 14,
    y: 11,
    text: String(spec.day),
    style: {
      font: `600 17px ${FONT.sans}`,
      color: dark ? C.charMuted : spec.weekend || spec.jul ? C.inkFaint : C.inkMuted,
      whiteSpace: "nowrap",
    },
  });
  let back = null;
  if (!dark && spec.r === 0 && spec.c === 0) {
    back = box(node, {
      x: 0,
      y: 0,
      w: TW,
      h: TH,
      style: { background: C.bank, borderRadius: "18px", display: "none" },
    });
    box(back, {
      x: 14,
      y: 11,
      text: "1",
      style: { font: `700 17px ${FONT.sans}`, color: "white" },
    });
    box(back, {
      x: 14,
      y: 84,
      text: "Bank holiday",
      style: { font: `700 15px ${FONT.sans}`, color: "white", letterSpacing: "0.01em" },
    });
    // Little pennant, drawn rather than an emoji so it renders identically everywhere.
    box(back, {
      x: 126,
      y: 14,
      html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2.5 4L16 12H5"/></svg>`,
    });
  }
  return { node, num, back, spec };
}

function makeBar(parent, b) {
  const r = barRect(b);
  const color = TYPE_COLOR[b.type];
  const node = box(parent, {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    style: {
      borderRadius: `${r.h / 2}px`,
      background: color,
      overflow: "hidden",
      transformOrigin: "0% 50%",
      boxShadow: "0 6px 14px -6px oklch(0.3 0.05 285 / 0.45)",
    },
  });
  let stripes = null;
  if (b.pending) {
    stripes = box(node, {
      x: 0,
      y: 0,
      w: r.w,
      h: r.h,
      style: {
        background: `repeating-linear-gradient(135deg, oklch(1 0 0 / 0) 0 7px, oklch(1 0 0 / 0.34) 7px 14px)`,
      },
    });
  }
  const label = box(node, {
    x: 32,
    y: 0,
    h: r.h,
    text: b.pending ? `${TEAM[b.who].first} · ${b.label}` : b.label,
    style: {
      font: `700 13.5px ${FONT.sans}`,
      color: "white",
      lineHeight: `${r.h}px`,
      whiteSpace: "nowrap",
      letterSpacing: "0.01em",
    },
  });
  const p = TEAM[b.who];
  const av = box(parent, {
    x: r.x - 1,
    y: r.y - 1,
    w: r.h + 2,
    h: r.h + 2,
    text: p.initials,
    style: {
      borderRadius: "50%",
      background: p.av,
      color: "white",
      font: `800 10px ${FONT.sans}`,
      display: "grid",
      placeItems: "center",
      boxShadow: `0 0 0 2px ${C.surface}, 0 2px 4px oklch(0 0 0 / 0.18)`,
      letterSpacing: "0.02em",
    },
  });
  return { b, r, node, stripes, label, av };
}

function lineMask(parent, x, y, h, inner) {
  const mask = box(parent, { x, y, h, style: { overflow: "hidden", whiteSpace: "nowrap" } });
  const content = el("div", { html: inner, style: { willChange: "transform" } }, mask);
  return { mask, content };
}

export function build(stage) {
  root = box(stage, { w: 1920, h: 1080, style: { overflow: "hidden" } });

  // Night side.
  box(root, { w: 1920, h: 1080, style: { background: C.char } });
  glow = box(root, {
    w: 1920,
    h: 1080,
    style: {
      background:
        "radial-gradient(760px 560px at 50% 50%, oklch(0.42 0.14 285 / 0.55), oklch(0.3 0.08 285 / 0) 70%)",
    },
  });
  const darkWrap = box(root, {
    w: 1920,
    h: 1080,
    style: { perspective: "2400px", perspectiveOrigin: "960px 540px" },
  });
  darkWorld = box(darkWrap, { w: 1920, h: 1080, style: { transformOrigin: "0 0" } });
  rings = [0, 1, 2].map(() =>
    box(darkWorld, {
      w: 10,
      h: 10,
      style: {
        borderRadius: "50%",
        border: `4px solid ${C.primaryDark}`,
        boxSizing: "border-box",
        opacity: 0,
      },
    })
  );
  markOuter = box(darkWorld, {
    w: MARK,
    h: MARK,
    style: { borderRadius: "50%", background: C.primaryDark, opacity: 0 },
  });

  // Paper side, revealed by a growing circle.
  lightLayer = box(root, { w: 1920, h: 1080 });
  box(lightLayer, { w: 1920, h: 1080, style: { background: C.paper } });
  const lightWrap = box(lightLayer, {
    w: 1920,
    h: 1080,
    style: { perspective: "2400px", perspectiveOrigin: "960px 540px" },
  });
  lightWorld = box(lightWrap, { w: 1920, h: 1080, style: { transformOrigin: "0 0" } });

  card = box(lightWorld, {
    style: {
      background: C.surface,
      borderRadius: "30px",
      boxShadow: `inset 0 0 0 1px ${C.border}, 0 50px 90px -30px oklch(0.3 0.04 288 / 0.3), 0 8px 24px -10px oklch(0.3 0.03 288 / 0.16)`,
    },
  });
  title = lineMask(
    lightWorld,
    GX,
    CARD.y + 34,
    54,
    `<span style="font:700 42px ${FONT.display};letter-spacing:-0.03em;color:${C.ink}">June 2026</span>`
  );
  subtitle = lineMask(
    lightWorld,
    GX + 2,
    CARD.y + 84,
    24,
    `<span style="font:500 17px ${FONT.sans};color:${C.inkFaint}">Northwind · 10 teammates</span>`
  );
  weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, c) =>
    box(lightWorld, {
      x: cellX(c),
      y: GY - 34,
      w: TW,
      text: d.toUpperCase(),
      style: {
        font: `700 13px ${FONT.sans}`,
        letterSpacing: "0.12em",
        color: c >= 5 ? C.inkFaint : C.inkMuted,
        textAlign: "center",
      },
    })
  );
  const legendItems = [
    ["Vacation", C.vacation],
    ["Home office", C.home],
    ["Sick", C.sick],
    ["PTO", C.pto],
    ["Bank holiday", C.bank],
  ];
  const legendRow = box(lightWorld, {
    x: CARD.x + 420,
    y: CARD.y + 44,
    w: CARD.w - 460,
    h: 34,
    style: { display: "flex", justifyContent: "flex-end", gap: "8px" },
  });
  legend = legendItems.map(([label, color]) =>
    el(
      "div",
      {
        html: `<span style="width:10px;height:10px;border-radius:50%;background:${color};flex:none"></span>${label}`,
        style: {
          height: "34px",
          borderRadius: "999px",
          background: C.surface2,
          boxShadow: `inset 0 0 0 1px ${C.border}`,
          font: `600 14px ${FONT.sans}`,
          color: C.inkMuted,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 14px",
          whiteSpace: "nowrap",
        },
      },
      legendRow
    )
  );

  for (let i = 0; i < 35; i++) {
    const spec = tileSpec(i);
    tiles.push({
      spec,
      dark: makeTile(darkWorld, spec, true),
      light: makeTile(lightWorld, spec, false),
    });
  }
  for (const b of BARS) bars.push(makeBar(lightWorld, b));

  wipeRing = box(root, {
    w: 10,
    h: 10,
    style: {
      borderRadius: "50%",
      border: `5px solid ${C.primary}`,
      boxSizing: "border-box",
      opacity: 0,
    },
  });

  // The hero dot rides above both themes so the wipe never cuts it.
  const dotWrap = box(root, {
    w: 1920,
    h: 1080,
    style: { perspective: "2400px", perspectiveOrigin: "960px 540px" },
  });
  dotWorld = box(dotWrap, { w: 1920, h: 1080, style: { transformOrigin: "0 0" } });
  heroDot = box(dotWorld, {
    w: DOT,
    h: DOT,
    style: { borderRadius: "50%", background: C.primaryDark, transformOrigin: "50% 50%" },
  });
  heroNum = box(heroDot, {
    w: DOT,
    h: DOT,
    text: "18",
    style: {
      display: "grid",
      placeItems: "center",
      font: `700 15px ${FONT.sans}`,
      color: "white",
      opacity: 0,
    },
  });

  caption = [
    lineMask(
      root,
      128,
      96,
      132,
      `<span style="font:800 112px ${FONT.display};letter-spacing:-0.04em;color:${C.ink}">Who’s in.</span>`
    ),
    lineMask(
      root,
      128,
      214,
      150,
      `<span style="font:800 112px ${FONT.display};letter-spacing:-0.04em;color:${C.ink}">Who’s </span><span style="font:italic 400 132px ${FONT.serif};letter-spacing:-0.01em;color:${C.primary}">away.</span>`
    ),
  ];

  diveFill = box(root, { style: { background: C.vacation, opacity: 0 } });
}

// Camera: world point F lands on screen point (CX + T[0], CY + T[1]).
function camera(t) {
  let s, rx, rz, T, F;
  if (t < 2.0) {
    s = A.kf(t, [
      [0, 1.2, A.linear],
      [1.0, 1.14, A.glide],
      [1.95, 1.0],
    ]);
    rz = A.kf(t, [
      [0, 0, A.linear],
      [1.0, -5, A.glide],
      [1.95, 0],
    ]);
    rx = 0;
    T = [0, 0];
    F = [CX, CY];
  } else if (t < CUE.dive[0]) {
    const p = A.tw(t, 2.0, 2.8, A.glide);
    const d = A.tw(t, 2.8, CUE.dive[0], A.inOutSine);
    const back = A.tw(t, CUE.diveAnticipate, CUE.dive[0], A.outQuad);
    s = A.lerp(1, 0.84, p) + 0.04 * d - 0.035 * back;
    rx = A.lerp(0, 30, p) - 2 * d;
    rz = A.lerp(0, -15, p) - 2.5 * d;
    T = [A.lerp(0, 160, p) - 25 * d, A.lerp(0, 60, p) - 22 * d];
    F = [CX, CY];
  } else {
    const p = A.tw(t, CUE.dive[0], 3.86, A.glide);
    const z1 = A.tw(t, CUE.dive[0], 3.86, A.inCubic);
    const z2 = A.tw(t, 3.86, CUE.dive[1], A.inQuad);
    s = A.lerp(0.845, 2.8, z1) * Math.pow(3.6, z2);
    rx = A.lerp(28, 0, p);
    rz = A.lerp(-17.5, 0, p);
    T = [A.lerp(135, 0, p), A.lerp(38, 0, p)];
    F = [A.lerp(CX, DIVE_F[0], p), A.lerp(CY, DIVE_F[1], p)];
  }
  const [sx, sy] = A.shake(t, CUE.dotLand, 9, 0.32, 30, 3);
  return {
    s,
    F,
    css: `translate(${CX + T[0] + sx}px, ${CY + T[1] + sy}px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${s}) translate(${-F[0]}px, ${-F[1]}px)`,
  };
}

// Burst choreography, computed once: nearest tiles launch first, everything swirls clockwise.
export const flights = (() => {
  const specs = Array.from({ length: 35 }, (_, i) => tileSpec(i));
  const dists = specs.map((s) => Math.hypot(s.tx - CX, s.ty - CY));
  const maxD = Math.max(...dists);
  const order = specs.map((_, i) => i).sort((a, b) => dists[a] - dists[b]);
  const out = [];
  order.forEach((i, rank) => {
    const s = specs[i];
    const ang = Math.atan2(s.ty - CY, s.tx - CX);
    const p0 = [CX + Math.cos(ang) * MARK * 0.46, CY + Math.sin(ang) * MARK * 0.46];
    const p2 = [s.tx, s.ty];
    const mid = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
    const perp = [-(p2[1] - p0[1]) / (len || 1), (p2[0] - p0[0]) / (len || 1)];
    const p1 = [mid[0] + perp[0] * len * 0.28, mid[1] + perp[1] * len * 0.28];
    const start = CUE.burst + 0.008 * rank;
    const dur = 0.3 + 0.2 * (dists[i] / maxD);
    out[i] = { p0, p1, p2, start, dur, morph: start + dur * 0.5 };
  });
  return out;
})();

function flightPos(fl, t) {
  const u = A.snap(A.clamp((t - fl.start) / fl.dur));
  return A.quadBezier(fl.p0, fl.p1, fl.p2, u);
}

function renderTile(tile, face, t, dark) {
  const { spec } = tile;
  const fl = flights[spec.i];
  const node = face.node;
  if (t < fl.start) {
    show(node, false);
    return;
  }
  show(node, true);
  const [x, y] = flightPos(fl, t);
  const [x2, y2] = flightPos(fl, t + 1 / 240);
  const speed = Math.hypot(x2 - x, y2 - y) * 240;
  const ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
  const m = A.spring(t - fl.morph, 2.6, 0.62);
  const stretch = 1 + Math.min(speed / 2600, 1.4) * (1 - A.clamp(m * 1.4));
  const w = A.lerp(24, TW, m),
    h = A.lerp(24, TH, m);
  const radius = A.lerp(12, 18, A.clamp(m));
  set(node, "width", `${w}px`);
  set(node, "height", `${h}px`);
  set(node, "borderRadius", `${radius}px`);

  let flip = 0;
  if (!dark && face.back) flip = A.clamp(A.spring(t - CUE.bankFlip, 1.7, 0.72), 0, 1.08) * 180;
  const flipCss = flip ? ` perspective(700px) rotateY(${flip > 90 ? flip - 180 : flip}deg)` : "";
  set(
    node,
    "transform",
    `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${ang * (1 - A.clamp(m))}deg) scale(${stretch}, ${1 / Math.sqrt(stretch)})${flipCss}`
  );
  if (face.back) show(face.back, flip > 90);

  const cp = A.tw(t, fl.morph, fl.morph + 0.28, A.outQuad);
  const base = dark
    ? C.charSurface2
    : spec.weekend
      ? C.paperTint
      : spec.jul
        ? C.surface2
        : C.surface;
  const dotColor = dark ? C.primaryDark : C.primary;
  set(
    node,
    "background",
    `color-mix(in oklch, ${dotColor} ${Math.round((1 - cp) * 100)}%, ${base})`
  );
  const ring = spec.today
    ? `inset 0 0 0 ${2.5 * cp}px ${dark ? C.primaryDark : C.primary}`
    : `inset 0 0 0 1px ${dark ? `oklch(0.36 0.018 288 / ${cp})` : `oklch(0.915 0.01 80 / ${cp})`}`;
  set(node, "boxShadow", dark ? ring : `${ring}, 0 1px 2px oklch(0.3 0.02 288 / ${0.06 * cp})`);
  set(node, "opacity", spec.jul ? A.lerp(1, 0.55, cp) : 1);

  const np = A.tw(t, fl.morph + 0.14, fl.morph + 0.36, A.outCubic);
  set(face.num, "opacity", spec.today ? 0 : np);
  set(face.num, "transform", `translateY(${(1 - np) * 8}px)`);
}

function renderBar(bar, t) {
  const { b, r, node, stripes, label, av } = bar;
  const s = b.at;
  if (t < s) {
    show(node, false);
    show(av, false);
    return;
  }
  show(node, true);
  show(av, true);
  const ap = A.spring(t - s, 3.2, 0.48);
  set(av, "transform", `scale(${ap}) rotate(${(1 - A.clamp(ap)) * -40}deg)`);
  const wp = A.snap(A.tw(t, s + 0.03, s + 0.55));
  const w = A.lerp(LANE_H, r.w, wp);
  set(node, "width", `${w}px`);
  set(node, "opacity", A.tw(t, s, s + 0.05));
  const lp = A.tw(t, s + 0.14, s + 0.36, A.outCubic);
  set(label, "opacity", lp);
  set(label, "transform", `translateX(${(1 - lp) * -10}px)`);

  if (b.dive) {
    const pulse = A.wobble(t - CUE.diveAnticipate, 2.4, 5) * 0.09;
    set(node, "transform", `scaleY(${1 + pulse * 2}) scaleX(${1 + pulse * 0.25})`);
    const g = A.tw(t, CUE.diveAnticipate, CUE.dive[0] + 0.1, A.outQuad);
    set(
      node,
      "boxShadow",
      `0 0 0 ${g * 7}px oklch(0.6 0.16 285 / ${0.22 * g}), 0 6px 14px -6px oklch(0.3 0.05 285 / 0.45)`
    );
  }
  if (stripes) set(stripes, "opacity", 1 - A.tw(t, CUE.diveAnticipate, CUE.dive[0] + 0.15));
}

export function render(t) {
  const active = t < CUE.drop + 0.02;
  show(root, active);
  if (!active) return;

  const cam = camera(t);
  set(darkWorld, "transform", cam.css);
  set(lightWorld, "transform", cam.css);
  set(dotWorld, "transform", cam.css);

  // Wipe: paper grows out of the centre.
  const wp = A.tw(t, CUE.wipe[0], CUE.wipe[1], A.glide);
  const R = wp * 1180;
  set(lightLayer, "clipPath", `circle(${R}px at 960px 540px)`);
  show(lightLayer, wp > 0);
  const ringOn = wp > 0 && wp < 1;
  show(wipeRing, ringOn);
  if (ringOn) {
    const d = 2 * R + 10;
    set(wipeRing, "width", `${d}px`);
    set(wipeRing, "height", `${d}px`);
    set(wipeRing, "transform", `translate(${960 - d / 2}px, ${540 - d / 2}px)`);
    set(wipeRing, "opacity", 1 - wp * 0.6);
    set(wipeRing, "borderWidth", `${A.lerp(3, 9, wp)}px`);
  }

  set(
    glow,
    "opacity",
    (0.25 + 0.75 * A.tw(t, CUE.dotLand - 0.02, CUE.dotLand + 0.25, A.outCubic)) *
      (1 - A.tw(t, 1.0, 1.6))
  );

  // Hero dot: fall, squash, bloom, then shrink into today's date marker.
  const fall = A.tw(t, CUE.dotFall[0], CUE.dotFall[1], A.inQuad);
  let dy = A.lerp(70, CY, fall);
  let sxd, syd;
  if (t < CUE.dotLand) {
    const v = A.clamp((t - CUE.dotFall[0]) / (CUE.dotFall[1] - CUE.dotFall[0]));
    const st = 1 + 0.55 * v * v;
    sxd = 1 / Math.sqrt(st);
    syd = st;
  } else {
    const q =
      0.42 * Math.exp(-7.5 * (t - CUE.dotLand)) * Math.cos(2 * Math.PI * 3.1 * (t - CUE.dotLand));
    sxd = 1 + q;
    syd = 1 - q * 0.9;
  }
  const target = [cellX(TODAY.c) + 10 + DATE_DOT / 2, cellY(TODAY.r) + 10 + DATE_DOT / 2];
  const hp = A.tw(t, CUE.burst + 0.02, CUE.burst + 0.5, A.glide);
  const hx = A.lerp(CX, target[0], hp);
  const hy = A.lerp(dy, target[1], hp);
  const hd = A.lerp(DOT, DATE_DOT, hp);
  const hs = 1 + 0.14 * A.wobble(t - CUE.burst, 3, 7);
  show(heroDot, t >= CUE.dotFall[0]);
  set(heroDot, "width", `${hd}px`);
  set(heroDot, "height", `${hd}px`);
  set(heroNum, "width", `${hd}px`);
  set(heroNum, "height", `${hd}px`);
  set(
    heroDot,
    "transform",
    `translate(${hx - hd / 2}px, ${hy - hd / 2}px) translateY(${(hd / 2) * (1 - syd)}px) scale(${sxd * hs}, ${syd * hs})`
  );
  const lightDot = A.tw(t, 1.5, 1.8);
  set(
    heroDot,
    "background",
    `color-mix(in oklch, ${C.primary} ${Math.round(lightDot * 100)}%, ${C.primaryDark})`
  );
  // Logo ring: a gap in the background colour, then a thin violet line (as in components/brand/logo.tsx).
  const ringIn = A.spring(t - CUE.dotLand - 0.04, 2.4, 0.55);
  const ringOut = A.tw(t, CUE.burst, CUE.burst + 0.16);
  const gap = MARK * 0.068 * A.clamp(ringIn) * (1 - ringOut);
  const line = MARK * 0.027 * A.clamp(ringIn) * (1 - ringOut);
  set(
    heroDot,
    "boxShadow",
    gap > 0.05 ? `0 0 0 ${gap}px ${C.char}, 0 0 0 ${gap + line}px ${C.primaryDark}` : "none"
  );
  set(heroNum, "opacity", A.tw(t, CUE.burst + 0.36, CUE.burst + 0.52));

  // Soft outer disc of the mark.
  const mo = A.spring(t - CUE.dotLand - 0.02, 2.0, 0.5);
  const burstP = A.tw(t, CUE.burst, CUE.burst + 0.22, A.outCubic);
  set(
    markOuter,
    "transform",
    `translate(${CX - MARK / 2}px, ${CY - MARK / 2}px) scale(${mo * (1 + burstP * 0.5)})`
  );
  set(markOuter, "opacity", 0.18 * A.clamp(mo) * (1 - burstP));

  // Shockwaves.
  const waves = [
    [CUE.dotLand, 0.75, 760],
    [CUE.dotLand + 0.09, 0.8, 520],
    [CUE.burst, 0.6, 900],
  ];
  waves.forEach(([t0, dur, maxR], i) => {
    const p = A.tw(t, t0, t0 + dur, A.outExpo);
    const on = t >= t0 && p < 1;
    show(rings[i], on);
    if (!on) return;
    const d = A.lerp(DOT * 0.9, maxR * 2, p);
    set(rings[i], "width", `${d}px`);
    set(rings[i], "height", `${d}px`);
    set(rings[i], "transform", `translate(${CX - d / 2}px, ${CY - d / 2}px)`);
    set(rings[i], "borderWidth", `${A.lerp(6, 0.6, p)}px`);
    set(rings[i], "opacity", (1 - p) * (i === 1 ? 0.5 : 0.9));
  });

  show(darkWorld, wp < 1);
  for (const tile of tiles) {
    if (wp < 1) renderTile(tile, tile.dark, t, true);
    if (wp > 0) renderTile(tile, tile.light, t, false);
  }

  // Card and header.
  const cp = A.tw(t, 1.52, 2.0, A.snap);
  const gx0 = GX - 10,
    gy0 = GY - 10,
    gw0 = 7 * TW + 6 * G + 20,
    gh0 = 5 * TH + 4 * G + 20;
  set(card, "left", `${A.lerp(gx0, CARD.x, cp)}px`);
  set(card, "top", `${A.lerp(gy0, CARD.y, cp)}px`);
  set(card, "width", `${A.lerp(gw0, CARD.w, cp)}px`);
  set(card, "height", `${A.lerp(gh0, CARD.h, cp)}px`);
  set(card, "opacity", A.tw(t, 1.5, 1.7));
  const tp = A.tw(t, 1.66, 2.1, A.snap);
  set(title.content, "transform", `translateY(${(1 - tp) * 110}%)`);
  const sp = A.tw(t, 1.76, 2.2, A.snap);
  set(subtitle.content, "transform", `translateY(${(1 - sp) * 110}%)`);
  weekdays.forEach((w, c) => {
    const p = A.tw(t, 1.7 + c * 0.03, 2.05 + c * 0.03, A.snap);
    set(w, "opacity", p);
    set(w, "transform", `translateY(${(1 - p) * 12}px)`);
  });
  legend.forEach((chip, i) => {
    const p = A.spring(t - 1.86 - i * 0.05, 2.8, 0.6);
    set(chip, "opacity", A.clamp(p * 2));
    set(chip, "transform", `scale(${A.lerp(0.6, 1, p)})`);
  });

  for (const bar of bars) renderBar(bar, t);

  // Caption rides in screen space, top-left, while the card leans away.
  caption.forEach((line, i) => {
    const inP = A.tw(t, CUE.captionIn + i * 0.12, CUE.captionIn + 0.55 + i * 0.12, A.snap);
    const outP = A.tw(t, 3.42 + i * 0.05, 3.62 + i * 0.05, A.inCubic);
    set(line.content, "transform", `translateY(${(1 - inP) * 105 - outP * 105}%)`);
    show(line.mask, t > CUE.captionIn - 0.05);
  });

  // Dive: the violet bar swallows the frame.
  const dp = A.tw(t, 3.86, CUE.dive[1] - 0.01, A.inOutQuad);
  show(diveFill, t >= 3.86);
  if (t >= 3.86) {
    const s = cam.s;
    const top = CY + s * (DIVE_RECT.y - cam.F[1]);
    const bottom = CY + s * (DIVE_RECT.y + DIVE_RECT.h - cam.F[1]);
    const left = CX + s * (DIVE_RECT.x - cam.F[0]);
    const right = CX + s * (DIVE_RECT.x + DIVE_RECT.w - cam.F[0]);
    const l = A.lerp(left, -20, dp),
      r = A.lerp(right, 1940, dp),
      tp2 = A.lerp(top, -20, dp),
      bt = A.lerp(bottom, 1100, dp);
    set(diveFill, "left", `${l}px`);
    set(diveFill, "top", `${tp2}px`);
    set(diveFill, "width", `${r - l}px`);
    set(diveFill, "height", `${bt - tp2}px`);
    set(diveFill, "borderRadius", `${A.lerp((LANE_H / 2) * s, 0, dp)}px`);
    set(diveFill, "opacity", 1);
  }
}
