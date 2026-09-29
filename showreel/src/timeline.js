// The cue sheet. Picture and soundtrack both read it, so every hit lands on the same frame.
export const FPS = 60;
export const DURATION = 15;
export const BPM = 120;
export const BEAT = 60 / BPM;

export const CUE = {
  dotFall: [0.0, 0.5],
  dotLand: 0.5,
  burst: 1.0,
  wipe: [1.42, 2.0],
  bankFlip: 2.25,
  captionIn: 2.3,
  diveAnticipate: 3.48,
  dive: [3.6, 4.0],
  drop: 4.0,
  miniCal: 4.32,
  cursor: [4.38, 4.92],
  click: 5.0,
  notify: 5.34,
  whip: [5.74, 6.2],
  ring: [6.36, 7.3],
  iris: [7.72, 8.06],
  words: { time: 8.0, off: 8.5, handled: 9.0, with: 9.5, care: 9.75 },
  periodDrop: [10.02, 10.25],
  pushDot: [10.5, 11.0],
  markForm: 11.0,
  ticks: [11.25, 11.5, 11.625, 11.75, 11.8125, 11.875, 11.9375],
  land: 12.0,
  tagline: 12.3,
  url: 12.7,
  glint: [13.05, 13.7],
};

// Team calendar, June 2026 (Mon-first, so June 1 sits in row 0, col 0). Lifted from DEMO_LEAVE.
export const BARS = [
  {
    r: 1,
    c0: 0,
    c1: 4,
    lane: 0,
    who: "mr",
    type: "vacation",
    label: "Sardinia",
    at: 2.375,
    pending: true,
  },
  { r: 1, c0: 1, c1: 1, lane: 1, who: "lo", type: "sick", label: "Liam", at: 2.5 },
  { r: 1, c0: 2, c1: 2, lane: 1, who: "tb", type: "home", label: "Tom", at: 2.625 },
  { r: 1, c0: 3, c1: 4, lane: 1, who: "sa", type: "vacation", label: "Sofia", at: 2.75 },
  { r: 1, c0: 4, c1: 4, lane: 2, who: "dh", type: "home", label: "Dana", at: 2.875 },
  {
    r: 2,
    c0: 0,
    c1: 4,
    lane: 0,
    who: "mr",
    type: "vacation",
    label: "Sardinia",
    at: 3.0,
    pending: true,
    dive: true,
  },
  { r: 2, c0: 0, c1: 1, lane: 1, who: "sa", type: "vacation", label: "Sofia", at: 3.125 },
  { r: 2, c0: 2, c1: 2, lane: 1, who: "tb", type: "home", label: "Tom", at: 3.1875 },
  { r: 2, c0: 0, c1: 2, lane: 2, who: "ak", type: "home", label: "Aisha", at: 3.25 },
  { r: 2, c0: 3, c1: 3, lane: 1, who: "pn", type: "pto", label: "Priya", at: 3.3125 },
  { r: 3, c0: 0, c1: 1, lane: 0, who: "yt", type: "pto", label: "Yuki", at: 3.375 },
  { r: 3, c0: 2, c1: 4, lane: 0, who: "nw", type: "vacation", label: "Noah", at: 3.4375 },
  { r: 4, c0: 0, c1: 1, lane: 0, who: "nw", type: "vacation", label: "Noah", at: 3.5 },
  { r: 4, c0: 0, c1: 1, lane: 1, who: "ep", type: "vacation", label: "Elena", at: 3.5625 },
];

export const ODOMETER = { from: 0, to: 15, of: 25 };
export const WEEKDAYS = ["Mon", "Tues", "Wednes", "Thurs", "Fri", "Satur", "Sun"];
