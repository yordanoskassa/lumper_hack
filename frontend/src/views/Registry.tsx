import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { api, type AgentCard } from "@/api";
import { cn } from "@/lib/utils";
import { BackendTag } from "@/components/BackendTag";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const PUBLISHER = "Lumper Logistics LLC";
const INTEGRATIONS = ["gemini", "maps", "eia", "fmcsa", "weather", "rdap"] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="mono text-[14px] font-semibold">{value}</span>
      <span className="text-[10.5px] text-muted-foreground">{label}</span>
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] sm:p-5 lg:pb-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-[-0.025em] sm:text-[26px]">
              Agent Registry
            </h1>
            <p className="mt-1 text-[13px] text-pretty text-muted-foreground">
              Every agent the fleet can run, what it is allowed to touch, and where it hands off.
              Versioned, discoverable, scope-audited.
            </p>
          </div>

          {/* Platform health */}
          <Card size="sm" className="w-full gap-2 md:w-[248px] md:shrink-0">
            <CardContent>
              <SectionLabel>Platform health</SectionLabel>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {INTEGRATIONS.map((k) => (
                  <div key={k} className="flex items-center justify-between gap-2"
                    title={health?.detail?.[k] ?? undefined}>
                    <span className="mono text-[11px] text-foreground/75">{k}</span>
                    <BackendTag backend={integrations[k] ? "live" : "fallback"} />
                  </div>
                ))}
                <div className="col-span-2 flex items-center justify-between gap-2"
                  title={health?.detail?.loadboard ?? undefined}>
                  <span className="mono text-[11px] text-foreground/75">loadboard</span>
                  <BackendTag backend="sandbox" />
                </div>
              </div>
              <Separator className="my-2" />
              <div className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-[10.5px]">
                  <span className="text-muted-foreground">memory</span>
                  <span className="mono min-w-0 truncate">{health?.memory ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2 text-[10.5px]">
                  <span className="text-muted-foreground">model</span>
                  <span className="mono min-w-0 truncate">{health?.model ?? "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, role, badge or tool…"
              aria-label="Search agents"
              className="h-11 pl-9 text-[13px]"
            />
          </div>
          <span className="shrink-0 text-[11.5px] text-muted-foreground">
            {loading ? "loading…" : `${filtered.length} of ${agents.length} agents`}
          </span>
        </div>

        {/* Discovery cards */}
        <div className="flex flex-col gap-2.5">
          {loading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}

          {!loading && filtered.length === 0 && (
            <Card size="sm">
              <CardContent className="text-[12.5px] text-muted-foreground">
                No agents match “{q}”.
              </CardContent>
            </Card>
          )}

          {filtered.map((a) => {
            const isOpen = !!open[a.key];
            return (
              <Card key={a.key} className="gap-0 py-0">
                {/* Summary row — tap to discover */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [a.key]: !o[a.key] }))}
                  className="flex min-h-11 w-full flex-col gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{a.name}</span>
                      <Badge variant="secondary" className="mono text-[10px]">v{a.version}</Badge>
                      <Badge>{a.badge}</Badge>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground sm:line-clamp-1">
                      {a.role}
                    </p>
                    <div className="mt-1.5 text-[10.5px] text-muted-foreground">
                      publisher: <span className="text-foreground/75">{PUBLISHER}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="flex gap-4 sm:flex-col sm:items-end sm:gap-1">
                      <Stat label="tools" value={a.tools.length} />
                      <Stat label="scopes" value={a.scopes.length} />
                    </div>
                    <span className="ml-auto flex items-center gap-1 text-[12px] font-medium whitespace-nowrap text-primary sm:ml-0">
                      {isOpen ? "Hide" : "Discover"}
                      <ChevronDown
                        aria-hidden
                        className={cn("size-4 transition-transform", isOpen && "rotate-180")}
                      />
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-3.5 bg-muted/30 px-4 py-3.5">
                      <p className="text-[12.5px] leading-relaxed text-pretty text-foreground/85">{a.role}</p>

                      <div>
                        <SectionLabel>Zero-trust scopes · enforced by the Gateway</SectionLabel>
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

                      <div>
                        <SectionLabel>Tools</SectionLabel>
                        <div className="flex flex-wrap gap-1.5">
                          {a.tools.map((t) => (
                            <span
                              key={t}
                              className="mono rounded-md border border-border bg-card px-1.5 py-0.5 text-[10.5px] leading-snug text-foreground/75 wrap-anywhere"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11.5px] text-muted-foreground">
                        <span className="min-w-0">
                          Hands to{" "}
                          <span className="font-semibold text-primary wrap-anywhere">→ {a.handoff}</span>
                        </span>
                        <span>
                          key <span className="mono text-foreground/75">{a.key}</span>
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
