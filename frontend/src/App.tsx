import { useEffect, useState } from "react";
import { api, type Desk as DeskData, type TraceEvent } from "./api";
import { C } from "./theme";
import { useStream } from "./useStream";
import { Desk } from "./views/Desk";
import { Fleet } from "./views/Fleet";
import { Registry } from "./views/Registry";
import { Chat } from "./components/Chat";

type View = "desk" | "fleet" | "registry";

const NAV: { key: View; label: string; d: string }[] = [
  { key: "desk", label: "Desk", d: "M1 4h8v7H1zM9 7h3l2 2v2H9zM4 13a1.3 1.3 0 100-2.6A1.3 1.3 0 004 13zM11.5 13a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6" },
  { key: "fleet", label: "Fleet", d: "M6 7a2.2 2.2 0 100-4.4A2.2 2.2 0 006 7zM2 14c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M11 4.5a2 2 0 010 4M12 14c0-1.8-.6-2.7-1.5-3.3" },
  { key: "registry", label: "Registry", d: "M4 2h5l3 3v9H4zM9 2v3h3M6 8h4M6 11h4" },
];

const ROSTER = ["Yard Boss", "Scout", "Margin", "Ghost", "Handshake", "Fine Print", "Mile Marker", "Payday"];

export default function App() {
  const [view, setView] = useState<View>("desk");
  const [deskFromStream, setDeskFromStream] = useState<DeskData | null>(null);
  const [chatFeed, setChatFeed] = useState<{ role: string; text: string }[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeAgents, setActiveAgents] = useState<Record<string, number>>({});

  const { trace, connected } = useStream(
    (_runId, state) => { if (state.desk) setDeskFromStream(state.desk); },
    (e) => { if (e.role && e.text) setChatFeed((f) => [...f, { role: e.role === "user" ? "user" : "assistant", text: e.text! }]); },
  );

  useEffect(() => { refreshMeta(); }, []);
  // mark agents active as their trace lines arrive (for the live roster dots)
  useEffect(() => {
    const last = trace[trace.length - 1];
    if (last?.agent) {
      setActiveAgents((a) => ({ ...a, [last.agent!]: Date.now() }));
    }
  }, [trace.length]);

  async function refreshMeta() {
    try { setTenant(await api.tenant()); setHealth(await api.health()); } catch {}
  }

  const now = Date.now();

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: "232px minmax(0,1fr)", background: C.bg, overflow: "hidden" }}>
      {/* SIDEBAR */}
      <div style={{ background: "#fff", borderRight: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 14px 13px" }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: C.black, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14 }}>L</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-.015em" }}>Sentinel</div>
            <div style={{ fontSize: 10.5, color: C.muted }}>Autonomous freight desk</div>
          </div>
        </div>

        <SideLabel>Workspace</SideLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 8px" }}>
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", borderRadius: 8, textAlign: "left",
              fontSize: 13.5, fontWeight: view === n.key ? 600 : 400,
              color: view === n.key ? C.orangeDk : C.body, background: view === n.key ? "#FFF7ED" : "transparent",
            }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={view === n.key ? C.orange : C.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={n.d} /></svg>
              {n.label}
            </button>
          ))}
        </div>

        <SideLabel>Fleet</SideLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 8px" }}>
          {ROSTER.map((name) => {
            const active = activeAgents[name] && now - activeAgents[name] < 3500;
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#F97316" : "#16A34A", animation: active ? "pulse 1.2s ease-in-out infinite" : undefined, flex: "none" }} />
                <span style={{ fontSize: 12.5, color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
              </div>
            );
          })}
        </div>

        <SideLabel>Memory graph</SideLabel>
        <div style={{ margin: "0 12px", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <GraphRow k="Broker records" v={tenant?.graph?.brokers ?? "—"} />
          <GraphRow k="Flagged shells" v={tenant?.graph?.flagged ?? 0} fg={tenant?.graph?.flagged ? "#DC2626" : undefined} />
          <GraphRow k="Shared ACH nodes" v={tenant?.graph?.shared_ach_nodes ?? "—"} fg="#B45309" />
          <GraphRow k="Unpaid on record" v={tenant?.graph?.unpaid ? `$${tenant.graph.unpaid.toLocaleString()}` : "$0"} fg={tenant?.graph?.unpaid ? "#DC2626" : undefined} />
          <GraphRow k="Memory Bank" v={health?.memory ?? "—"} />
        </div>

        {tenant?.tenant?.truck && (
          <>
            <SideLabel>Truck {tenant.tenant.truck.id} · {tenant.tenant.truck.driver}</SideLabel>
            <div style={{ margin: "0 12px 12px", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 11px" }}>
              <div style={{ fontSize: 11.5, color: C.sub }}>Drive time left today</div>
              <div className="mono" style={{ fontSize: 19, marginTop: 3 }}>{Math.floor(tenant.tenant.truck.hos_left_h)}h {Math.round((tenant.tenant.truck.hos_left_h % 1) * 60)}m</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Empty in {tenant.tenant.truck.empty_in_h.toFixed(1)}h · {tenant.tenant.truck.city}</div>
            </div>
          </>
        )}

        <div style={{ marginTop: "auto", borderTop: `1px solid ${C.border2}`, padding: "10px 14px", fontSize: 11, color: C.muted }}>
          {tenant?.tenant?.name ?? "K&M Hauling"} · {tenant?.tenant?.trucks ?? 3} trucks
        </div>
      </div>

      {/* MAIN */}
      <div style={{ overflowY: "auto", minWidth: 0, position: "relative" }}>
        {view === "desk" && <Desk trace={trace} connected={connected} deskFromStream={deskFromStream} />}
        {view === "fleet" && <Fleet trace={trace} />}
        {view === "registry" && <Registry />}

        {/* Yard Boss chat dock */}
        <div style={{ position: "fixed", right: 20, bottom: 20, width: chatOpen ? 380 : "auto", maxHeight: "78vh", display: "flex", flexDirection: "column", zIndex: 50 }}>
          {chatOpen ? (
            <div style={{ display: "flex", flexDirection: "column", height: "70vh", boxShadow: "0 12px 40px rgba(0,0,0,.16)", borderRadius: 12 }}>
              <button onClick={() => setChatOpen(false)} style={{ position: "absolute", top: 10, right: 12, fontSize: 16, color: C.muted, zIndex: 2 }}>✕</button>
              <Chat chatFeed={chatFeed} onRoute={() => { if (view !== "desk") setView("desk"); }} />
            </div>
          ) : (
            <button onClick={() => setChatOpen(true)} style={{ display: "flex", alignItems: "center", gap: 9, background: C.black, color: "#fff", borderRadius: 999, padding: "12px 18px", fontSize: 13, fontWeight: 500, boxShadow: "0 8px 24px rgba(0,0,0,.18)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F97316" }} /> Ask Yard Boss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SideLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "14px 16px 5px", fontSize: 11, fontWeight: 500, color: C.muted }}>{children}</div>;
}

function GraphRow({ k, v, fg }: { k: string; v: any; fg?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 11px", borderTop: `1px solid ${C.hair}`, fontSize: 11.5 }}>
      <span style={{ color: C.sub }}>{k}</span>
      <span className="mono" style={{ color: fg ?? C.ink }}>{v}</span>
    </div>
  );
}
