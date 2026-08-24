import { useEffect, useState } from "react";
import type { AgentCard, TraceEvent } from "../api";
import { api } from "../api";
import { C, TONE } from "../theme";
import { Card, CardHead, Pill } from "../components/ui";

// The four feedback edges that close the loop — each downstream agent teaches
// an upstream one, so the fleet gets smarter every run.
const LOOP_EDGES: { from: string; to: string; desc: string }[] = [
  { from: "Payday", to: "Ghost", desc: "Slow payers become risk scores." },
  { from: "Margin", to: "Handshake", desc: "Lane history sets the anchor." },
  { from: "Handshake", to: "Fine Print", desc: "Locked terms are what the audit checks." },
  { from: "Ghost", to: "Scout", desc: "Blacklisted brokers filtered before Margin spends a call." },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
      {children}
    </div>
  );
}

export function Fleet({ trace }: { trace: TraceEvent[] }) {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [hov, setHov] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api.registry().then((r) => { if (alive) setAgents(r.agents); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Live activity per agent, keyed by name — lights up as the trace streams in.
  const activity: Record<string, number> = {};
  for (const e of trace) if (e.agent) activity[e.agent] = (activity[e.agent] ?? 0) + 1;

  const loading = agents.length === 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.025em", color: C.ink }}>The fleet</div>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>
          Yard Boss routes · every agent feeds the next · every tool call goes through the Gateway
        </div>
      </div>

      {/* Handoff chain */}
      <Card style={{ animation: "cardIn .3s ease both" }}>
        <CardHead title="Handoff chain" sub="Scout hunts → Margin does the math → Ghost screens → the paper and the money follow" right={<Pill tone="orange">8 agents</Pill>} />
        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
          {loading && <div className="mono" style={{ fontSize: 11.5, color: C.muted, padding: "6px 2px" }}>loading fleet<span style={{ animation: "blink 1s step-end infinite" }}>_</span></div>}
          {agents.map((a, i) => {
            const on = hov === i;
            return (
              <div
                key={a.key}
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
                style={{
                  position: "relative", overflow: "hidden", background: on ? "#fff" : C.card,
                  border: `1px solid ${on ? C.orange : C.border}`, borderRadius: 10, padding: "10px 12px",
                  boxShadow: on ? "0 2px 10px rgba(234,88,12,.10)" : "none",
                  transform: on ? "translateY(-1px)" : "none", transition: "border-color .15s, box-shadow .15s, transform .15s",
                }}
              >
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.orange, opacity: on ? 1 : 0, transition: "opacity .15s" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: C.black, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 600, flex: "none" }}>{i + 1}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 5 }}>{a.badge}</div>
                <div style={{ fontSize: 10.5, color: C.orange, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.handoff}>
                  → {a.handoff}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Agent cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
        {agents.map((a, i) => {
          const count = activity[a.name] ?? 0;
          return (
            <Card key={a.key} style={{ display: "flex", flexDirection: "column", animation: "cardIn .3s ease both", animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <CardHead
                title={
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</span>
                    <Pill tone="neutral" style={{ fontFamily: "'Geist Mono',monospace" }}>v{a.version}</Pill>
                  </span>
                }
                right={
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {count > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.orange }} title={`${count} trace events`}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.orange, animation: "pulse 1.2s ease-in-out infinite" }} />
                        <span className="mono">{count}</span>
                      </span>
                    )}
                    <Pill tone="neutral">{a.badge}</Pill>
                  </div>
                }
              />
              <div style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 13, flex: 1 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: C.sub }}>{a.role}</div>

                <div>
                  <SectionLabel>Tools</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {a.tools.map((t) => (
                      <span key={t} className="mono" style={{ fontSize: 11, color: C.slate, background: C.faint, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "3px 7px" }}>{t}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <SectionLabel>Gateway scopes</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {a.scopes.map((s) => (
                      <span key={s} className="mono" style={{ fontSize: 10.5, color: TONE.orange.fg, background: TONE.orange.bg, border: `1px solid ${TONE.orange.border}`, borderRadius: 6, padding: "2px 7px" }}>{s}</span>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${C.hair}` }}>
                  <div style={{ fontSize: 12, color: C.body }}>
                    Hands to <span style={{ color: C.orange, fontWeight: 600 }}>→ {a.handoff}</span>
                  </div>
                  {a.loop && (
                    <div style={{ marginTop: 6 }}>
                      <SectionLabel>Closed loop</SectionLabel>
                      <div style={{ fontSize: 11.5, color: C.muted, fontStyle: "italic", lineHeight: 1.45 }}>{a.loop}</div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Closed loop */}
      <Card style={{ animation: "cardIn .3s ease both" }}>
        <CardHead title="Closed loop" sub="The fleet feeds itself — every run teaches the next one" right={<Pill tone="orange">self-improving</Pill>} />
        <div>
          {LOOP_EDGES.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 15px", borderBottom: i < LOOP_EDGES.length - 1 ? `1px solid ${C.hair}` : "none", alignItems: "flex-start" }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", background: TONE.orange.bg, border: `1px solid ${TONE.orange.border}`, color: C.orange, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>↺</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                  {e.from} <span style={{ color: C.orange }}>→</span> {e.to}
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{e.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
