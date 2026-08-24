// Design tokens matched to the shipping Lumper product
// (lumper_app/frontend/src/index.css + DESIGN.md, and lumper_mobile/src/theme.ts).
// One surface for the whole product: the driver app's. A trucker uses this at
// night in a cab, so dark is the product, not a mode. Warm near-black, never
// #000. Token names are unchanged so every view flips with the palette.
export const C = {
  bg: "#1A1A1D",
  ink: "#FAFAFA",
  card: "#242428",
  border: "rgba(255,255,255,0.10)",
  border2: "rgba(255,255,255,0.08)",
  hair: "rgba(255,255,255,0.06)",
  faint: "#2E2E33",
  muted: "#8A8A86",
  sub: "#9A9A98",
  body: "#D7D7D4",
  slate: "#B4B4B1",
  // was near-black-on-light; now the raised surface that reads as "solid" on dark
  black: "#33333B",
  orange: "#F97316",
  orangeDk: "#FDBA74",
  brand: "#F97316",
  brandTint: "rgba(249,115,22,0.10)",
  dBg: "#1A1A1D",
  dCard: "#242428",
  dRaised: "#2E2E33",
  dBorder: "rgba(255,255,255,0.10)",
  dText: "#FAFAFA",
  dSub: "#9A9A98",
  // Near-black on orange is 7.2:1; white on orange is only 2.9:1. Cab wins.
  onAccent: "#0A0A0A",
} as const;

// Hard floors from lumper_mobile: gloves, windshield mount, moving truck.
export const TAP_MIN = 60;
export const PRIMARY_BTN_H = 64;

export const FONT = '"Inter", ui-sans-serif, system-ui, sans-serif';
export const CARD_SHADOW =
  "0 1px 2px rgba(16,16,14,0.04), 0 4px 12px -4px rgba(16,16,14,0.06)";

// Status colours lifted to their dark-mode pairs: the 700-weight inks that read
// on white go muddy on near-black, so each tone uses its 400 and a 12% wash.
const wash = (hex: string, a = "1F") => `${hex}${a}`;
export const TONE = {
  ok: { fg: C.body, bg: "transparent", border: C.border },
  pass: { fg: "#34D399", bg: wash("#34D399"), border: "rgba(52,211,153,.34)" },
  warn: { fg: "#FBBF24", bg: wash("#FBBF24"), border: "rgba(251,191,36,.34)" },
  fail: { fg: "#F87171", bg: wash("#F87171"), border: "rgba(248,113,113,.34)" },
  block: { fg: "#FBBF24", bg: wash("#FBBF24"), border: "rgba(251,191,36,.34)" },
  skip: { fg: C.muted, bg: "transparent", border: C.border },
  neutral: { fg: C.sub, bg: "rgba(255,255,255,.05)", border: C.border },
  green: { fg: "#34D399", bg: wash("#34D399"), border: "rgba(52,211,153,.34)" },
  red: { fg: "#F87171", bg: wash("#F87171"), border: "rgba(248,113,113,.34)" },
  amber: { fg: "#FBBF24", bg: wash("#FBBF24"), border: "rgba(251,191,36,.34)" },
  orange: { fg: "#FB923C", bg: wash("#F97316"), border: "rgba(249,115,22,.34)" },
} as const;

export type ToneKey = keyof typeof TONE;

export const BACKEND_TONE: Record<string, ToneKey> = {
  live: "green",
  sandbox: "orange",
  cached: "amber",
  template: "neutral",
  keyword: "neutral",
};

export function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}
