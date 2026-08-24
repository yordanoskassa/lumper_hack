import { useEffect, useRef } from "react";
import type { TraceEvent } from "../api";
import { C, TONE } from "../theme";
import { BackendTag } from "./ui";

const AGENT_FG: Record<string, string> = {
  "Yard Boss": "#57534E", Scout: "#57534E", Margin: "#0369A1", Ghost: "#EA580C",
  Handshake: "#7C3AED", "Fine Print": "#B45309", "Mile Marker: ": "#0891B2",
  "Mile Marker": "#0891B2", Payday: "#15803D", Gateway: "#DC2626",
  "Model Armor": "#B45309", Gmail: "#78716C",
};

export function Trace({ trace, connected, height = 460 }: { trace: TraceEvent[]; connected: boolean; height?: number | string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [trace.length]);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: height, minHeight: 220 }}>
      <div style={{ padding: "12px 15px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.hair}` }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Live trace</div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 11, color: C.muted }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#16A34A" : "#DC2626" }} />
          {connected ? "streaming" : "offline"} · {trace.length}
        </span>
      </div>
      <div ref={ref} style={{ overflowY: "auto", flex: 1 }}>
        {trace.length === 0 && (
          <div style={{ padding: "18px 15px", fontSize: 12, color: C.muted, fontFamily: "'Geist Mono',monospace" }}>
            awaiting fleet activity<span style={{ animation: "blink 1s step-end infinite" }}>_</span>
          </div>
        )}
        {trace.map((e) => {
          const tone = TONE[(e.tone as keyof typeof TONE) ?? "ok"] ?? TONE.ok;
          const bg = e.tone && e.tone !== "ok" ? tone.bg : "transparent";
          const agentFg = AGENT_FG[e.agent ?? ""] ?? "#57534E";
          return (
            <div key={e.seq} style={{ display: "flex", gap: 9, padding: "8px 14px", borderBottom: `1px solid ${C.hair}`, background: bg, animation: "rise .22s ease both" }}>
              <div className="mono" style={{ fontSize: 10, color: "#C3BFBB", paddingTop: 2, flex: "none", width: 52 }}>{e.clock}</div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: agentFg, minWidth: 74, paddingTop: 2, flex: "none" }}>{e.agent}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="mono" style={{ fontSize: 11, lineHeight: 1.5, color: e.tone && e.tone !== "ok" ? tone.fg : C.body, overflowWrap: "break-word" }}>
                  {e.msg}
                </div>
                {(e.backend || e.latency_ms != null) && (
                  <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
                    {e.tool && <span className="mono" style={{ fontSize: 9.5, color: C.muted }}>{e.tool}</span>}
                    <BackendTag backend={e.backend} />
                    {e.latency_ms != null && <span className="mono" style={{ fontSize: 9.5, color: "#D6D3D1" }}>{e.latency_ms}ms</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "9px 15px", background: C.faint, borderTop: `1px solid ${C.hair}`, fontSize: 11, color: C.muted, display: "flex", justifyContent: "space-between" }}>
        <span>Agent Gateway · Identity · Runtime</span>
        <span>Model Armor <span style={{ color: "#16A34A" }}>inline</span></span>
      </div>
    </div>
  );
}
