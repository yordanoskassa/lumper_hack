import { useEffect, useRef } from "react";
import type { TraceEvent } from "@/api";
import { cn } from "@/lib/utils";
import { BackendTag } from "@/components/BackendTag";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

// Keyed on the agent id the backend sends (uppercase), not the display name —
// the fleet is these five. Every value clears 4.5:1 on the card.
const AGENT_FG: Record<string, string> = {
  "DISPATCH": "text-[#fdba74]",
  FINDER: "text-[#60a5fa]",
  VERIFIER: "text-ok",
  CLOSER: "text-[#c084fc]",
  PAYDAY: "text-warn",
};
// Gateway / Gmail / Model Armor and anything else the platform emits: readable,
// just not one of the five.
const INFRA_FG = "text-muted-foreground";

// The backend sends a handful of aliases for the same three verdict colours.
const TONE_ROW: Record<string, string> = {
  pass: "bg-ok/10", green: "bg-ok/10",
  warn: "bg-warn/10", amber: "bg-warn/10", block: "bg-warn/10",
  fail: "bg-bad/10", red: "bg-bad/10",
};
const TONE_FG: Record<string, string> = {
  pass: "text-ok", green: "text-ok",
  warn: "text-warn", amber: "text-warn", block: "text-warn",
  fail: "text-bad", red: "text-bad",
};

export function Trace({ trace, connected, height = 460 }: {
  trace: TraceEvent[]; connected: boolean; height?: number | string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll the ScrollArea's own viewport, never an ancestor — pinning the log
    // to the newest line must not drag the page under it.
    const vp = ref.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (vp) vp.scrollTop = vp.scrollHeight;
  }, [trace.length]);

  return (
    // maxHeight is the one genuinely dynamic value here: callers pass px or a
    // calc() string, so it cannot be a utility class.
    <Card className="min-h-55 gap-0 py-0" style={{ maxHeight: height }}>
      <CardHeader className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
        <CardTitle className="text-[13px] font-semibold">Live trace</CardTitle>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("size-1.5 shrink-0 rounded-full", connected ? "bg-ok" : "bg-bad")} />
          {connected ? "streaming" : "offline"} · {trace.length}
        </span>
      </CardHeader>

      <div ref={ref} className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          {trace.length === 0 && (
            <div className="mono px-4 py-4.5 text-xs text-muted-foreground">
              awaiting fleet activity<span className="blink">_</span>
            </div>
          )}
          {trace.map((e) => {
            const tone = e.tone ?? "";
            const id = e.agent ?? "";
            // agent_name ships alongside agent but predates the TraceEvent type
            const label = (e as { agent_name?: string }).agent_name || id || "—";
            return (
              <div
                key={e.seq}
                className={cn(
                  // Narrow: clock + agent share a line and the message wraps
                  // beneath them. sm and up: the three fixed columns that read
                  // as a log.
                  "flex flex-wrap items-start gap-x-2.5 gap-y-1 border-b border-border px-3 py-2 animate-[rise_0.22s_ease_both] sm:flex-nowrap sm:px-3.5",
                  TONE_ROW[tone] ?? "",
                )}
              >
                <div className="mono shrink-0 pt-0.5 text-[10px] text-muted-foreground sm:w-13">
                  {e.clock}
                </div>
                <div
                  className={cn(
                    "shrink-0 pt-0.5 text-[10.5px] font-semibold break-words sm:w-[74px]",
                    AGENT_FG[id.toUpperCase()] ?? INFRA_FG,
                  )}
                >
                  {label}
                </div>
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <div
                    className={cn(
                      "mono text-[11px] leading-relaxed break-words",
                      TONE_FG[tone] ?? "text-foreground/85",
                    )}
                  >
                    {e.msg}
                  </div>
                  {(e.backend || e.latency_ms != null) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {e.tool && <span className="mono text-[9.5px] text-muted-foreground">{e.tool}</span>}
                      <BackendTag backend={e.backend} />
                      {e.latency_ms != null && (
                        <span className="mono text-[9.5px] text-muted-foreground">{e.latency_ms}ms</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </ScrollArea>
      </div>

      <div className="flex shrink-0 flex-wrap justify-between gap-x-3 gap-y-1 border-t border-border bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span>Agent Gateway · Identity · Runtime</span>
        <span>Model Armor <span className="text-ok">inline</span></span>
      </div>
    </Card>
  );
}
