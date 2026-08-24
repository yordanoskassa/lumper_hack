import type { CSSProperties, ReactNode } from "react";
import { C, TONE, type ToneKey } from "../theme";

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

export function CardHead({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ padding: "12px 15px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.hair}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{sub}</div>}
      </div>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral", style }: { children: ReactNode; tone?: ToneKey; style?: CSSProperties }) {
  const t = TONE[tone];
  return (
    <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 500, color: t.fg, background: t.bg, border: `1px solid ${t.border}`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", ...style }}>
      {children}
    </span>
  );
}

export function Dot({ color = "#16A34A", anim }: { color?: string; anim?: boolean }) {
  return <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", animation: anim ? "pulse 1.2s ease-in-out infinite" : undefined }} />;
}

export function Btn({ children, onClick, kind = "ghost", disabled, style }: {
  children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; style?: CSSProperties;
}) {
  const base: CSSProperties = { fontSize: 12.5, fontWeight: 500, padding: "8px 13px", borderRadius: 8, whiteSpace: "nowrap", transition: "background .12s" };
  const kinds: Record<string, CSSProperties> = {
    primary: { background: disabled ? "#fff" : C.black, color: disabled ? C.muted : "#fff", border: `1px solid ${disabled ? C.border : C.black}` },
    ghost: { background: "#fff", color: C.black, border: `1px solid ${C.border}` },
    danger: { background: "#fff", color: "#DC2626", border: "1px solid #FECACA" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...kinds[kind], cursor: disabled ? "default" : "pointer", ...style }}>
      {children}
    </button>
  );
}

export function BackendTag({ backend }: { backend?: string }) {
  if (!backend) return null;
  const map: Record<string, ToneKey> = { live: "green", sandbox: "orange", cached: "amber", template: "neutral", keyword: "neutral" };
  const label: Record<string, string> = { live: "LIVE", sandbox: "SANDBOX", cached: "CACHED", template: "TEMPLATE", keyword: "KEYWORD" };
  return <Pill tone={map[backend] ?? "neutral"} style={{ fontSize: 9, letterSpacing: ".04em" }}>{label[backend] ?? backend.toUpperCase()}</Pill>;
}
