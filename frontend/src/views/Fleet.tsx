import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, type AgentCard, type TraceEvent } from "@/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// The four feedback edges that close the loop — each downstream agent teaches
// an upstream one, so the fleet gets smarter every run. These mirror the
// `loop` line each agent publishes to the registry.
const LOOP_EDGES: { from: string; to: string; desc: string }[] = [
  {
    from: "Payday",
    to: "Verifier",
    desc: "How slowly a broker paid, and whether they stalled a waiting-time claim, becomes a risk score on the next screen.",
  },
  {
    from: "Verifier",
    to: "Finder",
    desc: "Brokers that failed a check are filtered out before Finder spends a single lookup on them.",
  },
  {
    from: "Closer",
    to: "Verifier",
    desc: "The terms Closer locks in writing are the reference Verifier audits the broker's paperwork against.",
  },
  {
    from: "Finder",
    to: "Closer",
    desc: "What this exact route has paid for 90 days is the number Closer opens the negotiation on.",
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}

export function Fleet({ trace }: { trace: TraceEvent[] }) {
  const [agents, setAgents] = useState<AgentCard[]>([]);

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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-[26px]">The fleet</h1>
          <p className="mt-1 text-[13px] text-pretty text-muted-foreground">
            Four agents do the work and Yard Boss routes between them. Each one hands to the
            next, and every tool call goes through the Gateway.
          </p>
        </div>

        {/* Handoff chain */}
        <Card>
          <CardHeader>
            <CardTitle>Handoff chain</CardTitle>
            <CardDescription className="text-[12.5px] text-pretty">
              Finder finds it and prices it → Verifier proves the broker is real → Closer locks
              the deal → Payday gets the driver paid
            </CardDescription>
            <CardAction>
              <Badge>4 workers + 1 boss</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {loading &&
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)}
              {agents.map((a, i) => (
                <div
                  key={a.key}
                  className="group relative overflow-hidden rounded-lg border border-border bg-muted/25 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  <span className="absolute inset-y-0 left-0 w-[3px] bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="flex items-center gap-2">
                    <span className="mono flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground text-[10.5px] font-semibold text-background">
                      {i + 1}
                    </span>
                    <span className="min-w-0 text-[12.5px] font-semibold break-words">{a.name}</span>
                  </div>
                  <div className="mt-1.5 text-[10.5px] text-muted-foreground">{a.badge}</div>
                  {/* Wraps. The old build clipped this to "→ Finder, Verifier, Clo…". */}
                  <div className="mt-1 text-[10.5px] leading-snug text-primary/90 wrap-anywhere">
                    → {a.handoff}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Agent cards */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {agents.map((a) => {
            const count = activity[a.name] ?? 0;
            return (
              <Card key={a.key} className="gap-0 py-0">
                <CardHeader className="items-center gap-2 px-4 py-3">
                  <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{a.name}</span>
                    <Badge variant="secondary" className="mono text-[10px]">v{a.version}</Badge>
                  </CardTitle>
                  <CardAction className="flex items-center gap-2">
                    {count > 0 && (
                      <span
                        title={`${count} trace events`}
                        className="flex items-center gap-1 text-[10px] text-primary"
                      >
                        <span className="pulse-dot size-1.5 rounded-full bg-primary" />
                        <span className="mono">{count}</span>
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">{a.badge}</Badge>
                  </CardAction>
                </CardHeader>
                <Separator />

                <CardContent className="flex flex-1 flex-col gap-3.5 px-4 py-3.5">
                  <p className="text-[13px] leading-relaxed text-pretty text-muted-foreground">{a.role}</p>

                  <div>
                    <SectionLabel>Tools</SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {a.tools.map((t) => (
                        <span
                          key={t}
                          className="mono rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10.5px] leading-snug text-foreground/75 wrap-anywhere"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Gateway scopes</SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {a.scopes.map((s) => (
                        <span
                          key={s}
                          className="mono rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10.5px] leading-snug text-primary wrap-anywhere"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto border-t border-border pt-3">
                    <div className="text-[12px] text-foreground/85">
                      Hands to{" "}
                      <span className="font-semibold text-primary wrap-anywhere">→ {a.handoff}</span>
                    </div>
                    {a.loop && (
                      <div className="mt-2">
                        <SectionLabel>Closed loop</SectionLabel>
                        <p className="text-[11.5px] leading-snug text-pretty text-muted-foreground italic">
                          {a.loop}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Closed loop */}
        <Card className="gap-0 pb-0">
          <CardHeader className="pb-3">
            <CardTitle>Closed loop</CardTitle>
            <CardDescription className="text-[12.5px] text-pretty">
              The fleet feeds itself — every run teaches the next one
            </CardDescription>
            <CardAction>
              <Badge variant="outline">self-improving</Badge>
            </CardAction>
          </CardHeader>
          {LOOP_EDGES.map((e, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 border-t border-border px-4 py-3",
                i === LOOP_EDGES.length - 1 && "rounded-b-xl",
              )}
            >
              <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">
                  {e.from} <span className="text-primary">→</span> {e.to}
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-pretty text-muted-foreground">
                  {e.desc}
                </p>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
