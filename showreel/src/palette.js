// flexiday tokens, lifted from flexi-day/app/globals.css.
export const C = {
  paper: "oklch(0.985 0.008 78)",
  paperTint: "oklch(0.965 0.012 78)",
  surface: "oklch(0.998 0.004 80)",
  surface2: "oklch(0.972 0.009 78)",
  border: "oklch(0.915 0.01 80)",
  borderStrong: "oklch(0.86 0.012 80)",
  ink: "oklch(0.26 0.018 290)",
  inkMuted: "oklch(0.52 0.014 288)",
  inkFaint: "oklch(0.66 0.012 288)",
  primary: "oklch(0.55 0.165 285)",
  primaryStrong: "oklch(0.48 0.165 285)",
  primarySoft: "oklch(0.55 0.165 285 / 0.1)",
  primaryFg: "oklch(0.99 0.01 285)",

  char: "oklch(0.165 0.013 288)",
  charTint: "oklch(0.195 0.014 288)",
  charSurface: "oklch(0.205 0.015 288)",
  charSurface2: "oklch(0.245 0.016 288)",
  charBorder: "oklch(0.295 0.016 288)",
  charBorderStrong: "oklch(0.36 0.018 288)",
  charText: "oklch(0.96 0.006 288)",
  charMuted: "oklch(0.72 0.012 288)",
  charFaint: "oklch(0.58 0.012 288)",
  primaryDark: "oklch(0.68 0.165 285)",
  logoInk: "#0c0c16",
  logoViolet: "#9086f9",

  vacation: "oklch(0.6 0.16 285)",
  home: "oklch(0.6 0.12 158)",
  sick: "oklch(0.62 0.16 18)",
  bank: "oklch(0.7 0.13 70)",
  pto: "oklch(0.6 0.11 232)",
  study: "oklch(0.66 0.14 110)",
  sickday: "oklch(0.62 0.14 350)",
  warm: "oklch(0.66 0.14 42)",
  warmSoft: "oklch(0.66 0.14 42 / 0.14)",
  ok: "oklch(0.58 0.13 155)",
  okSoft: "oklch(0.58 0.13 155 / 0.14)",

  vacationD: "oklch(0.7 0.15 285)",
  homeD: "oklch(0.72 0.13 158)",
  sickD: "oklch(0.7 0.15 20)",
  bankD: "oklch(0.78 0.13 72)",
  ptoD: "oklch(0.7 0.11 232)",
  warmD: "oklch(0.74 0.13 44)",
  okD: "oklch(0.72 0.13 155)",
};

// Avatar gradients from flexi-day/lib/demo/team.ts.
export const AV = {
  violet: "linear-gradient(135deg,#8b6ce8,#6d4fd0)",
  coral: "linear-gradient(135deg,#f0916b,#e26d4e)",
  teal: "linear-gradient(135deg,#3fb6a8,#2a8f86)",
  amber: "linear-gradient(135deg,#e9b15a,#d8973a)",
  rose: "linear-gradient(135deg,#ec7a8f,#d65574)",
  green: "linear-gradient(135deg,#74c08a,#4ea36c)",
  blue: "linear-gradient(135deg,#6aa6f0,#477fd6)",
  plum: "linear-gradient(135deg,#b27ad0,#9257b8)",
  sand: "linear-gradient(135deg,#cbb48f,#b39a6e)",
  slate: "linear-gradient(135deg,#8893ad,#69748f)",
};

export const TEAM = {
  dh: { name: "Dana Holt", first: "Dana", initials: "DH", av: AV.violet },
  mr: { name: "Marco Rossi", first: "Marco", initials: "MR", av: AV.teal },
  ak: { name: "Aisha Khan", first: "Aisha", initials: "AK", av: AV.coral },
  lo: { name: "Liam O'Brien", first: "Liam", initials: "LO", av: AV.blue },
  sa: { name: "Sofia Almeida", first: "Sofia", initials: "SA", av: AV.rose },
  nw: { name: "Noah Weber", first: "Noah", initials: "NW", av: AV.amber },
  yt: { name: "Yuki Tanaka", first: "Yuki", initials: "YT", av: AV.plum },
  pn: { name: "Priya Nair", first: "Priya", initials: "PN", av: AV.green },
  tb: { name: "Tom Becker", first: "Tom", initials: "TB", av: AV.slate },
  ep: { name: "Elena Petrova", first: "Elena", initials: "EP", av: AV.sand },
};

export const FONT = {
  display: "'Bricolage', system-ui, sans-serif",
  sans: "'Hanken', system-ui, sans-serif",
  serif: "'Instrument', Georgia, serif",
};
