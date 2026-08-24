import { useEffect, useState } from "react";
import { C } from "../theme";

export interface DetentionState {
  active: boolean;
  posting_id?: string;
  stop?: string;
  arrived_at?: number;
  free_minutes?: number;
  minutes_on_site?: number;
  billable_minutes?: number;
  rate_per_hour?: number;
  owed?: number;
  notice_sent?: boolean;
  status?: "WAITING" | "FREE_WINDOW" | "METER_RUNNING" | "NOTICE_SENT" | "CLAIM_FILED" | "PAID";
  timeline?: { ts: number; label: string; kind?: string }[];
}

const STATUS_COPY: Record<string, { line: string; tone: string; bg: string }> = {
  WAITING: { line: "Waiting to be unloaded", tone: "#9A9A98", bg: "rgba(255,255,255,.06)" },
  FREE_WINDOW: { line: "Free waiting time", tone: "#9A9A98", bg: "rgba(255,255,255,.06)" },
  METER_RUNNING: { line: "They owe you now", tone: "#F97316", bg: "rgba(249,115,22,.14)" },
  NOTICE_SENT: { line: "Broker has been told", tone: "#F59E0B", bg: "rgba(245,158,11,.14)" },
  CLAIM_FILED: { line: "Claim filed for you", tone: "#F59E0B", bg: "rgba(245,158,11,.14)" },
  PAID: { line: "Detention paid", tone: "#34D399", bg: "rgba(52,211,153,.14)" },
};

function hhmm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** The clock the driver never keeps and the broker counts on them not keeping.
 *  Ticks locally between polls so it reads as live, not as a refreshing table. */
export function DetentionCard({ d }: { d: DetentionState }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const free = d.free_minutes ?? 120;
  const onSite = d.minutes_on_site ?? 0;
  const rate = d.rate_per_hour ?? 50;
  const billable = Math.max(0, onSite - free);
  const owed = d.owed ?? (billable / 60) * rate;
  const s = STATUS_COPY[d.status ?? "WAITING"] ?? STATUS_COPY.WAITING;
  const pastFree = onSite > free;
  // Before the window closes the bar fills toward it; after, it splits the whole
  // stay into free vs. billable so the orange share grows as the money does.
  const freePct = pastFree ? (free / onSite) * 100 : (onSite / free) * 100;

  return (
    <div style={{ background: C.dCard, borderRadius: 16, padding: 18, border: `1px solid ${C.dBorder}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
          color: s.tone, background: s.bg, padding: "5px 10px", borderRadius: 999,
        }}>
          {s.line}
        </span>
        {d.status === "METER_RUNNING" && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F97316",
            animation: "pulse 1.2s ease-in-out infinite" }} />
        )}
      </div>

      <div style={{ fontSize: 13, color: C.dSub, marginBottom: 3 }}>
        Sitting at {d.stop ?? "the dock"}
      </div>
      <div className="num" style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-.04em",
        color: C.dText, lineHeight: 1 }}>
        {hhmm(onSite)}
      </div>

      {/* free window, then the meter */}
      <div style={{ marginTop: 16, height: 8, borderRadius: 999, background: "rgba(255,255,255,.08)",
        overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${freePct}%`, background: "#5C5C58", transition: "width .6s ease-out" }} />
        {pastFree && (
          <div style={{ flex: 1, background: "linear-gradient(90deg,#F97316,#F59E0B)",
            transition: "width .6s ease-out" }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7,
        fontSize: 11.5, color: C.dSub }}>
        <span>First {hhmm(free)} free</span>
        <span>${rate}/hour after</span>
      </div>

      {pastFree && (
        <div style={{
          marginTop: 16, padding: "14px 16px", borderRadius: 12,
          background: "rgba(249,115,22,.10)", border: "1px solid rgba(249,115,22,.28)",
        }}>
          <div style={{ fontSize: 12.5, color: "#FDBA74", marginBottom: 2 }}>They owe you</div>
          <div className="num" style={{ fontSize: 34, fontWeight: 600, color: "#F97316",
            letterSpacing: "-.03em", lineHeight: 1.05 }}>
            ${owed.toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: "#FDBA74", opacity: .85, marginTop: 4 }}>
            {hhmm(billable)} past the free window
          </div>
        </div>
      )}

      {!!d.timeline?.length && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em",
            textTransform: "uppercase", color: C.dSub, marginBottom: 10 }}>
            What your agent did
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {d.timeline.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                  alignSelf: "stretch" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5,
                    background: t.kind === "money" ? "#F97316" : t.kind === "ok" ? "#34D399" : "#5C5C58",
                    flex: "none" }} />
                  {i < d.timeline!.length - 1 && (
                    <span style={{ width: 1.5, flex: 1, minHeight: 16,
                      background: "rgba(255,255,255,.12)" }} />
                  )}
                </div>
                <div style={{ paddingBottom: 12, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.dText, lineHeight: 1.35 }}>{t.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
