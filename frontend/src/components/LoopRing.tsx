import { C } from "../theme";

// The seven working agents as a left-to-right flow with a return arc from
// Payday back to Ghost/Scout — the closed loop, made literal. The active
// step glows; on the final step the feedback arc lights up.
const FLOW = [
  { key: "SCOUT", name: "Scout", short: "hunts" },
  { key: "MARGIN", name: "Margin", short: "math" },
  { key: "GHOST", name: "Ghost", short: "fraud" },
  { key: "HAND", name: "Handshake", short: "deal" },
  { key: "FINE", name: "Fine Print", short: "audit" },
  { key: "MILE", name: "Mile Marker", short: "trip" },
  { key: "PAY", name: "Payday", short: "paid" },
];

export function LoopRing({ active, loopHot }: { active: string[]; loopHot: boolean }) {
  return (
    <div style={{ position: "relative", padding: "6px 4px 30px" }}>
      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        {FLOW.map((a, i) => {
          const on = active.includes(a.key);
          const isGhost = a.key === "GHOST";
          return (
            <div key={a.key} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
              <div style={{
                flex: 1, minWidth: 0, textAlign: "center", borderRadius: 10, padding: "10px 4px",
                background: on ? (isGhost ? "#FEF2F2" : "#FFF7ED") : "#fff",
                border: `1px solid ${on ? (isGhost ? "#FECACA" : "#FED7AA") : C.border}`,
                boxShadow: on ? "0 2px 10px rgba(234,88,12,.12)" : "none",
                transition: "all .3s",
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 7, margin: "0 auto 5px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Geist Mono',monospace", fontSize: 11, fontWeight: 600,
                  background: on ? (isGhost ? "#DC2626" : "#EA580C") : "#F5F5F4",
                  color: on ? "#fff" : C.muted,
                }}>{i + 1}</div>
                <div style={{ fontSize: 11.5, fontWeight: on ? 600 : 500, color: on ? (isGhost ? "#B91C1C" : C.orangeDk) : C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{a.short}</div>
              </div>
              {i < FLOW.length - 1 && (
                <div style={{ flex: "none", width: 16, textAlign: "center", color: on || active.includes(FLOW[i + 1].key) ? C.orange : "#D6D3D1", fontSize: 13 }}>→</div>
              )}
            </div>
          );
        })}
      </div>
      {/* return arc: Payday → back to Ghost, the feedback that closes the loop */}
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 26, overflow: "visible" }}>
        <path d="M 93 1 C 93 9, 36 9, 36 2" fill="none"
          stroke={loopHot ? "#EA580C" : "#E7E5E4"} strokeWidth={loopHot ? 0.9 : 0.6}
          strokeDasharray={loopHot ? "0" : "1.5 1.5"} vectorEffect="non-scaling-stroke"
          markerEnd="url(#arrow)" style={{ transition: "stroke .4s" }} />
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={loopHot ? "#EA580C" : "#E7E5E4"} />
          </marker>
        </defs>
      </svg>
      <div style={{ position: "absolute", bottom: -2, left: 0, right: 0, textAlign: "center", fontSize: 10.5, color: loopHot ? C.orange : C.muted, fontWeight: loopHot ? 600 : 400, transition: "color .4s" }}>
        Payday teaches Ghost — slow payers become risk scores on the next run
      </div>
    </div>
  );
}
