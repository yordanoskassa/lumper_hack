import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Fuel,
  MapPin,
  RefreshCw,
  Search,
  Truck as TruckIcon,
  Warehouse,
} from "lucide-react";
import { api, API_BASE, type TraceEvent } from "@/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/** What `GET /api/fleet` actually returns. Typed here rather than in api.ts so
 *  this view owns its own contract. */
interface FleetLoad {
  id: string;
  dest: string;
  rate: number;
  broker: string;
  eta_h: number;
}

interface FleetTruck {
  id: string;
  driver: string;
  city: string;
  lat: number;
  lon: number;
  status: "empty" | "loaded" | "at dock" | string;
  hos_left_h: number;
  mpg: number;
  trailer: string;
  load: FleetLoad | null;
  /** Present only while Payday's meter is running on this truck. */
  detention?: { minutes_on_site?: number; owed?: number };
}

interface FleetData {
  carrier: string;
  trucks: FleetTruck[];
}

/** A full federal driving day. The HOS bar is read against this, not against
 *  whatever the largest number on screen happens to be. */
const HOS_MAX_H = 11;
/** Under two hours you cannot start anything meaningful — that is a dispatch
 *  problem, not a heads-up. */
const HOS_CRITICAL_H = 2;
const HOS_LOW_H = 4;

const STATUS_CLS: Record<string, string> = {
  empty: "border-warn/35 bg-warn/12 text-warn",
  loaded: "border-ok/35 bg-ok/12 text-ok",
  "at dock": "border-primary/35 bg-primary/12 text-primary",
};

const STATUS_LABEL: Record<string, string> = {
  empty: "Empty",
  loaded: "Loaded",
  "at dock": "At dock",
};

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

function hhmm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function hoursText(h: number): string {
  return `${h.toFixed(1)}h`;
}

function hosInk(h: number): string {
  return h < HOS_CRITICAL_H ? "text-bad" : h < HOS_LOW_H ? "text-warn" : "text-ok";
}

function hosBar(h: number): string {
  return h < HOS_CRITICAL_H ? "bg-bad" : h < HOS_LOW_H ? "bg-warn" : "bg-ok";
}

function hosNote(h: number): string {
  if (h < HOS_CRITICAL_H) return "Out of hours — needs a 10-hour reset before the next dispatch";
  if (h < HOS_LOW_H) return "Short clock — local runs only";
  return `of ${HOS_MAX_H}h driving`;
}

/** Detention first, then the driver about to run out of clock, then the truck
 *  sitting empty. Everything that costs money floats to the top. */
function urgency(t: FleetTruck): number {
  if (t.detention) return 0;
  if (t.hos_left_h < HOS_CRITICAL_H) return 1;
  if (t.status === "empty") return 2;
  if (t.status === "at dock") return 3;
  return 4;
}

export function Fleet({ trace }: { trace: TraceEvent[] }) {
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hunting, setHunting] = useState<string | null>(null);

  async function load(quiet = false) {
    if (!quiet) setBusy(true);
    try {
      const r = await fetch(API_BASE + "/api/fleet");
      if (!r.ok) throw new Error(`${r.status}`);
      const d: FleetData = await r.json();
      setFleet({ carrier: d.carrier, trucks: Array.isArray(d.trucks) ? d.trucks : [] });
      setErr(null);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      // Keep the last good board on screen; a blink to empty on one dropped
      // poll would read as "the trucks vanished".
      setFleet((f) => f ?? { carrier: "", trucks: [] });
    } finally {
      if (!quiet) setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // The detention meter is the reason this screen is live: a dispatcher
    // should see it start without touching anything.
    const t = setInterval(() => load(true), 10000);
    return () => clearInterval(t);
  }, []);

  /** Subtle "last seen": which loads the agents are touching right now. Nothing
   *  here is invented — a load id only lights up if it appears in the trace. */
  const busyLoads = useMemo(() => {
    const s = new Set<string>();
    for (const e of trace) {
      const hits = `${e.msg ?? ""} ${e.text ?? ""}`.match(/P-\d{3,}/g);
      if (hits) for (const h of hits) s.add(h);
    }
    return s;
  }, [trace]);

  /** Sends Finder out for this truck. The same scan the desk runs, so the
   *  button is wired to real work rather than a toast. */
  async function findLoad(truckId: string) {
    setHunting(truckId);
    try {
      await api.scan();
    } catch {
      /* the trace panel already reports a failed run */
    } finally {
      setHunting(null);
    }
  }

  if (!fleet) {
    return (
      <div className="h-full overflow-x-hidden overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] sm:px-5 lg:px-6 lg:pb-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <Skeleton className="h-9 w-44" />
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-22 w-full" />)}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
          </div>
        </div>
      </div>
    );
  }

  const trucks = fleet.trucks.slice().sort((a, b) => urgency(a) - urgency(b) || a.id.localeCompare(b.id));
  const count = (s: string) => trucks.filter((t) => t.status === s).length;
  const owed = trucks.reduce((n, t) => n + (t.detention?.owed ?? 0), 0);
  const onMeter = trucks.filter((t) => t.detention);
  const outOfHours = trucks.filter((t) => !t.detention && t.hos_left_h < HOS_CRITICAL_H);

  return (
    // Breakpoints do the responding: one column of truck cards on a phone,
    // two from lg up. No measured widths anywhere.
    <div className="h-full overflow-x-hidden overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] sm:px-5 lg:px-6 lg:pb-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        {/* header */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">
              Home / <span className="text-foreground/80">Fleet</span>
            </div>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.025em] sm:text-[26px]">
              {fleet.carrier || "Fleet"}
            </h1>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <Badge
              variant="outline"
              className="h-11 gap-2 rounded-lg px-3 text-[12.5px] font-normal text-foreground/80 sm:h-9"
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", err ? "bg-bad" : "bg-ok")} />
              {err ? "Desk unreachable" : `${trucks.length} trucks · positions live`}
            </Badge>
            <Button size="tap" variant="outline" onClick={() => load()} disabled={busy} className="flex-1 sm:flex-none">
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* summary strip */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Tile k="Empty" v={String(count("empty"))} sub={count("empty") ? "needs a load" : "all covered"} />
          <Tile k="Loaded" v={String(count("loaded"))} sub="rolling" />
          <Tile k="At dock" v={String(count("at dock"))} sub={onMeter.length ? "meter running" : "loading or unloading"} />
          <Tile
            k="Detention owed"
            v={money(owed)}
            sub={owed > 0 ? `${onMeter.length} truck${onMeter.length === 1 ? "" : "s"} waiting` : "nothing on the clock"}
            accent={owed > 0}
          />
        </div>

        {/* the one line a dispatcher should read from across the room */}
        {(onMeter.length > 0 || outOfHours.length > 0) && (
          <Card size="sm" className="gap-0 py-0">
            {onMeter.map((t) => (
              <div
                key={`d-${t.id}`}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border bg-bad/10 px-4 py-3 last:border-b-0"
              >
                <span className="pulse-dot size-2 shrink-0 rounded-full bg-bad" />
                <span className="text-[13px] font-semibold text-bad">
                  Truck {t.id} is on the detention clock
                </span>
                <span className="num text-[13px] text-bad sm:ml-auto">
                  {hhmm(t.detention?.minutes_on_site ?? 0)} on site · {money(t.detention?.owed ?? 0)} owed
                </span>
              </div>
            ))}
            {outOfHours.map((t) => (
              <div
                key={`h-${t.id}`}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border bg-warn/10 px-4 py-3 last:border-b-0"
              >
                <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
                <span className="text-[13px] font-semibold text-warn">
                  {t.driver} is out of hours
                </span>
                <span className="num text-[13px] text-warn sm:ml-auto">
                  {hoursText(t.hos_left_h)} left · reset needed
                </span>
              </div>
            ))}
          </Card>
        )}

        {/* trucks */}
        {trucks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <TruckIcon className="size-6 text-muted-foreground" aria-hidden />
              <div className="text-[13.5px] font-medium">No trucks on this account</div>
              <p className="max-w-sm text-[12.5px] text-pretty text-muted-foreground">
                {err
                  ? "The desk did not answer. Check the backend on 8787, then refresh."
                  : "Add a truck and driver and they will show up here with their hours and current load."}
              </p>
              <Button size="tap" variant="outline" onClick={() => load()} className="mt-1">
                <RefreshCw className="size-4" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {trucks.map((t) => (
              <TruckCard
                key={t.id}
                t={t}
                live={!!t.load && busyLoads.has(t.load.id)}
                hunting={hunting === t.id}
                onFind={() => findLoad(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TruckCard({ t, live, hunting, onFind }: {
  t: FleetTruck; live: boolean; hunting: boolean; onFind: () => void;
}) {
  const det = t.detention;
  const pct = Math.max(0, Math.min(100, (t.hos_left_h / HOS_MAX_H) * 100));
  const statusCls = STATUS_CLS[t.status] ?? "border-border bg-muted/50 text-muted-foreground";
  // Rolling with more drive time left than hours on the clock. The load cannot
  // be delivered legally as dispatched.
  const overClock = !!t.load && t.load.eta_h > 0 && t.load.eta_h > t.hos_left_h;

  return (
    <Card
      className={cn(
        "gap-0 py-0",
        det ? "ring-bad/40" : t.hos_left_h < HOS_CRITICAL_H ? "ring-warn/40" : undefined,
      )}
    >
      {/* the meter, when it is running, outranks everything else on the card */}
      {det && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-bad/12 px-4 py-2.5">
          <span className="pulse-dot size-2 shrink-0 rounded-full bg-bad" />
          <span className="text-[12px] font-semibold tracking-[0.04em] text-bad uppercase">
            Detention meter running
          </span>
          <span className="num w-full text-[13px] text-bad sm:ml-auto sm:w-auto">
            {hhmm(det.minutes_on_site ?? 0)} on site · {money(det.owed ?? 0)} owed
          </span>
        </div>
      )}

      {/* who and what */}
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5">
        <span className="mono flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-[13px] font-semibold text-background">
          {t.id}
        </span>
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold break-words">{t.driver}</div>
          <div className="text-[11.5px] text-muted-foreground">Truck {t.id} · {t.trailer}</div>
        </div>
        <Badge variant="outline" className={cn("ml-auto shrink-0 h-6 px-2.5 text-[11px] tracking-[0.04em]", statusCls)}>
          {STATUS_LABEL[t.status] ?? t.status}
        </Badge>
      </div>

      <Separator />

      <CardContent className="flex flex-col gap-3.5 px-4 py-3.5">
        {/* where */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate text-foreground/85">{t.city}</span>
          </span>
          <span className="mono text-[11px]">{t.lat.toFixed(2)}, {t.lon.toFixed(2)}</span>
          <span className="flex items-center gap-1.5 sm:ml-auto">
            <Fuel className="size-3.5 shrink-0" aria-hidden />
            <span className="num">{t.mpg.toFixed(1)}</span> mpg
          </span>
        </div>

        {/* hours of service — the constraint the whole day is planned around */}
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="flex items-center gap-1.5 text-[11.5px] text-foreground/80">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              Hours of service
            </span>
            <span className={cn("num ml-auto text-[15px]", hosInk(t.hos_left_h))}>
              {hoursText(t.hos_left_h)} left
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", hosBar(t.hos_left_h))} style={{ width: `${pct}%` }} />
          </div>
          <div className={cn("mt-1 text-[11px]", t.hos_left_h < HOS_LOW_H ? hosInk(t.hos_left_h) : "text-muted-foreground")}>
            {hosNote(t.hos_left_h)}
          </div>
        </div>

        {/* what they are on */}
        {t.load ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="mono text-[11.5px] text-muted-foreground">{t.load.id}</span>
              {live && (
                <span className="flex items-center gap-1 text-[10.5px] text-primary">
                  <span className="pulse-dot size-1.5 rounded-full bg-primary" />
                  agent working this load
                </span>
              )}
              <span className="num ml-auto text-[17px] font-semibold tracking-[-0.02em]">
                {money(t.load.rate)}
              </span>
            </div>
            {/* A truck already at its delivery city read "Toledo OH → Toledo OH".
                Once they are there, the only useful fact is that they are there. */}
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[14px] font-medium">
              {t.city === t.load.dest ? (
                <>
                  <Warehouse className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="break-words">At the dock in {t.load.dest}</span>
                </>
              ) : (
                <>
                  <TruckIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="break-words">{t.city}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="break-words">{t.load.dest}</span>
                </>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
              <span className="min-w-0 truncate">{t.load.broker}</span>
              <span className={cn("sm:ml-auto", overClock && "text-warn")}>
                {t.load.eta_h <= 0
                  ? det ? "waiting to be unloaded" : "at the dock"
                  : `ETA ${hoursText(t.load.eta_h)}`}
              </span>
            </div>
            {/* Both numbers come off the same payload; the dispatcher should not
                have to subtract them in their head at 6am. */}
            {overClock && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-warn/25 bg-warn/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-warn">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  Runs {hoursText(t.load.eta_h - t.hos_left_h)} past their remaining clock — needs a
                  relay or a reset on the way.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-warn/25 bg-warn/8 px-3.5 py-3">
            <div className="text-[13.5px] font-medium text-warn">No load assigned</div>
            <p className="mt-0.5 text-[12px] text-pretty text-muted-foreground">
              Sitting in {t.city} with {hoursText(t.hos_left_h)} of clock. Every hour empty is
              fixed cost with nothing against it.
            </p>
            <Button size="tap" onClick={onFind} disabled={hunting} className="mt-2.5 w-full sm:w-auto">
              <Search className={cn("size-4", hunting && "animate-pulse")} />
              {hunting ? "Finder is looking…" : "Find a load"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({ k, v, sub, accent }: { k: string; v: string; sub: string; accent?: boolean }) {
  return (
    <Card size="sm" className={cn("gap-0 px-3.5 py-3", accent && "bg-primary/8 ring-primary/25")}>
      <div className="text-xs text-foreground/80">{k}</div>
      <div className={cn("num mt-1 text-[22px] font-semibold tracking-[-0.02em]", accent && "text-primary")}>{v}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </Card>
  );
}
