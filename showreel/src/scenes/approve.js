import { C, TEAM, FONT } from "../palette.js";
import { el, box, set, show, svg, attr } from "../dom.js";
import * as A from "../anim.js";
import { CUE } from "../timeline.js";
import { whip, whipSpeed, setVblur, APP_ICON, CHECK_PATH } from "./shared.js";

// 4.0 – 6.2s: on violet, Marco's request flips in, the cursor approves it, the button collapses
// into a checkmark, confetti flies, the phone gets its push — then the camera whips down.

const CARD = { x: 980, y: 304, w: 700, h: 472 };
const BTN = { x: 36, y: 378, w: 200, h: 58 };
const BTN_C = [CARD.x + BTN.x + BTN.w / 2, CARD.y + BTN.y + BTN.h / 2];
const CURSOR_PATH = [
  [1760, 1030],
  [1560, 1000],
  [1230, 840],
  [BTN_C[0] + 6, BTN_C[1] + 4],
];
const DAYS = [8, 9, 10, 11, 12, 15, 16, 17, 18, 19];
const LETTERS = ["M", "T", "W", "T", "F"];

let root, bgGrad, orbits, clickRing, caption, cardEl, chipInner, cells, balFill;
let btn, btnLabel, ripple, btnCheck, decline, approvedNote, cursor, notif, confetti, flash;

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

export function build(stage) {
  root = box(stage, { w: 1920, h: 1080, style: { overflow: "hidden", display: "none" } });
  box(root, { w: 1920, h: 1080, style: { background: C.vacation } });
  bgGrad = box(root, {
    w: 1920,
    h: 1080,
    style: {
      background:
        "radial-gradient(1500px 1000px at 68% 42%, oklch(0.63 0.17 285), oklch(0.53 0.175 285) 55%, oklch(0.43 0.16 283) 100%)",
    },
  });

  orbits = [330, 470, 640, 850].map((r, i) =>
    box(root, {
      x: 1330 - r,
      y: 540 - r,
      w: r * 2,
      h: r * 2,
      style: {
        borderRadius: "50%",
        border: `${i === 1 ? 2 : 1.5}px ${i === 2 ? "dashed" : "solid"} oklch(1 0 0 / ${0.13 - i * 0.02})`,
      },
    })
  );
  clickRing = box(root, {
    w: 10,
    h: 10,
    style: { borderRadius: "50%", border: "3px solid oklch(1 0 0 / 0.8)", display: "none" },
  });

  caption = [
    lineMask(
      root,
      140,
      318,
      150,
      `<span style="font:800 128px ${FONT.display};letter-spacing:-0.045em;color:${C.primaryFg}">Approve in</span>`
    ),
    lineMask(
      root,
      140,
      452,
      190,
      `<span style="font:italic 400 168px ${FONT.serif};letter-spacing:-0.015em;color:oklch(0.9 0.06 285)">one click.</span>`
    ),
  ];

  const wrap = box(root, {
    w: 1920,
    h: 1080,
    style: {
      perspective: "1700px",
      perspectiveOrigin: `${CARD.x + CARD.w / 2}px ${CARD.y + CARD.h / 2}px`,
    },
  });
  cardEl = box(wrap, {
    x: CARD.x,
    y: CARD.y,
    w: CARD.w,
    h: CARD.h,
    style: {
      background: C.surface,
      borderRadius: "30px",
      transformOrigin: "50% 50%",
      boxShadow:
        "0 60px 110px -30px oklch(0.2 0.12 285 / 0.65), 0 18px 40px -18px oklch(0.2 0.1 285 / 0.5), inset 0 0 0 1px oklch(1 0 0 / 0.6)",
    },
  });

  const p = TEAM.mr;
  box(cardEl, {
    x: 36,
    y: 34,
    w: 68,
    h: 68,
    text: p.initials,
    style: {
      borderRadius: "50%",
      background: p.av,
      color: "white",
      display: "grid",
      placeItems: "center",
      font: `800 26px ${FONT.sans}`,
      boxShadow: "inset 0 0 0 1px oklch(1 0 0 / .14), 0 2px 6px oklch(0 0 0 / .18)",
    },
  });
  box(cardEl, {
    x: 124,
    y: 36,
    text: p.name,
    style: { font: `700 30px ${FONT.sans}`, color: C.ink, letterSpacing: "-0.01em" },
  });
  box(cardEl, {
    x: 125,
    y: 76,
    text: "Staff Engineer · Engineering",
    style: { font: `500 19px ${FONT.sans}`, color: C.inkFaint },
  });

  const chip = box(cardEl, {
    x: CARD.w - 36 - 142,
    y: 48,
    w: 142,
    h: 38,
    style: { borderRadius: "19px", overflow: "hidden" },
  });
  chipInner = box(chip, { w: 142, h: 76 });
  const chipRow = (y, label, color, bg, icon) =>
    box(chipInner, {
      x: 0,
      y,
      w: 142,
      h: 38,
      html: `${icon}<span>${label}</span>`,
      style: {
        background: bg,
        color,
        font: `700 16px ${FONT.sans}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        letterSpacing: "0.01em",
      },
    });
  chipRow(
    0,
    "Pending",
    C.warm,
    C.warmSoft,
    `<span style="width:8px;height:8px;border-radius:50%;background:${C.warm}"></span>`
  );
  chipRow(
    38,
    "Approved",
    C.ok,
    C.okSoft,
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${C.ok}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="${CHECK_PATH}"/></svg>`
  );

  box(cardEl, { x: 36, y: 128, w: CARD.w - 72, h: 1, style: { background: C.border } });
  box(cardEl, {
    x: 36,
    y: 146,
    h: 34,
    html: `<span style="width:12px;height:12px;border-radius:50%;background:${C.vacation};flex:none"></span><span style="font:700 21px ${FONT.sans};color:${C.ink}">Vacation</span><span style="font:italic 400 27px ${FONT.serif};color:${C.inkMuted};margin-left:2px">· Sardinia</span>`,
    style: { display: "flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap" },
  });

  cells = DAYS.map((d, i) => {
    const x = 36 + i * 48 + (i >= 5 ? 16 : 0);
    const c = box(cardEl, {
      x,
      y: 196,
      w: 42,
      h: 58,
      style: {
        borderRadius: "11px",
        background: C.primary,
        transformOrigin: "50% 100%",
        boxShadow: "0 6px 12px -6px oklch(0.4 0.15 285 / 0.6)",
      },
    });
    box(c, {
      x: 0,
      y: 7,
      w: 42,
      text: LETTERS[i % 5],
      style: {
        font: `700 11px ${FONT.sans}`,
        color: "oklch(1 0 0 / 0.7)",
        textAlign: "center",
        letterSpacing: "0.08em",
      },
    });
    box(c, {
      x: 0,
      y: 25,
      w: 42,
      text: String(d),
      style: { font: `700 20px ${FONT.sans}`, color: "white", textAlign: "center" },
    });
    return c;
  });
  box(cardEl, {
    x: 560,
    y: 190,
    html: `<div style="font:800 54px ${FONT.display};letter-spacing:-0.04em;color:${C.ink};line-height:1">10</div><div style="font:600 16px ${FONT.sans};color:${C.inkFaint};margin-top:4px">working days</div>`,
  });
  box(cardEl, {
    x: 36,
    y: 266,
    text: "Mon, Jun 8",
    style: { font: `600 15px ${FONT.sans}`, color: C.inkFaint },
  });
  box(cardEl, {
    x: 36,
    y: 266,
    w: 490,
    text: "Fri, Jun 19",
    style: { font: `600 15px ${FONT.sans}`, color: C.inkFaint, textAlign: "right" },
  });

  box(cardEl, {
    x: 36,
    y: 306,
    text: "Balance after approval",
    style: { font: `600 15px ${FONT.sans}`, color: C.inkFaint },
  });
  box(cardEl, {
    x: 36,
    y: 306,
    w: CARD.w - 72,
    html: `<b style="color:${C.ink}">15</b> of 25 days left`,
    style: { font: `600 15px ${FONT.sans}`, color: C.inkMuted, textAlign: "right" },
  });
  const track = box(cardEl, {
    x: 36,
    y: 334,
    w: CARD.w - 72,
    h: 8,
    style: {
      borderRadius: "4px",
      background: C.surface2,
      overflow: "hidden",
      boxShadow: `inset 0 0 0 1px ${C.border}`,
    },
  });
  balFill = box(track, {
    w: CARD.w - 72,
    h: 8,
    style: { borderRadius: "4px", background: C.primary, transformOrigin: "0 50%" },
  });

  btn = box(cardEl, {
    x: BTN.x,
    y: BTN.y,
    w: BTN.w,
    h: BTN.h,
    style: {
      borderRadius: `${BTN.h / 2}px`,
      background: C.primary,
      overflow: "hidden",
      transformOrigin: `${BTN.h / 2}px 50%`,
      boxShadow: "0 1px 2px oklch(0 0 0 / 0.12), inset 0 1px 0 oklch(1 0 0 / 0.15)",
    },
  });
  btnLabel = box(btn, {
    w: BTN.w,
    h: BTN.h,
    html: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${CHECK_PATH}"/></svg><span>Approve</span>`,
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      font: `700 21px ${FONT.sans}`,
      color: C.primaryFg,
      letterSpacing: "-0.005em",
    },
  });
  ripple = box(btn, {
    w: 10,
    h: 10,
    style: { borderRadius: "50%", background: "oklch(1 0 0 / 0.45)", display: "none" },
  });
  const checkSvg = svg(
    "svg",
    {
      width: BTN.h,
      height: BTN.h,
      viewBox: "0 0 24 24",
      style: "position:absolute;left:0;top:0;overflow:visible",
    },
    btn
  );
  btnCheck = svg(
    "path",
    {
      d: CHECK_PATH,
      fill: "none",
      stroke: "white",
      "stroke-width": 2.6,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      pathLength: 1,
      "stroke-dasharray": 1,
      "stroke-dashoffset": 1,
    },
    checkSvg
  );
  decline = box(cardEl, {
    x: 250,
    y: BTN.y,
    w: 150,
    h: BTN.h,
    text: "Decline",
    style: {
      borderRadius: `${BTN.h / 2}px`,
      boxShadow: `inset 0 0 0 1.5px ${C.borderStrong}`,
      display: "grid",
      placeItems: "center",
      font: `700 21px ${FONT.sans}`,
      color: C.inkMuted,
    },
  });
  approvedNote = box(cardEl, {
    x: 112,
    y: BTN.y,
    h: BTN.h,
    html: `<div style="font:700 19px ${FONT.sans};color:${C.ink}">Approved</div><div style="font:500 16px ${FONT.sans};color:${C.inkFaint}">by Dana Holt · just now</div>`,
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      whiteSpace: "nowrap",
      opacity: 0,
    },
  });

  // Confetti: pre-rolled so every render of a given time is identical.
  const rand = A.rng(4242);
  const palette = [
    C.bank,
    C.home,
    C.sick,
    "white",
    C.pto,
    C.warm,
    "oklch(0.93 0.05 285)",
    C.study,
    C.sickday,
    "white",
  ];
  confetti = Array.from({ length: 150 }, (_, i) => {
    const kind = rand();
    const isStrip = kind > 0.78,
      isDot = kind < 0.3;
    const w = isDot ? 11 + rand() * 7 : isStrip ? 6 + rand() * 3 : 12 + rand() * 8;
    const h = isDot ? w : isStrip ? 24 + rand() * 12 : 16 + rand() * 10;
    const ang = -Math.PI / 2 + (rand() - 0.5) * Math.PI * (i < 105 ? 1.0 : 1.7);
    const speed = 900 + rand() * 1800;
    const node = box(root, {
      w,
      h,
      style: {
        background: palette[Math.floor(rand() * palette.length)],
        borderRadius: isDot ? "50%" : isStrip ? "3px" : "2.5px",
        display: "none",
        boxShadow: "0 2px 4px oklch(0.2 0.1 285 / 0.18)",
      },
    });
    return {
      node,
      w,
      h,
      delay: rand() * 0.06,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      rz: rand() * 360,
      wz: (rand() - 0.5) * 900,
      wx: 300 + rand() * 900,
      wy: (rand() - 0.5) * 700,
      sway: 18 + rand() * 30,
      swayF: 1.5 + rand() * 2.5,
      phase: rand() * Math.PI * 2,
      life: 1.05 + rand() * 0.5,
      ox: (rand() - 0.5) * 60,
    };
  });

  notif = box(root, {
    x: 1050,
    y: 44,
    w: 560,
    h: 104,
    style: {
      borderRadius: "28px",
      background: "oklch(0.99 0.004 80 / 0.94)",
      boxShadow: "0 30px 60px -20px oklch(0.2 0.12 285 / 0.55), inset 0 0 0 1px oklch(1 0 0 / 0.7)",
      display: "none",
      transformOrigin: "50% 0%",
    },
  });
  box(notif, {
    x: 20,
    y: 22,
    w: 60,
    h: 60,
    html: APP_ICON,
    style: { borderRadius: "14px", overflow: "hidden", boxShadow: "0 2px 6px oklch(0 0 0 / 0.2)" },
  });
  box(notif, {
    x: 96,
    y: 18,
    w: 440,
    html: `<span style="font:700 13px ${FONT.sans};letter-spacing:0.08em;color:${C.inkFaint}">FLEXIDAY</span><span style="float:right;font:500 14px ${FONT.sans};color:${C.inkFaint}">now</span>`,
  });
  box(notif, {
    x: 96,
    y: 39,
    text: "Your vacation is approved",
    style: { font: `700 19px ${FONT.sans}`, color: C.ink },
  });
  box(notif, {
    x: 96,
    y: 65,
    text: "Jun 8 – 19 · Enjoy Sardinia, Marco!",
    style: { font: `500 16px ${FONT.sans}`, color: C.inkMuted },
  });

  cursor = box(root, {
    w: 44,
    h: 56,
    html: `<svg width="44" height="56" viewBox="0 0 22 28"><path d="M2 2 L2 22.5 L7.2 17.6 L10.6 25.4 L14 23.9 L10.7 16.3 L17.6 16.3 Z" fill="#111" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    style: {
      display: "none",
      transformOrigin: "4px 4px",
      filter: "drop-shadow(0 6px 10px oklch(0.15 0.1 285 / 0.45))",
    },
  });

  flash = box(root, {
    w: 1920,
    h: 1080,
    style: { background: "white", opacity: 0, pointerEvents: "none" },
  });
}

export function render(t) {
  const active = t >= CUE.drop - 0.001 && t < CUE.whip[1] + 0.02;
  show(root, active);
  if (!active) return;
  const lt = t - CUE.drop;

  const wy = -1080 * whip(t);
  set(root, "transform", `translateY(${wy}px)`);
  const blur = whipSpeed(t) / 1500;
  set(root, "filter", blur > 0.6 ? "url(#vblur)" : "none");
  if (blur > 0.6) setVblur(blur);

  set(bgGrad, "opacity", A.tw(lt, 0, 0.3, A.outQuad));
  set(flash, "opacity", 0.35 * (1 - A.tw(lt, 0, 0.12)));

  orbits.forEach((o, i) => {
    const s =
      0.9 +
      0.1 * A.spring(lt - i * 0.05, 1.2, 0.8) +
      0.02 * lt +
      0.03 * A.wobble(t - CUE.click - i * 0.04, 2.2, 5);
    set(o, "transform", `scale(${s}) rotate(${(i === 2 ? 8 : 0) * lt}deg)`);
    set(o, "opacity", A.tw(lt, 0.05 + i * 0.05, 0.4 + i * 0.05));
  });

  caption.forEach((line, i) => {
    const p = A.tw(lt, 0.06 + i * 0.1, 0.62 + i * 0.1, A.snap);
    set(line.content, "transform", `translateY(${(1 - p) * 108}%)`);
  });

  // Card flips in on a spring, then hops when approved.
  const flip = A.spring(lt - 0.02, 1.35, 0.62);
  const hop = A.wobble(t - CUE.click - 0.04, 2.6, 7) * -14;
  set(
    cardEl,
    "transform",
    `translateY(${hop}px) translateX(${(1 - flip) * 260}px) translateZ(${(1 - flip) * -380}px) rotateY(${(1 - flip) * -72}deg) rotateX(${(1 - flip) * 14}deg)`
  );
  set(cardEl, "opacity", A.tw(lt, 0, 0.12));

  cells.forEach((c, i) => {
    const s = A.spring(t - CUE.miniCal - i * 0.034, 3.2, 0.5);
    const shine =
      A.tw(t, CUE.click + 0.1 + i * 0.025, CUE.click + 0.24 + i * 0.025) *
      (1 - A.tw(t, CUE.click + 0.24 + i * 0.025, CUE.click + 0.5 + i * 0.025));
    set(
      c,
      "transform",
      `scaleY(${s}) scaleX(${A.lerp(0.6, 1, A.clamp(s))}) translateY(${-6 * shine}px)`
    );
    set(c, "filter", shine > 0.01 ? `brightness(${1 + 0.35 * shine})` : "none");
  });
  set(balFill, "transform", `scaleX(${0.6 * A.tw(t, 4.5, 5.05, A.snap)})`);

  // Cursor glides in, hovers, clicks, then drifts off.
  const cp = A.tw(t, CUE.cursor[0], CUE.cursor[1], A.inOutCubic);
  let [cx, cy] = A.cubicBezierPoint(...CURSOR_PATH, cp);
  const away = A.tw(t, CUE.click + 0.28, CUE.click + 0.7, A.inOutCubic);
  cx += away * 70;
  cy += away * 110;
  const press =
    A.tw(t, CUE.click - 0.04, CUE.click, A.outQuad) *
    (1 - A.tw(t, CUE.click + 0.02, CUE.click + 0.14, A.outQuad));
  show(cursor, t > CUE.cursor[0] && t < CUE.click + 0.72);
  set(cursor, "transform", `translate(${cx - 4}px, ${cy - 4}px) scale(${1 - 0.16 * press})`);
  set(cursor, "opacity", 1 - A.tw(t, CUE.click + 0.5, CUE.click + 0.7));

  // Button: hover, press, collapse into a green check.
  const hover = A.tw(t, CUE.cursor[1] - 0.1, CUE.cursor[1], A.outQuad);
  const morph = A.spring(t - CUE.click - 0.05, 2.4, 0.62);
  const w = A.lerp(BTN.w, BTN.h, morph);
  set(btn, "width", `${w}px`);
  const btnPress = 1 - 0.06 * press;
  set(
    btn,
    "transform",
    `scale(${btnPress * (1 + 0.03 * hover * (1 - A.clamp(morph)))}) translateY(${-2 * hover * (1 - A.clamp(morph))}px)`
  );
  const green = A.tw(t, CUE.click + 0.06, CUE.click + 0.26);
  set(
    btn,
    "background",
    `color-mix(in oklch, ${C.ok} ${Math.round(green * 100)}%, ${hover > 0 && green === 0 ? C.primaryStrong : C.primary})`
  );
  set(
    btn,
    "boxShadow",
    `0 ${8 * hover}px ${20 * hover}px -8px oklch(0.4 0.15 285 / ${0.5 * hover}), 0 0 0 ${10 * A.wobble(t - CUE.click - 0.3, 1.2, 4) ** 2}px oklch(0.58 0.13 155 / 0.25)`
  );
  set(btnLabel, "opacity", 1 - A.tw(t, CUE.click + 0.02, CUE.click + 0.12));
  set(btnLabel, "transform", `translateY(${-10 * A.tw(t, CUE.click + 0.02, CUE.click + 0.12)}px)`);
  const draw = A.tw(t, CUE.click + 0.18, CUE.click + 0.42, A.outCubic);
  attr(btnCheck, "stroke-dashoffset", (1 - draw).toFixed(4));
  const pop = 1 + 0.25 * A.wobble(t - CUE.click - 0.36, 2.2, 6);
  attr(btnCheck, "transform", `translate(12 12) scale(${pop}) translate(-12 -12)`);
  const rp = A.tw(t, CUE.click, CUE.click + 0.45, A.outCubic);
  show(ripple, t >= CUE.click && rp < 1);
  const rd = 30 + rp * 420;
  set(ripple, "width", `${rd}px`);
  set(ripple, "height", `${rd}px`);
  set(ripple, "transform", `translate(${BTN.w / 2 + 6 - rd / 2}px, ${BTN.h / 2 + 4 - rd / 2}px)`);
  set(ripple, "opacity", 1 - rp);

  const dp = A.tw(t, CUE.click + 0.02, CUE.click + 0.22, A.inCubic);
  set(decline, "opacity", 1 - dp);
  set(decline, "transform", `translateX(${dp * 30}px) scale(${1 - dp * 0.1})`);
  const np = A.tw(t, CUE.click + 0.3, CUE.click + 0.62, A.snap);
  set(approvedNote, "opacity", np);
  set(approvedNote, "transform", `translateX(${(1 - np) * -16}px)`);

  const chipP = A.tw(t, CUE.click + 0.1, CUE.click + 0.36, A.snap);
  set(chipInner, "transform", `translateY(${-38 * chipP}px)`);

  // Click shockwave over the whole scene.
  const kp = A.tw(t, CUE.click, CUE.click + 0.7, A.outExpo);
  show(clickRing, t >= CUE.click && kp < 1);
  const kd = 40 + kp * 1400;
  set(clickRing, "width", `${kd}px`);
  set(clickRing, "height", `${kd}px`);
  set(clickRing, "transform", `translate(${BTN_C[0] - kd / 2}px, ${BTN_C[1] - kd / 2}px)`);
  set(clickRing, "opacity", (1 - kp) * 0.7);
  set(clickRing, "borderWidth", `${A.lerp(6, 1, kp)}px`);

  // Confetti with linear drag and gravity, closed form.
  const g = 2300,
    k = 2.3;
  for (const c of confetti) {
    const tau = t - CUE.click - 0.03 - c.delay;
    if (tau <= 0 || tau > c.life) {
      show(c.node, false);
      continue;
    }
    show(c.node, true);
    const e = 1 - Math.exp(-k * tau);
    const x =
      BTN_C[0] + c.ox + (c.vx * e) / k + Math.sin(tau * c.swayF * 6.28 + c.phase) * c.sway * e;
    const y = BTN_C[1] - 10 + (g / k) * tau + ((c.vy - g / k) * e) / k;
    set(
      c.node,
      "transform",
      `translate(${x - c.w / 2}px, ${y - c.h / 2}px) rotateZ(${c.rz + c.wz * tau}deg) rotateX(${c.wx * tau}deg) rotateY(${c.wy * tau}deg) scale(${A.tw(tau, 0, 0.06)})`
    );
    set(c.node, "opacity", 1 - A.tw(tau, c.life - 0.3, c.life));
  }

  const nt = t - CUE.notify;
  show(notif, nt > 0);
  const ns = A.spring(nt, 1.9, 0.62);
  set(
    notif,
    "transform",
    `translateY(${(1 - ns) * -170}px) scale(${A.lerp(0.94, 1, A.clamp(ns))})`
  );
}
