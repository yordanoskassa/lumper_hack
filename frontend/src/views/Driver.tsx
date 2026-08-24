import type { ReactNode } from "react";
import { C } from "../theme";
import { DriverApp } from "../driver/DriverApp";
import { Trace } from "../components/Trace";
import type { TraceEvent } from "../api";

/** Judges never install anything. The phone lives on the same screen as the
 *  desk, so one recording shows the driver's side and the agents' side at once. */
export function Driver({ trace, connected }: { trace: TraceEvent[]; connected: boolean }) {
  return (
    <div style={{
      height: "100%", display: "grid", gridTemplateColumns: "minmax(380px,440px) minmax(0,1fr)",
      gap: 26, padding: 26, background: C.bg, overflow: "hidden",
    }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Phone>
          <DriverApp />
        </Phone>
      </div>

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".14em",
            textTransform: "uppercase", color: C.muted }}>
            What the driver never sees
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.03em", marginTop: 4 }}>
            The agents, working
          </div>
          <div style={{ fontSize: 13.5, color: C.sub, marginTop: 5, lineHeight: 1.5, maxWidth: 560 }}>
            Every line below is a real tool call, tagged with where the answer came from.
            The phone on the left shows only the outcome.
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Trace trace={trace} connected={connected} height="100%" />
        </div>
      </div>
    </div>
  );
}

/** A device shell, not a skeuomorphic toy: 9.5:19.5, real corner radius, a
 *  notch, and a home indicator — just enough that a viewer reads "phone". */
function Phone({ children }: { children: ReactNode }) {
  return (
    <div style={{
      width: "100%", maxWidth: 400, aspectRatio: "9.5 / 19.5", margin: "0 auto",
      borderRadius: 46, padding: 11, background: "linear-gradient(160deg,#3A3A42,#141417 40%,#26262C)",
      boxShadow: "0 30px 70px -20px rgba(10,10,12,.55), 0 0 0 1px rgba(255,255,255,.05) inset",
      flex: "0 1 auto", minHeight: 0,
    }}>
      <div style={{
        position: "relative", height: "100%", borderRadius: 36, overflow: "hidden",
        background: C.dBg, boxShadow: "0 0 0 1px rgba(0,0,0,.6)",
      }}>
        {children}
        {/* notch */}
        <div style={{
          position: "absolute", top: 9, left: "50%", transform: "translateX(-50%)",
          width: 96, height: 26, borderRadius: 999, background: "#0B0B0E", zIndex: 40,
          pointerEvents: "none",
        }} />
        {/* home indicator */}
        <div style={{
          position: "absolute", bottom: 7, left: "50%", transform: "translateX(-50%)",
          width: 116, height: 4.5, borderRadius: 999, background: "rgba(255,255,255,.32)",
          zIndex: 40, pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}
