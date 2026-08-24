// Design tokens matched to the shipping Lumper product
// (lumper_app/frontend/src/index.css + DESIGN.md, and lumper_mobile/src/theme.ts).
export const C = {
  bg: "#FAFAFA",
  ink: "#0A0A0A",
  card: "#ffffff",
  border: "#E4E4E2",
  border2: "#EBE9E7",
  hair: "#EFEFED",
  faint: "#F1F1EF",
  muted: "#8A8A86",
  sub: "#6B6B68",
  body: "#44403C",
  slate: "#57534E",
  black: "#1E1E1E",
  orange: "#EA580C",
  orangeDk: "#9A3412",
  brand: "#F97316",
  brandTint: "rgba(249,115,22,0.10)",
  // Driver surfaces run dark: warm near-black, never #000.
  dBg: "#1E1E1E",
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

export const TONE = {
  ok: { fg: "#44403C", bg: "transparent", border: C.border },
  pass: { fg: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" },
  warn: { fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  fail: { fg: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  block: { fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  skip: { fg: "#A8A29E", bg: "transparent", border: C.border },
  neutral: { fg: "#57534E", bg: "#FAFAF9", border: C.border },
  green: { fg: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" },
  red: { fg: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  amber: { fg: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  orange: { fg: "#EA580C", bg: "#FFF7ED", border: "#FED7AA" },
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
