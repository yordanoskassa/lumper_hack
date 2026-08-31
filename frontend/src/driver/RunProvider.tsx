import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { api, type DriverBoard, type DriverLoad, type TraceEvent } from "@/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CITY_COORDS } from "./geo";
import { MapCanvas, type MapPin as Pin, type MapRoute } from "./MapCanvas";
import { GoogleMapCanvas, hasMapsKey } from "./GoogleMap";
import { type DetentionState } from "./DetentionCard";
import { type Check as ScanCheck } from "./VerifyScan";
import { runScreen, type ScanResult } from "@/lib/screening";

export type Screen = "home" | "hunting" | "loads" | "verify" | "trip" | "dock" | "pod" | "paid";

/** The three driver jobs the flow is split across. The whole app is the
 *  driver's, so these are tabs, not modes: find work, run the load, get paid. */
export type RunTab = "loads" | "trip" | "paperwork";

/** Compressed so a 4-hour wait plays out in seconds on stage: the 2h free window
 *  burns down in ~10s, then the meter and the escalation land inside 30s. */
const SIM_MIN_PER_TICK = 12;
const FREE_MIN = 120;
const RATE_HR = 75; // matches the demo tenant's detention terms in data/seed.py
const MAX_ON_SITE_MIN = 300;

/** Which tab a screen belongs to. Clearing the background check lands on
 *  `trip`, and taking the paperwork lands on `paperwork`, without either screen
 *  having to know a tab bar exists. */
export function tabForScreen(s: Screen): RunTab {
  if (s === "trip" || s === "dock") return "trip";
  if (s === "pod" || s === "paid") return "paperwork";
  return "loads";
}

interface RunValue {
  // state
  screen: Screen;
  board: DriverBoard | null;
  picked: DriverLoad | null;
  verifying: DriverLoad | null;
  scan: ScanResult | null;
  announce: { text: string; at: number } | null;
  gps: [number, number] | null;
  dockPos: [number, number] | null;
  det: DetentionState;
  podImg: string | null;
  err: string | null;
  mapFailed: boolean;
  trace?: TraceEvent[];

  // derived
  truck: DriverBoard["truck"] | undefined;
  here: [number, number];
  pins: Pin[];
  routes: MapRoute[];
  focus: [number, number][] | undefined;
  onTrip: boolean;
  activeTab: RunTab;

  // actions
  hunt: () => Promise<void>;
  openScan: (l: DriverLoad) => Promise<void>;
  finishVerify: (blocked: boolean) => void;
  arrive: () => Promise<void>;
  takePaperwork: () => void;
  setPodImg: (b64: string | null) => void;
  sendPod: () => Promise<void>;
  reset: () => void;
  setTab: (t: RunTab) => void;
  setScreen: (s: Screen) => void;
  setMapFailed: (v: boolean) => void;
}

const Ctx = createContext<RunValue | null>(null);

export function useRun(): RunValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRun() outside <RunProvider>");
  return v;
}

/** Every piece of the driver's run lives here: one state machine shared by the
 *  three tabs, so switching tabs mid-run never drops the load, the clock or the
 *  photo. */
export function RunProvider({ children, trace }: { children: ReactNode; trace?: TraceEvent[] }) {
  const [screen, setScreen] = useState<Screen>("home");
  // Buttons in the app are requests to the fleet, not local state changes. Each
  // one is announced here so Dispatch narrates it in the thread — the agent is
  // the system, not a second way to reach it.
  const [announce, setAnnounce] = useState<{ text: string; at: number } | null>(null);
  const say = (text: string) => setAnnounce({ text, at: Date.now() });
  const [board, setBoard] = useState<DriverBoard | null>(null);
  const [picked, setPicked] = useState<DriverLoad | null>(null);
  const [verifying, setVerifying] = useState<DriverLoad | null>(null);
  // Keep the whole result: the raw federal record is the receipt that makes
  // the verdict checkable, and narrowing the type here silently dropped it.
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [det, setDet] = useState<DetentionState>({ active: false });
  const [podImg, setPodImg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  // Where the phone reports it is once the driver says they have arrived. The
  // truck does not physically move during a demo, so continuing to send the
  // origin makes Payday's geofence reject the delivery photo as fraudulent.
  const [dockPos, setDockPos] = useState<[number, number] | null>(null);

  // The tab follows the flow, but the driver can still tap another one; the
  // next move in the run pulls them back to where the work is.
  const flowTab = tabForScreen(screen);
  const [tab, setTab] = useState<RunTab>(flowTab);
  useEffect(() => { setTab(flowTab); }, [flowTab]);

  // real device location when the browser grants it; the truck's yard otherwise
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setGps([p.coords.latitude, p.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const truck = board?.truck;
  const here: [number, number] =
    dockPos ?? gps ?? (truck ? [truck.lat, truck.lng] : [41.525, -88.0834]);

  async function hunt() {
    say("Find me a load");
    setErr(null);
    setScreen("hunting");
    try {
      const b = await api.loads(CITY_COORDS);
      setBoard(b);
      setTimeout(() => setScreen("loads"), 2200);
    } catch (e: any) {
      setErr(String(e.message ?? e));
      setScreen("home");
    }
  }

  // The detention clock is Payday's, not ours: /api/arrive starts it and this
  // polls the real state. The local clock below is a degraded mode for a dead
  // backend only — it is labelled as an estimate so it can never pass as the
  // federal-grade evidence the real one produces.
  useEffect(() => {
    if (screen !== "dock" || !picked) return;
    let alive = true;
    const started = Date.now();
    const tick = async () => {
      if (!alive) return;
      try {
        const d = await api.detention();
        if (d && d.active) { setDet({ ...d, estimated: false }); return; }
        if (d) return; // clock armed but not reporting yet — do not invent one
      } catch { /* backend unreachable: fall through */ }
      const onSite = Math.min(MAX_ON_SITE_MIN, ((Date.now() - started) / 1000) * SIM_MIN_PER_TICK);
      const billable = Math.max(0, onSite - FREE_MIN);
      setDet({
        active: true, estimated: true, posting_id: picked.id, stop: picked.dest,
        free_minutes: FREE_MIN, minutes_on_site: onSite, billable_minutes: billable,
        rate_per_hour: RATE_HR, owed: (billable / 60) * RATE_HR,
        status: onSite > FREE_MIN ? "METER_RUNNING" : "FREE_WINDOW",
        timeline: [{ ts: 0, label: "Offline — timing this on the phone until the desk is back.", kind: "info" }],
      });
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [screen, picked]);

  /** Tapping a load runs the Verifier for real: SAFER retrieval, the callback
   *  cross-check and the memory graph. Nothing on this screen is pre-written. */
  async function openScan(l: DriverLoad) {
    say(`Check ${l.broker} on ${l.origin} → ${l.dest}`);
    setVerifying(l);
    setScan(null);
    setScreen("verify");
    const r = await runScreen(l.id, {
      broker: l.broker, blocked: l.blocked, verdict: l.verdict, reasons: l.reasons,
    });
    setScan(r);
  }

  /** A blocked broker drops the driver back on the board; a cleared one becomes
   *  the run, which carries them to the Trip tab. */
  function finishVerify(blocked: boolean) {
    setScan(null);
    if (blocked) { setVerifying(null); setScreen("loads"); return; }
    setPicked(verifying); setVerifying(null); setScreen("trip");
  }

  async function arrive() {
    say("I'm at the dock");
    if (!picked) return;
    setDet({ active: false });
    const at: [number, number] = [picked.dest_lat, picked.dest_lng];
    setDockPos(at);
    try {
      await api.arrive(picked.id, at[0], at[1]);
    } catch (e: any) {
      setErr(`Arrival did not reach the desk — ${e.message ?? e}`);
    }
    setScreen("dock");
  }

  function takePaperwork() {
    say("I'm unloaded — take the paperwork");
    setScreen("pod");
  }

  async function sendPod() {
    if (!picked) return;
    try {
      await api.depart(picked.id, here[0], here[1]);
      await api.pod(picked.id, podImg ?? "", here[0], here[1]);
    } catch { /* keep the demo moving */ }
    setScreen("paid");
  }

  function reset() {
    setPicked(null); setPodImg(null); setDet({ active: false });
    setDockPos(null); setScreen("home");
  }

  const onTrip = screen === "trip" || screen === "dock" || screen === "pod" || screen === "paid";

  const pins = useMemo<Pin[]>(() => {
    const out: Pin[] = [{
      lat: here[0], lng: here[1], kind: "you",
      // Once arrived, the origin city is the wrong label — it stacked "Joliet IL"
      // on top of the destination pin.
      label: dockPos ? "You" : truck?.city ?? "You",
    }];
    if (screen === "loads" && board) {
      for (const l of board.loads.slice(0, 8)) {
        out.push({
          lat: l.dest_lat, lng: l.dest_lng,
          kind: l.blocked ? "blocked" : l.verdict === "REVIEW" ? "review" : "clear",
        });
      }
    }
    if (onTrip && picked) out.push({ lat: picked.dest_lat, lng: picked.dest_lng, kind: "dock", label: picked.dest });
    return out;
  }, [screen, board, picked, here, truck, onTrip, dockPos]);

  const routes = useMemo<MapRoute[]>(() => {
    if (onTrip) return picked ? [{ from: here, to: [picked.dest_lat, picked.dest_lng], tone: "active" }] : [];
    if (screen === "loads" && board) {
      return board.loads.slice(0, 8).map((l) => ({
        from: [l.origin_lat, l.origin_lng] as [number, number],
        to: [l.dest_lat, l.dest_lng] as [number, number],
        tone: l.blocked ? ("blocked" as const) : ("clear" as const),
      }));
    }
    return [];
  }, [screen, board, picked, here, onTrip]);

  const focus = useMemo<[number, number][] | undefined>(() => {
    if (screen === "home" || screen === "hunting") return [here];
    if (picked && onTrip) {
      // At the dock `here` IS the destination. Two identical points make a
      // zero-area bounds, which fitBounds answers with maximum zoom — a blank
      // brown rectangle on the one screen where the map is the evidence.
      const dest: [number, number] = [picked.dest_lat, picked.dest_lng];
      const same = Math.abs(here[0] - dest[0]) < 1e-4 && Math.abs(here[1] - dest[1]) < 1e-4;
      return same ? [dest] : [here, dest];
    }
    if (board?.loads.length) {
      return [here, ...board.loads.slice(0, 8).map((l) => [l.dest_lat, l.dest_lng] as [number, number])];
    }
    return [here];
  }, [screen, board, picked, here, onTrip]);

  const value: RunValue = {
    screen, board, picked, verifying, scan, gps, dockPos, det, podImg, err, mapFailed, trace,
    announce,
    truck, here, pins, routes, focus, onTrip, activeTab: tab,
    hunt, openScan, finishVerify, arrive, takePaperwork, setPodImg, sendPod, reset,
    setTab, setScreen, setMapFailed,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The chrome every tab shares: the map on top of a phone, the full-height
 *  canvas beside the content on a desktop. Pure breakpoints — no measuring.
 *  `overlay` is for full-bleed takeovers like the background check, which have
 *  to sit inside this positioned root to cover the map as well as the copy. */
export function RunShell({ children, overlay, map = true }: {
  children: ReactNode; overlay?: ReactNode;
  /** The map belongs to the tabs where position is the point — finding a load
   *  and running the trip. On the others it was the same picture three times. */
  map?: boolean;
}) {
  const { screen, pins, routes, focus, gps, truck, mapFailed, setMapFailed, err, trace } = useRun();
  return (
    // Phone: map on top, content beneath. Desktop: the map IS the surface, full
    // bleed, with the content floating over it as a panel. A solid content
    // column beside a map means the map is decoration and the column is mostly
    // empty — this way the map is the product and the words sit on it.
    <div className="relative flex h-full flex-col overflow-hidden bg-background text-foreground">
      {map && (
      <div className="relative h-[38vh] max-h-95 min-h-60 shrink-0 lg:absolute lg:inset-0 lg:h-full lg:max-h-none">
        {/* Real tiles when a key is present. The keyless map stays as the
            fallback so a dead network on stage degrades instead of failing. */}
        {hasMapsKey && !mapFailed ? (
          <>
            <GoogleMapCanvas pins={pins} routes={routes} focus={focus}
              geofenceMi={screen === "dock" ? 2 : undefined}
              onFail={() => setMapFailed(true)} />
            {screen === "hunting" && <ScanOverlay />}
          </>
        ) : (
          <MapCanvas pins={pins} routes={routes} focus={focus}
            scanning={screen === "hunting"}
            geofenceMi={screen === "dock" ? 2 : undefined} />
        )}

        {(screen === "home" || screen === "hunting") && (
          <div className="absolute inset-x-4 bottom-4 lg:hidden">
            <Place gps={!!gps} city={truck?.city} />
          </div>
        )}
        {trace && trace.length > 0 && <TracePeek trace={trace} />}
      </div>
      )}

      {map && (
        <div className="pointer-events-none absolute top-6 left-6 z-10 hidden lg:block">
          <Place gps={!!gps} city={truck?.city} big />
        </div>
      )}

      <div className={cn(
        "min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+9rem)]",
        // With a map behind it, desktop renders the run in the Dispatch thread
        // instead so nothing covers the map. Without one, this content IS the
        // page and has to be visible at every width.
        map ? "lg:hidden" : "lg:mx-auto lg:w-full lg:max-w-3xl lg:p-8 lg:pb-8",
      )}>
        {err && (
          <div className="mb-4 rounded-lg border border-bad/35 bg-bad/12 px-4 py-3 text-[13px] text-bad">
            Can't reach the desk — {err}
          </div>
        )}
        {children}
      </div>

      {overlay}
    </div>
  );
}

/** The security sweep, lifted out so it can sit over real tiles too. */
function ScanOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0"
        style={{ background: "repeating-linear-gradient(0deg, rgba(52,211,153,.05) 0 1px, transparent 1px 3px)" }} />
      <div className="scan-bar absolute inset-x-0 h-30"
        style={{ background: "linear-gradient(180deg, transparent, rgba(52,211,153,.18) 60%, rgba(52,211,153,.55) 96%, transparent)" }} />
    </div>
  );
}

export function Place({ gps, city, big }: { gps: boolean; city?: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-[0.1em] text-primary/90 uppercase">
        {gps ? "Live location" : "Last known"}
      </div>
      <div className={cn("mt-0.5 font-semibold tracking-[-0.035em]", big ? "text-3xl" : "text-2xl")}>
        {city ?? "Joliet, IL"}
      </div>
    </div>
  );
}

/** What a tab says when the run is somewhere else. Never a blank screen: the
 *  driver should always know what the app is waiting on and where to go. */
export function Empty({ title, body, cta, onCta, alt, onAlt }: {
  title: string; body: string; cta: string; onCta: () => void;
  /** A second way out. Every screen that tells a driver they cannot do the
   *  thing they just asked for needs one, or the only exit is a page reload. */
  alt?: string; onAlt?: () => void;
}) {
  return (
    <div className="pt-1">
      <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.03em] lg:text-2xl">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      <Button size="cab" className="mt-6" onClick={onCta}>{cta}</Button>
      {alt && onAlt && (
        <Button variant="outline" size="cab" className="mt-2.5" onClick={onAlt}>{alt}</Button>
      )}
    </div>
  );
}

/** On a wide screen there is room to show the work behind the answer, so the
 *  agents' own trace floats over the map. A phone gets the outcome only. */
function TracePeek({ trace }: { trace: TraceEvent[] }) {
  // Payday ticks the detention meter every simulated half hour, so the tail is
  // often the same sentence seven times. Collapse runs of an identical message
  // — this panel is the "watch the agents work" moment, and a stuck-looking
  // repeat reads as a bug rather than a clock.
  const dedup: TraceEvent[] = [];
  for (const e of trace) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.agent === e.agent && prev.msg === e.msg) dedup[dedup.length - 1] = e;
    else dedup.push(e);
  }
  const last = dedup.slice(-7);
  return (
    <div className="pointer-events-none absolute right-4 bottom-4 hidden w-95 max-w-[calc(100%-2rem)] rounded-xl border border-border bg-popover/85 px-4 py-3 backdrop-blur-md lg:block">
      <div className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-ok uppercase">
        Agents working
      </div>
      <div className="flex flex-col gap-1.5">
        {last.map((e, i) => (
          <div key={i} className={cn("mono truncate text-[10.5px]",
            i === last.length - 1 ? "text-foreground" : "text-muted-foreground")}>
            <span className="text-primary">{(e as { agent_name?: string }).agent_name ?? e.agent ?? "—"}</span>
            {"  "}
            {e.msg ?? e.tool ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}
