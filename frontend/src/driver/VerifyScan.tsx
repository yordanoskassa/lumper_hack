import { useEffect, useState } from "react";
import { C } from "../theme";

export interface Check {
  q: string;          // plain English, what a bystander understands
  detail: string;     // the actual source, so it reads as real work
  verdict: "pass" | "fail" | "warn";
  found?: string;     // the damning line, when there is one
}

const TONE = {
  pass: { fg: "#34D399", label: "OK" },
  warn: { fg: "#F59E0B", label: "ODD" },
  fail: { fg: "#F87171", label: "BAD" },
};

/** The security sweep. Deliberately the only place in the product that looks
 *  like a terminal — this is the moment we want to feel like a background check,
 *  not a freight app. Everywhere else keeps the calm Lumper surface. */
export function VerifyScan({
  broker,
  checks,
  onDone,
  stepMs = 620,
}: {
  broker: string;
  checks: Check[];
  onDone?: (blocked: boolean) => void;
  stepMs?: number;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= checks.length) {
      const t = setTimeout(() => onDone?.(checks.some((c) => c.verdict === "fail")), 1100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((n) => n + 1), stepMs);
    return () => clearTimeout(t);
  }, [shown, checks.length, stepMs]);

  const done = shown >= checks.length;
  const blocked = done && checks.some((c) => c.verdict === "fail");

  return (
    <div style={{
      position: "absolute", inset: 0, background: "#0B0B0E", zIndex: 20,
      display: "flex", flexDirection: "column", padding: "26px 20px", overflow: "hidden",
    }}>
      {/* faint scanline field */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, rgba(52,211,153,.045) 0 1px, transparent 1px 3px)",
      }} />

      <div style={{ position: "relative" }}>
        <div className="mono" style={{
          fontSize: 10.5, letterSpacing: ".14em", color: "#34D399", opacity: .8,
        }}>
          BACKGROUND CHECK RUNNING
        </div>
        <div style={{
          fontSize: 21, fontWeight: 600, color: C.dText, marginTop: 6,
          letterSpacing: "-.03em", lineHeight: 1.2,
        }}>
          {broker}
        </div>
      </div>

      <div style={{ position: "relative", marginTop: 24, display: "flex",
        flexDirection: "column", gap: 2, flex: 1 }}>
        {checks.map((c, i) => {
          const state = i < shown ? "done" : i === shown ? "running" : "idle";
          if (state === "idle") return null;
          const t = TONE[c.verdict];
          return (
            <div key={i} className="scan-row" style={{
              padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,.06)",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 14.5, color: C.dText, fontWeight: 500, flex: 1,
                  lineHeight: 1.3 }}>
                  {c.q}
                </span>
                {state === "running" ? (
                  <span className="mono blink" style={{ fontSize: 11, color: "#34D399" }}>···</span>
                ) : (
                  <span className="mono" style={{
                    fontSize: 10.5, fontWeight: 600, letterSpacing: ".1em", color: t.fg,
                    border: `1px solid ${t.fg}44`, background: `${t.fg}14`,
                    padding: "3px 7px", borderRadius: 5,
                  }}>
                    {t.label}
                  </span>
                )}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "#6F6F6C", marginTop: 4 }}>
                {c.detail}
              </div>
              {state === "done" && c.found && (
                <div className="mono" style={{
                  fontSize: 11.5, color: t.fg, marginTop: 7, padding: "8px 10px",
                  background: `${t.fg}12`, border: `1px solid ${t.fg}33`, borderRadius: 7,
                  lineHeight: 1.5,
                }}>
                  {c.found}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {done && (
        <div className="scan-row" style={{
          position: "relative", marginTop: 16, padding: "18px 18px", borderRadius: 14,
          background: blocked ? "rgba(248,113,113,.12)" : "rgba(52,211,153,.12)",
          border: `1px solid ${blocked ? "rgba(248,113,113,.4)" : "rgba(52,211,153,.4)"}`,
        }}>
          <div style={{
            fontSize: 26, fontWeight: 600, letterSpacing: "-.035em",
            color: blocked ? "#F87171" : "#34D399", lineHeight: 1.1,
          }}>
            {blocked ? "We blocked this load" : "This one is safe"}
          </div>
          <div style={{ fontSize: 14, color: C.dSub, marginTop: 6, lineHeight: 1.4 }}>
            {blocked
              ? "You would have hauled it and never been paid."
              : "Real company. They pay. Go get it."}
          </div>
        </div>
      )}
    </div>
  );
}
