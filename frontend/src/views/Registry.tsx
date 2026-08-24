import { useEffect, useState } from "react";
import type { AgentCard } from "../api";
import { api } from "../api";
import { C, TONE } from "../theme";
import { Card, CardHead, Pill } from "../components/ui";

const PUBLISHER = "Lumper Logistics LLC";
const INTEGRATIONS = ["gemini", "maps", "eia", "fmcsa"] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{value}</span>
      <span style={{ fontSize: 10.5, color: C.muted }}>{label}</span>
    </div>
  );
}

export function Registry() {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    api.registry().then((r) => { if (alive) setAgents(r.agents); }).catch(() => {});
    api.health().then((h) => { if (alive) setHealth(h); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const query = q.trim().toLowerCase();
  const filtered = agents.filter((a) =>
    !query ||
    a.name.toLowerCase().includes(query) ||
    a.role.toLowerCase().includes(query) ||
    a.badge.toLowerCase().includes(query) ||
    a.tools.some((t) => t.toLowerCase().includes(query))
  );

  const integrations = health?.integrations ?? {};
  const loading = agents.length === 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.025em", color: C.ink }}>Agent Registry</div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>
            Corporate agent discovery · versioning · scope-audited
          </div>
        </div>

        {/* Platform health */}
        <div style={{ flex: "0 1 auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", minWidth: 220 }}>
          <SectionLabel>Platform health</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,auto)", gap: "6px 14px" }}>
            {INTEGRATIONS.map((k) => {
              const on = !!integrations[k];
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="mono" style={{ fontSize: 11, color: C.slate }}>{k}</span>
                  <Pill tone={on ? "green" : "neutral"} style={{ fontSize: 9, letterSpacing: ".04em" }}>{on ? "LIVE" : "FALLBACK"}</Pill>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: `1px solid ${C.hair}`, marginTop: 9, paddingTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 10.5 }}>
              <span style={{ color: C.muted }}>memory</span>
              <span className="mono" style={{ color: C.body }}>{health?.memory ?? "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 10.5 }}>
              <span style={{ color: C.muted }}>model</span>
              <span className="mono" style={{ color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{health?.model ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search agents by name, role, badge, or tool…"
          style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, background: "#fff", color: C.ink }}
        />
        <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap" }}>
          {loading ? "loading…" : `${filtered.length} of ${agents.length} agents`}
        </span>
      </div>

      {/* Discovery cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && (
          <Card><div className="mono" style={{ padding: "18px 15px", fontSize: 12, color: C.muted }}>discovering agents<span style={{ animation: "blink 1s step-end infinite" }}>_</span></div></Card>
        )}

        {!loading && filtered.length === 0 && (
          <Card><div style={{ padding: "18px 15px", fontSize: 12.5, color: C.muted }}>No agents match “{q}”.</div></Card>
        )}

        {filtered.map((a, i) => {
          const isOpen = !!open[a.key];
          return (
            <Card key={a.key} style={{ animation: "cardIn .3s ease both", animationDelay: `${Math.min(i, 8) * 25}ms` }}>
              {/* Summary row — click to discover */}
              <div
                onClick={() => setOpen((o) => ({ ...o, [a.key]: !o[a.key] }))}
                style={{ padding: "13px 15px", display: "flex", gap: 14, alignItems: "center", cursor: "pointer" }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{a.name}</span>
                    <Pill tone="neutral" style={{ fontFamily: "'Geist Mono',monospace" }}>v{a.version}</Pill>
                    <Pill tone="orange">{a.badge}</Pill>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                    {a.role}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 5 }}>
                    publisher: <span style={{ color: C.slate }}>{PUBLISHER}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16, flex: "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <Stat label="tools" value={a.tools.length} />
                    <Stat label="scopes" value={a.scopes.length} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.orange, whiteSpace: "nowrap" }}>
                    {isOpen ? "Hide ▲" : "Discover →"}
                  </span>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.hair}`, background: C.faint, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 13 }}>
                  <div style={{ fontSize: 12.5, color: C.body, lineHeight: 1.5 }}>{a.role}</div>

                  <div>
                    <SectionLabel>Zero-trust scopes · enforced by the Gateway</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {a.scopes.map((s) => (
                        <span key={s} className="mono" style={{ fontSize: 10.5, color: TONE.orange.fg, background: "#fff", border: `1px solid ${TONE.orange.border}`, borderRadius: 6, padding: "2px 7px" }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Tools</SectionLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {a.tools.map((t) => (
                        <span key={t} className="mono" style={{ fontSize: 11, color: C.slate, background: "#fff", border: `1px solid ${C.border2}`, borderRadius: 6, padding: "3px 7px" }}>{t}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: C.sub, borderTop: `1px solid ${C.hair}`, paddingTop: 10 }}>
                    <span>Hands to <span style={{ color: C.orange, fontWeight: 600 }}>→ {a.handoff}</span></span>
                    <span style={{ color: C.muted }}>key <span className="mono" style={{ color: C.slate }}>{a.key}</span></span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
