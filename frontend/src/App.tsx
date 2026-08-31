import { useEffect, useState } from "react";
import {
  DollarSign, FileText, MapPin, MessageSquare, Settings2, Truck, X, type LucideIcon,
} from "lucide-react";
import { api, type Desk as DeskData, type TraceEvent } from "@/api";
import { useStream } from "@/useStream";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chat, CHAT_GREETING } from "@/components/Chat";
import { Desk } from "@/views/Desk";
import { DriverApp } from "@/driver/DriverApp";
import { Fleet } from "@/views/Fleet";
import { LoadsTab } from "@/views/LoadsTab";
import { Money } from "@/views/Money";
import { PaperworkTab } from "@/views/PaperworkTab";
import { Registry } from "@/views/Registry";
import { TripTab } from "@/views/TripTab";
import { RunProvider, useRun } from "@/driver/RunProvider";

type View = "loads" | "trip" | "paperwork" | "money" | "desk" | "fleet" | "registry";

/** Backstop is the driver's side of Lumper, so there is no "driver" tab — the
 *  whole product is theirs. These are the four jobs of a driver's day, which is
 *  the same single run split across the surfaces that own each part of it.
 *  The dispatcher board, the truck roster and the agent registry are all
 *  auditor's views, not a driver's: they live under System. */
const NAV: { key: View; label: string; short: string; Icon: LucideIcon }[] = [
  { key: "loads", label: "Loads", short: "Loads", Icon: Truck },
  { key: "trip", label: "My run", short: "Run", Icon: MapPin },
  { key: "paperwork", label: "Paperwork", short: "Docs", Icon: FileText },
  { key: "money", label: "Money", short: "Money", Icon: DollarSign },
];

const SYSTEM: { key: View; label: string }[] = [
  { key: "desk", label: "Dispatcher board" },
  { key: "fleet", label: "Truck roster" },
  { key: "registry", label: "Agents & scopes" },
];

const ROSTER = ["Dispatch", "Finder", "Verifier", "Closer", "Payday"];

/** Installed to a home screen, or opened at /?driver=1, the app IS the driver
 *  app — no console chrome at all. */
function standalone(): boolean {
  return (
    new URLSearchParams(location.search).get("driver") === "1" ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export default function App() {
  // One SSE connection for the whole app, owned above the provider so the run
  // context and every view read the same stream.
  const [deskFromStream, setDeskFromStream] = useState<DeskData | null>(null);
  const [chatFeed, setChatFeed] = useState<{ role: string; text: string }[]>([]);
  const { trace, connected } = useStream(
    (_runId, state) => { if (state.desk) setDeskFromStream(state.desk); },
    (e) => {
      if (e.role && e.text)
        setChatFeed((f) => [...f, { role: e.role === "user" ? "user" : "assistant", text: e.text! }]);
    },
  );

  if (standalone()) {
    // DriverApp brings its own provider; the console chrome is not wanted here.
    return (
      <div className="h-dvh bg-background">
        <DriverApp trace={trace} />
      </div>
    );
  }

  return (
    <RunProvider trace={trace}>
      <Shell trace={trace} connected={connected} deskFromStream={deskFromStream} chatFeed={chatFeed} />
    </RunProvider>
  );
}

/** Inside the provider so it can follow the run. RunProvider stays mounted for
 *  the life of the app — remounting it would drop the load, the clock and the
 *  paperwork every time someone changed tab. */
function Shell({ trace, connected, deskFromStream, chatFeed }: {
  trace: TraceEvent[];
  connected: boolean;
  deskFromStream: DeskData | null;
  chatFeed: { role: string; text: string }[];
}) {
  // The run's own tab is the single source of truth for where the driver is in
  // the flow. Mirroring it into local state let the two diverge — and once they
  // had, a CTA calling setTab() with the value it already held changed nothing,
  // so the view was stuck for good. `section` only tracks whether we are in the
  // run at all; which run tab shows is read straight from the context.
  const { activeTab, setTab } = useRun();
  const [section, setSection] = useState<"run" | "money" | "desk" | "fleet" | "registry">("run");
  const view: View = section === "run" ? (activeTab as View) : section;

  function go(key: View) {
    if (key === "loads" || key === "trip" || key === "paperwork") {
      setTab(key);
      setSection("run");
    } else {
      setSection(key as "money" | "desk" | "fleet" | "registry");
    }
  }
  const [tenant, setTenant] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLog, setChatLog] = useState([CHAT_GREETING]);
  const [activeAgents, setActiveAgents] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try { setTenant(await api.tenant()); setHealth(await api.health()); } catch { /* offline */ }
    })();
  }, []);

  useEffect(() => {
    const last = trace[trace.length - 1];
    // The roster lists display names; the event carries the id in `agent` and
    // the display name in `agent_name`. Keying on `agent` never matched, so
    // every live indicator in the app was permanently dark.
    const who = (last as { agent_name?: string })?.agent_name ?? last?.agent;
    if (who) setActiveAgents((a) => ({ ...a, [who]: Date.now() }));
  }, [trace.length]);

  const body = (
    <>
      {view === "loads" && <LoadsTab />}
      {view === "trip" && <TripTab />}
      {view === "paperwork" && <PaperworkTab />}
      {view === "money" && <Money />}
      {view === "desk" && <Desk trace={trace} connected={connected} deskFromStream={deskFromStream} />}
      {view === "fleet" && <Fleet trace={trace} />}
      {view === "registry" && <Registry />}
    </>
  );

  const now = Date.now();

  return (
    // Breakpoints, not measured widths: the layout has to answer a rotation or a
    // window drag on its own, without React re-rendering to find out.
    <div className="h-dvh overflow-hidden bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* SIDEBAR — desktop only */}
      <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <div className="flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">
            L
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-[-0.015em]">Lumper Backstop</div>
            <div className="truncate text-[10.5px] text-muted-foreground">Autonomous freight desk</div>
          </div>
        </div>

        <SideLabel>Workspace</SideLabel>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => go(key)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors",
                view === key
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-foreground/80 hover:bg-muted",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <SideLabel>Fleet</SideLabel>
        <div className="flex flex-col gap-0.5 px-2">
          {ROSTER.map((name) => {
            const active = activeAgents[name] && now - activeAgents[name] < 3500;
            return (
              <div key={name} className="flex items-center gap-2 rounded-md px-2.5 py-1.5">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    active ? "bg-primary pulse-dot" : "bg-ok",
                  )}
                />
                <span className="truncate text-[12.5px] text-foreground/80">{name}</span>
              </div>
            );
          })}
        </div>

        <SideLabel>Memory graph</SideLabel>
        <div className="mx-3 overflow-hidden rounded-xl border border-border">
          <GraphRow k="Broker records" v={tenant?.graph?.brokers ?? "—"} />
          <GraphRow k="Flagged shells" v={tenant?.graph?.flagged ?? 0} tone={tenant?.graph?.flagged ? "bad" : undefined} />
          <GraphRow k="Shared ACH nodes" v={tenant?.graph?.shared_ach_nodes ?? "—"} tone="warn" />
          <GraphRow
            k="Unpaid on record"
            v={tenant?.graph?.unpaid ? `$${tenant.graph.unpaid.toLocaleString()}` : "$0"}
            tone={tenant?.graph?.unpaid ? "bad" : undefined}
          />
          <GraphRow k="Memory Bank" v={health?.memory ?? "—"} />
        </div>

        {tenant?.tenant?.truck && (
          <>
            <SideLabel>
              Truck {tenant.tenant.truck.id} · {tenant.tenant.truck.driver}
            </SideLabel>
            <div className="mx-3 mb-3 rounded-xl border border-border px-3 py-2.5">
              <div className="text-[11.5px] text-muted-foreground">Drive time left today</div>
              <div className="num mt-0.5 text-[19px] font-semibold">
                {Math.floor(tenant.tenant.truck.hos_left_h)}h{" "}
                {Math.round((tenant.tenant.truck.hos_left_h % 1) * 60)}m
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Empty in {tenant.tenant.truck.empty_in_h.toFixed(1)}h · {tenant.tenant.truck.city}
              </div>
            </div>
          </>
        )}

        <div className="mt-auto border-t border-border pt-2">
          <div className="flex items-center gap-1.5 px-4 pb-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            <Settings2 className="size-3" /> System
          </div>
          {SYSTEM.map((x) => (
            <button
              key={x.key}
              onClick={() => go(x.key)}
              className={cn(
                "block w-full px-4 py-1.5 text-left text-[11.5px] transition-colors",
                view === x.key ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          {tenant?.tenant?.name ?? "K&M Hauling"} · {tenant?.tenant?.trucks ?? 3} trucks
        </div>
      </aside>

      {/* MAIN */}
      <div className="relative flex h-dvh min-w-0 flex-col lg:h-auto lg:min-h-0">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {body}

          {/* Dispatch: a docked panel on desktop, a full sheet on a phone. */}
          {chatOpen ? (
            <div className="absolute inset-0 z-60 flex flex-col bg-background lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[min(560px,42vw)] lg:border-l lg:border-border lg:shadow-2xl">
              <Button
                variant="ghost"
                size="tap"
                onClick={() => setChatOpen(false)}
                className="absolute top-2 right-2 z-10"
              >
                <X className="size-4" /> <span className="lg:hidden">Close</span>
              </Button>
              <Chat
                chatFeed={chatFeed}
                trace={trace}
                local={chatLog}
                setLocal={setChatLog}
                onRoute={(route) => {
                  // Take the operator where the answer landed instead of
                  // dumping them on whatever view they happened to be on.
                  const to: Record<string, View> = {
                    scan_board: "desk", screen_broker: "desk",
                    book_load: "desk", run_scenario: "desk",
                  };
                  if (to[route]) go(to[route]);
                }}
              />
            </div>
          ) : (
            <Button
              size="tap"
              onClick={() => setChatOpen(true)}
              className="absolute right-4 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-50 rounded-full shadow-xl lg:right-5 lg:bottom-5"
            >
              <MessageSquare className="size-4" />
              Dispatch
            </Button>
          )}
        </div>

        {/* BOTTOM NAV — phone only. Apple-style glass: it floats over the
            content rather than pushing it up, because the blur only reads as
            glass when there is something moving underneath it. */}
        <nav
          className={cn(
            "absolute inset-x-0 bottom-0 z-50 grid grid-cols-4 lg:hidden",
            "pb-[env(safe-area-inset-bottom)]",
            // hairline, not a border: 1px at 3x is a heavy line
            "border-t border-white/[0.08]",
            // opaque fallback first, translucent only where the blur exists
            "bg-card",
            "supports-[backdrop-filter]:bg-card/65 supports-[backdrop-filter]:backdrop-blur-2xl",
            "supports-[backdrop-filter]:backdrop-saturate-[180%]",
          )}
        >
          {NAV.map(({ key, short, Icon }) => {
            const on = view === key;
            return (
              <button
                key={key}
                onClick={() => go(key)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 pt-1.5 pb-1",
                  "text-[10px] tracking-[0.01em] transition-colors duration-150",
                  "active:opacity-60",
                  on ? "font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-[22px] transition-transform", on && "scale-105")} strokeWidth={on ? 2.2 : 1.8} />
                {short}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function SideLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1.5 text-[11px] font-medium text-muted-foreground">{children}</div>
  );
}

function GraphRow({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="flex justify-between gap-2 border-t border-border px-3 py-1.5 text-[11.5px] first:border-t-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("num", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>
        {v}
      </span>
    </div>
  );
}
