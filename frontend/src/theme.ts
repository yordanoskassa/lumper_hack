// Design tokens lifted from the Lumper Sentinel Claude Design project so the
// React build matches the artboards exactly.
export const C = {
  bg: "#F7F7F6",
  ink: "#0C0A09",
  card: "#ffffff",
  border: "#E7E5E4",
  border2: "#EBE9E7",
  hair: "#F5F5F4",
  faint: "#FAFAF9",
  muted: "#A8A29E",
  sub: "#78716C",
  body: "#44403C",
  slate: "#57534E",
  black: "#1C1917",
  orange: "#EA580C",
  orangeDk: "#9A3412",
} as const;

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
