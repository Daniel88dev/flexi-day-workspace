import { C, TEAM, FONT } from "../palette.js";
import { el, box, set, show, svg, attr } from "../dom.js";
import * as A from "../anim.js";
import { CUE, ODOMETER } from "../timeline.js";
import { whip, whipSpeed, setVblur, CHECK_PATH } from "./shared.js";

// 5.9 – 8.1s: the camera lands on the iPhone app in dark mode. The balance ring sweeps, the
// odometer rolls to 15, cards float around the phone in depth, then we push into the ring.

const PHONE = { cx: 1240, cy: 560, w: 420, h: 872 };
const SCR = { x: 11, y: 11, w: 398, h: 850 };
const RING = { cx: 14 + 185, cy: 156 + 186, r: 104, sw: 22 };
const RING_STAGE = [
  PHONE.cx - PHONE.w / 2 + SCR.x + RING.cx,
  PHONE.cy - PHONE.h / 2 + SCR.y + RING.cy,
];
const PUSH = [7.44, CUE.iris[0]];
const DIGIT_H = 84,
  DIGIT_W = 50;

let root,
  world,
  grid,
  glow,
  phoneWrap,
  phone,
  ringArc,
  ringWrap,
  onesStrip,
  tensStrip,
  tensCol,
  digits;
let caption, cards, rows, stats, header, ringLabel;

function lineMask(parent, x, y, h, html) {
  const mask = box(parent, {
    x,
    y,
    h,
    style: { overflow: "hidden", whiteSpace: "nowrap", paddingRight: "30px" },
  });
  const content = el("div", { html, style: { willChange: "transform" } }, mask);
  return { mask, content };
}

const ICONS = {
  signal: `<svg width="19" height="12" viewBox="0 0 19 12" fill="white"><rect x="0" y="8" width="3.2" height="4" rx="1"/><rect x="5" y="5.5" width="3.2" height="6.5" rx="1"/><rect x="10" y="3" width="3.2" height="9" rx="1"/><rect x="15" y="0" width="3.2" height="12" rx="1"/></svg>`,
  wifi: `<svg width="17" height="12" viewBox="0 0 17 12" fill="white"><path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.4l1.2-1.3C14 1.6 11.4.5 8.5.5S3 1.6 1 3.4l1.2 1.3c1.7-1.5 3.9-2.4 6.3-2.4zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3a7.4 7.4 0 0 0-9.8 0l1.2 1.3c1-.9 2.3-1.4 3.7-1.4zm0 3.6c.5 0 .9.2 1.2.5L8.5 11.5 7.3 10c.3-.3.7-.5 1.2-.5z"/></svg>`,
  battery: `<svg width="28" height="13" viewBox="0 0 28 13"><rect x="0.5" y="0.5" width="24" height="12" rx="3.5" fill="none" stroke="white" stroke-opacity="0.45"/><rect x="2" y="2" width="18" height="9" rx="2" fill="white"/><rect x="25.8" y="4.2" width="1.8" height="4.6" rx="0.9" fill="white" fill-opacity="0.45"/></svg>`,
  calendar: `<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>`,
  inbox: `<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  user: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
};

function floatCard(parent, { x, y, icon, tint, title, sub }) {
  const node = box(parent, {
    x,
    y,
    html: `<div style="width:42px;height:42px;border-radius:50%;background:color-mix(in oklch, ${tint} 22%, transparent);display:grid;place-items:center;flex:none">${icon}</div><div><div style="font:700 17px ${FONT.sans};color:${C.charText};white-space:nowrap">${title}</div><div style="font:500 14px ${FONT.sans};color:${C.charMuted};white-space:nowrap;margin-top:2px">${sub}</div></div>`,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "14px",
      padding: "14px 22px 14px 14px",
      borderRadius: "22px",
      background: "oklch(0.25 0.016 288 / 0.92)",
      boxShadow: `inset 0 0 0 1px ${C.charBorderStrong}, 0 34px 60px -22px oklch(0 0 0 / 0.75)`,
      transformOrigin: "50% 50%",
    },
  });
  return node;
}

export function build(stage) {
  root = box(stage, { w: 1920, h: 1080, style: { overflow: "hidden", display: "none" } });
  box(root, { w: 1920, h: 1080, style: { background: C.char } });
  grid = box(root, {
    x: -60,
    y: -60,
    w: 2040,
    h: 1200,
    style: {
      backgroundImage: "radial-gradient(circle, oklch(1 0 0 / 0.07) 1.3px, transparent 1.8px)",
      backgroundSize: "40px 40px",
    },
  });
  glow = box(root, {
    w: 1920,
    h: 1080,
    style: {
      background: `radial-gradient(620px 620px at ${PHONE.cx}px ${PHONE.cy - 60}px, oklch(0.45 0.17 285 / 0.5), oklch(0.3 0.1 285 / 0) 70%)`,
    },
  });
  world = box(root, { w: 1920, h: 1080, style: { transformOrigin: "0 0" } });

  caption = [
    lineMask(
      world,
      130,
      318,
      150,
      `<span style="font:800 128px ${FONT.display};letter-spacing:-0.045em;color:${C.charText}">Balances</span>`
    ),
    lineMask(
      world,
      130,
      452,
      190,
      `<span style="font:italic 400 166px ${FONT.serif};letter-spacing:-0.015em;color:oklch(0.8 0.11 285)">that add up.</span>`
    ),
  ];

  phoneWrap = box(world, {
    w: 1920,
    h: 1080,
    style: { perspective: "2200px", perspectiveOrigin: `${PHONE.cx}px ${PHONE.cy}px` },
  });
  phone = box(phoneWrap, {
    x: PHONE.cx - PHONE.w / 2,
    y: PHONE.cy - PHONE.h / 2,
    w: PHONE.w,
    h: PHONE.h,
    style: {
      borderRadius: "74px",
      background:
        "linear-gradient(150deg, #6b6b78 0%, #2c2c35 22%, #18181f 50%, #2c2c35 78%, #5d5d69 100%)",
      boxShadow: "0 80px 120px -40px oklch(0 0 0 / 0.85), inset 0 0 0 1.5px oklch(1 0 0 / 0.18)",
      transformOrigin: "50% 50%",
    },
  });
  // Side buttons.
  for (const [x, y, h] of [
    [-3, 190, 38],
    [-3, 256, 70],
    [-3, 342, 70],
    [PHONE.w - 1, 300, 108],
  ])
    box(phone, { x, y, w: 4, h, style: { borderRadius: "2px", background: "#3a3a44" } });

  const screen = box(phone, {
    x: SCR.x,
    y: SCR.y,
    w: SCR.w,
    h: SCR.h,
    style: { borderRadius: "63px", background: C.char, overflow: "hidden" },
  });
  box(screen, {
    x: 38,
    y: 19,
    text: "9:41",
    style: { font: `700 18px ${FONT.sans}`, color: "white" },
  });
  box(screen, {
    x: 280,
    y: 22,
    html: `${ICONS.signal}${ICONS.wifi}${ICONS.battery}`,
    style: { display: "flex", gap: "6px", alignItems: "center" },
  });
  box(screen, {
    x: 137,
    y: 13,
    w: 124,
    h: 36,
    style: { borderRadius: "18px", background: "black" },
  });

  header = box(screen, { x: 0, y: 0, w: SCR.w, h: 150 });
  box(header, {
    x: 26,
    y: 72,
    text: "Hi, Marco",
    style: { font: `700 32px ${FONT.display}`, color: C.charText, letterSpacing: "-0.02em" },
  });
  box(header, {
    x: 27,
    y: 112,
    text: "Friday, June 5",
    style: { font: `500 16px ${FONT.sans}`, color: C.charMuted },
  });
  box(header, {
    x: 324,
    y: 74,
    w: 48,
    h: 48,
    text: "MR",
    style: {
      borderRadius: "50%",
      background: TEAM.mr.av,
      color: "white",
      display: "grid",
      placeItems: "center",
      font: `800 17px ${FONT.sans}`,
      boxShadow: "inset 0 0 0 1px oklch(1 0 0 / .14)",
    },
  });

  const card = box(screen, {
    x: 14,
    y: 156,
    w: 370,
    h: 372,
    style: {
      borderRadius: "28px",
      background: C.charSurface,
      boxShadow: `inset 0 0 0 1px ${C.charBorder}`,
    },
  });
  box(card, {
    x: 22,
    y: 20,
    text: "Vacation · 2026",
    style: { font: `600 15px ${FONT.sans}`, color: C.charMuted },
  });
  box(card, {
    x: 270,
    y: 15,
    text: "25 days",
    style: {
      font: `700 13px ${FONT.sans}`,
      color: C.charText,
      background: C.charSurface2,
      borderRadius: "12px",
      padding: "5px 11px",
    },
  });
  ringWrap = svg(
    "svg",
    {
      width: 260,
      height: 260,
      viewBox: "0 0 260 260",
      style: "position:absolute;left:55px;top:56px;overflow:visible",
    },
    card
  );
  const defs = svg("defs", {}, ringWrap);
  const grad = svg("linearGradient", { id: "ringGrad", x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
  svg("stop", { offset: "0", "stop-color": "oklch(0.78 0.12 300)" }, grad);
  svg("stop", { offset: "1", "stop-color": C.primaryDark }, grad);
  svg(
    "circle",
    { cx: 130, cy: 130, r: RING.r, fill: "none", stroke: C.charSurface2, "stroke-width": RING.sw },
    ringWrap
  );
  ringArc = svg(
    "circle",
    {
      cx: 130,
      cy: 130,
      r: RING.r,
      fill: "none",
      stroke: "url(#ringGrad)",
      "stroke-width": RING.sw,
      "stroke-linecap": "round",
      pathLength: 1,
      "stroke-dasharray": "0 1",
      transform: "rotate(-90 130 130)",
    },
    ringWrap
  );

  // Odometer: a mechanical counter, the tens wheel only turns while the ones wheel wraps.
  digits = box(card, {
    x: 185 - DIGIT_W,
    y: 128,
    w: DIGIT_W * 2,
    h: DIGIT_H,
    style: { overflow: "hidden" },
  });
  set(digits, "maskImage", "linear-gradient(transparent, black 22%, black 78%, transparent)");
  const strip = (count) =>
    Array.from(
      { length: count },
      (_, i) =>
        `<div style="height:${DIGIT_H}px;line-height:${DIGIT_H}px;text-align:center">${i % 10}</div>`
    ).join("");
  const digitStyle = {
    font: `800 80px ${FONT.display}`,
    color: C.charText,
    letterSpacing: "-0.04em",
  };
  tensCol = box(digits, { x: 0, y: 0, w: DIGIT_W, h: DIGIT_H });
  tensStrip = box(tensCol, { x: 0, y: 0, w: DIGIT_W, html: strip(3), style: digitStyle });
  onesStrip = box(digits, { x: DIGIT_W - 4, y: 0, w: DIGIT_W, html: strip(20), style: digitStyle });
  ringLabel = box(card, {
    x: 0,
    y: 214,
    w: 370,
    text: "days left",
    style: { font: `600 15px ${FONT.sans}`, color: C.charMuted, textAlign: "center" },
  });

  stats = [
    ["25", "allowance", C.charMuted],
    ["10", "booked", C.vacationD],
    ["2", "pending", C.warmD],
  ].map(([v, label, dot], i) =>
    box(card, {
      x: 22 + i * 118,
      y: 312,
      w: 110,
      html: `<div style="font:700 22px ${FONT.display};color:${C.charText};letter-spacing:-0.02em">${v}</div><div style="font:500 13px ${FONT.sans};color:${C.charFaint};display:flex;align-items:center;gap:6px;margin-top:2px"><span style="width:7px;height:7px;border-radius:50%;background:${dot}"></span>${label}</div>`,
    })
  );

  box(screen, {
    x: 26,
    y: 548,
    text: "Upcoming",
    style: { font: `700 18px ${FONT.sans}`, color: C.charText },
  });
  box(screen, {
    x: 26,
    y: 550,
    w: 346,
    text: "See all",
    style: { font: `600 15px ${FONT.sans}`, color: C.primaryDark, textAlign: "right" },
  });
  const row = (y, color, title, sub, chipLabel, chipColor, check) => {
    const r = box(screen, {
      x: 14,
      y,
      w: 370,
      h: 70,
      style: {
        borderRadius: "20px",
        background: C.charSurface,
        boxShadow: `inset 0 0 0 1px ${C.charBorder}`,
      },
    });
    box(r, { x: 16, y: 16, w: 5, h: 38, style: { borderRadius: "3px", background: color } });
    box(r, {
      x: 36,
      y: 13,
      text: title,
      style: { font: `700 17px ${FONT.sans}`, color: C.charText },
    });
    box(r, {
      x: 36,
      y: 38,
      text: sub,
      style: { font: `500 14px ${FONT.sans}`, color: C.charMuted },
    });
    box(r, {
      x: 0,
      y: 21,
      w: 354,
      html: `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:12px;background:color-mix(in oklch, ${chipColor} 17%, transparent);color:${chipColor};font:700 13px ${FONT.sans}">${check}${chipLabel}</span>`,
      style: { textAlign: "right" },
    });
    return r;
  };
  rows = [
    row(
      582,
      C.vacationD,
      "Sardinia",
      "Jun 8 – 19 · 10 days",
      "Approved",
      C.okD,
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${C.okD}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="${CHECK_PATH}"/></svg>`
    ),
    row(662, C.ptoD, "Long weekend", "Jun 22 – 23 · 2 days", "Pending", C.warmD, ""),
  ];

  const tabs = box(screen, {
    x: 0,
    y: 758,
    w: SCR.w,
    h: 92,
    style: { boxShadow: `inset 0 1px 0 ${C.charBorder}`, background: C.charTint },
  });
  [
    ["calendar", "Calendar", true],
    ["inbox", "Requests"],
    ["clock", "Attendance"],
    ["user", "Profile"],
  ].forEach(([icon, label, active], i) => {
    const color = active ? C.primaryDark : C.charFaint;
    box(tabs, {
      x: 12 + i * 94,
      y: 12,
      w: 94,
      html: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg><div style="font:600 11px ${FONT.sans};color:${color};margin-top:3px">${label}</div>`,
      style: { textAlign: "center" },
    });
  });
  box(screen, {
    x: 129,
    y: 836,
    w: 140,
    h: 5,
    style: { borderRadius: "3px", background: "oklch(1 0 0 / 0.7)" },
  });

  const check = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${C.okD}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${CHECK_PATH}"/></svg>`;
  const dot = (c) =>
    `<span style="width:14px;height:14px;border-radius:50%;background:${c}"></span>`;
  cards = [
    {
      x: 860,
      y: 214,
      d: 1.6,
      at: 6.34,
      icon: check,
      tint: C.okD,
      title: "Sardinia approved",
      sub: "10 days · just now",
    },
    {
      x: 1490,
      y: 196,
      d: 1.25,
      at: 6.44,
      icon: dot(C.warmD),
      tint: C.warmD,
      title: "+2 days carried over",
      sub: "from 2025",
    },
    {
      x: 1506,
      y: 452,
      d: 0.85,
      at: 6.52,
      icon: `<span style="font:800 15px ${FONT.sans};color:${C.ptoD}">3</span>`,
      tint: C.ptoD,
      title: "3 away this week",
      sub: "Sofia, Aisha, Noah",
    },
    {
      x: 1470,
      y: 718,
      d: 1.1,
      at: 6.6,
      icon: dot(C.homeD),
      tint: C.homeD,
      title: "Home office",
      sub: "Friday · 1 day",
    },
    {
      x: 790,
      y: 838,
      d: 1.45,
      at: 6.68,
      icon: dot(C.bankD),
      tint: C.bankD,
      title: "Bank holiday",
      sub: "Mon, June 1",
    },
  ].map((c) => ({ ...c, node: floatCard(world, c), phase: c.x * 0.01 }));
}

// The iris in the next scene opens from wherever the ring sits on screen.
export function irisGeometry(t) {
  const s = pushScale(t);
  return { cx: 960, cy: 540, r: RING.r * s, sw: RING.sw * s };
}

function pushScale(t) {
  return (
    A.lerp(1, 1.42, A.tw(t, PUSH[0], PUSH[1], A.inCubic)) *
    Math.pow(2.4, A.tw(t, PUSH[1], CUE.iris[1], A.inQuad))
  );
}

export function render(t) {
  const active = t >= CUE.whip[0] + 0.02 && t < CUE.iris[1] + 0.02;
  show(root, active);
  if (!active) return;
  const lt = t - CUE.whip[1];

  const w = whip(t);
  const lag = (d) => 1080 * (w - whip(t - d));
  set(root, "transform", `translateY(${1080 * (1 - w)}px)`);
  const blur = whipSpeed(t) / 1500;
  set(root, "filter", blur > 0.6 ? "url(#vblur)" : "none");
  if (blur > 0.6) setVblur(blur);

  // Push toward the ring before the iris.
  const f = A.tw(t, PUSH[0], PUSH[1], A.glide);
  const S = pushScale(t);
  const F = [A.lerp(960, RING_STAGE[0], f), A.lerp(540, RING_STAGE[1], f)];
  set(world, "transform", `translate(960px, 540px) scale(${S}) translate(${-F[0]}px, ${-F[1]}px)`);
  set(grid, "transform", `translate(${-lt * 14}px, ${-lt * 8}px)`);

  caption.forEach((line, i) => {
    const p = A.tw(t, 6.12 + i * 0.1, 6.68 + i * 0.1, A.snap);
    const out = A.tw(t, 7.3 + i * 0.04, 7.5 + i * 0.04, A.inCubic);
    set(line.content, "transform", `translateY(${(1 - p) * 108 - out * 108}%)`);
  });

  // Phone: lands behind the camera, rotates on a spring, then turns slowly and straightens.
  const settle = A.spring(t - 5.98, 1.25, 0.6);
  const drift = A.tw(t, 6.3, PUSH[0], A.inOutSine);
  const straight = A.tw(t, PUSH[0] - 0.06, PUSH[1] - 0.04, A.glide);
  const rx = (A.lerp(34, 9, settle) - 3 * drift) * (1 - straight);
  const ry = (A.lerp(-36, -21, settle) + 8 * drift) * (1 - straight);
  const rz = A.lerp(7, 2.5, settle) * (1 - straight);
  set(
    phone,
    "transform",
    `translateY(${lag(0.05) * 0.6}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`
  );

  // Ring and odometer.
  const rp = A.tw(t, CUE.ring[0], CUE.ring[1], A.snap);
  // During the push the arc closes into a full ring, which then opens as the iris.
  const close = A.tw(t, PUSH[0], PUSH[1] - 0.04, A.inOutCubic);
  const frac = 0.6 * rp + 0.4 * close;
  attr(ringArc, "stroke-dasharray", `${frac.toFixed(4)} ${(1 - frac + 0.0001).toFixed(4)}`);
  show(ringWrap, t < CUE.iris[0] + 0.005);
  const v = A.lerp(ODOMETER.from, ODOMETER.to, rp);
  const ones = v;
  const tens = Math.floor(v / 10) + A.clamp((v % 10) - 9);
  set(onesStrip, "transform", `translateY(${-ones * DIGIT_H}px)`);
  set(tensStrip, "transform", `translateY(${-tens * DIGIT_H}px)`);
  const tensVis = A.clamp(v - 9);
  set(ringLabel, "opacity", 1 - close);
  set(digits, "opacity", 1 - close);
  set(tensCol, "opacity", tensVis);
  set(digits, "transform", `translateX(${(1 - tensVis) * -DIGIT_W * 0.47}px)`);

  stats.forEach((s, i) => {
    const p = A.tw(t, 6.62 + i * 0.07, 6.98 + i * 0.07, A.snap);
    set(s, "opacity", p);
    set(s, "transform", `translateY(${(1 - p) * 14}px)`);
  });
  rows.forEach((r, i) => {
    const p = A.tw(t, 6.7 + i * 0.09, 7.12 + i * 0.09, A.snap);
    set(r, "opacity", p);
    set(r, "transform", `translateX(${(1 - p) * 60}px)`);
  });
  const hp = A.tw(t, 6.12, 6.5, A.snap);
  set(header, "opacity", hp);
  set(header, "transform", `translateY(${(1 - hp) * 12}px)`);

  // Floating cards: spring in, bob, parallax against the phone's turn, scatter before the push.
  for (const c of cards) {
    const s = A.spring(t - c.at, 1.9, 0.55);
    const bob = Math.sin(t * 2.6 + c.phase) * 7 * c.d;
    const par = (drift - 0.5) * -34 * c.d;
    const out = A.tw(t, PUSH[0] - 0.08, PUSH[1] - 0.06, A.inCubic);
    const dx = c.x + 150 - PHONE.cx,
      dy = c.y + 36 - PHONE.cy;
    const len = Math.hypot(dx, dy);
    const ox = (dx / len) * 520 * out,
      oy = (dy / len) * 520 * out;
    set(
      c.node,
      "transform",
      `translate(${par + ox}px, ${bob + oy + lag(0.09) * 0.9 * c.d}px) scale(${A.lerp(0.6, 1, s)}) rotate(${(1 - A.clamp(s)) * -8}deg)`
    );
    set(c.node, "opacity", A.clamp(s * 1.6) * (1 - out));
  }

  set(glow, "opacity", 0.7 + 0.3 * Math.sin(t * 2.2));
}
