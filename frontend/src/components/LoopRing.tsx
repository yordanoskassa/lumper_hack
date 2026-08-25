import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The four working agents as a left-to-right flow with a return arc from
// Payday back to Verifier — the closed loop, made literal. Yard Boss is the
// orchestrator above all four, so it is not a stage here. The active step
// glows; on the final step the feedback arc lights up.
const FLOW = [
  { key: "FINDER", name: "Finder", short: "finds it, prices it" },
  { key: "VERIFIER", name: "Verifier", short: "proves it is real" },
  { key: "CLOSER", name: "Closer", short: "locks the deal" },
  { key: "PAYDAY", name: "Payday", short: "gets you paid" },
];

export function LoopRing({ active, loopHot }: { active: string[]; loopHot: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Two-by-two on a phone, one row from `sm` up — the arrows only exist
          in the single-row layout, where they mean something. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-stretch sm:gap-0">
        {FLOW.map((a, i) => {
          const on = active.includes(a.key);
          const danger = a.key === "VERIFIER";
          const next = active.includes(FLOW[i + 1]?.key ?? "");
          return (
            <div key={a.key} className="sm:flex sm:min-w-0 sm:flex-1 sm:items-center">
              <div
                className={cn(
                  "h-full min-w-0 rounded-lg border px-2 py-2.5 text-center transition-colors sm:flex-1",
                  on
                    ? danger
                      ? "border-bad/40 bg-bad/12"
                      : "border-primary/40 bg-primary/12"
                    : "border-border bg-muted/30",
                )}
              >
                <div
                  className={cn(
                    "mono mx-auto mb-1.5 flex size-5.5 items-center justify-center rounded-md text-[11px] font-semibold transition-colors",
                    on
                      ? danger
                        ? "bg-bad text-background"
                        : "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </div>
                <div
                  className={cn(
                    "text-[12px] leading-tight font-semibold break-words",
                    on ? (danger ? "text-bad" : "text-primary") : "text-foreground/80",
                  )}
                >
                  {a.name}
                </div>
                <div className="mt-0.5 text-[10.5px] leading-tight text-balance text-muted-foreground">
                  {a.short}
                </div>
              </div>
              {i < FLOW.length - 1 && (
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "hidden size-4 shrink-0 sm:block",
                    on || next ? "text-primary" : "text-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* The return arc: Payday feeds Verifier. Drawn only where there is a
          single row for it to arc across. */}
      <svg
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        aria-hidden
        className="hidden h-4 w-full overflow-visible sm:block"
      >
        <defs>
          <marker id="loopring-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path
              d="M0,0 L6,3 L0,6 Z"
              className={loopHot ? "fill-primary" : "fill-muted-foreground/50"}
            />
          </marker>
        </defs>
        <path
          d="M 88 1 C 88 9, 38 9, 38 2"
          fill="none"
          strokeWidth={loopHot ? 1.1 : 0.7}
          strokeDasharray={loopHot ? "0" : "1.5 1.5"}
          vectorEffect="non-scaling-stroke"
          markerEnd="url(#loopring-arrow)"
          className={cn(
            "transition-colors duration-500",
            loopHot ? "stroke-primary" : "stroke-muted-foreground/50",
          )}
        />
      </svg>

      <div
        className={cn(
          "text-center text-[11px] leading-snug text-balance transition-colors duration-500",
          loopHot ? "font-semibold text-primary" : "text-muted-foreground",
        )}
      >
        Payday teaches Verifier — a broker who stalls on waiting time, or pays slowly, is a
        risk score on the next run
      </div>
    </div>
  );
}
