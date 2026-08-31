import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, X } from "lucide-react";
import { api, type DriverBoard, type DriverLoad, type TraceEvent } from "@/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CITY_COORDS, haversineMi } from "./geo";
import { MapCanvas, type MapPin as Pin, type MapRoute } from "./MapCanvas";
import { GoogleMapCanvas, hasMapsKey } from "./GoogleMap";
import { DetentionCard, type DetentionState } from "./DetentionCard";
import { VerifyScan, type Check as ScanCheck } from "./VerifyScan";
import { runScreen } from "@/lib/screening";

type Screen = "home" | "hunting" | "loads" | "verify" | "trip" | "dock" | "pod" | "paid";

/** Compressed so a 4-hour wait plays out in seconds on stage: the 2h free window
 *  burns down in ~10s, then the meter and the escalation land inside 30s. */
const SIM_MIN_PER_TICK = 12;
const FREE_MIN = 120;
const RATE_HR = 75; // matches the demo tenant's detention terms in data/seed.py
const MAX_ON_SITE_MIN = 300;

export function DriverApp({ trace }: { trace?: TraceEvent[] }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [board, setBoard] = useState<DriverBoard | null>(null);
  const [picked, setPicked] = useState<DriverLoad | null>(null);
  const [verifying, setVerifying] = useState<DriverLoad | null>(null);
  const [scan, setScan] = useState<{ checks: ScanCheck[]; verdict: string } | null>(null);
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [det, setDet] = useState<DetentionState>({ active: false });
  const [podImg, setPodImg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  // Where the phone reports it is once the driver says they have arrived. The
  // truck does not physically move during a demo, so continuing to send the
  // origin makes Payday's geofence reject the delivery photo as fraudulent.
  const [dockPos, setDockPos] = useState<[number, number] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setVerifying(l);
    setScan(null);
    setScreen("verify");
    const r = await runScreen(l.id, {
      broker: l.broker, blocked: l.blocked, verdict: l.verdict, reasons: l.reasons,
    });
    setScan({ checks: r.checks, verdict: r.verdict });
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

  return (
    // Phone: map on top, content under it. Desktop: content docks left and the
    // map becomes the full-height canvas. Pure breakpoints — no measuring.
    <div className="relative flex h-full flex-col overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
      <div className="relative h-[38vh] max-h-95 min-h-60 shrink-0 lg:order-2 lg:h-full lg:max-h-none">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] lg:order-1 lg:border-r lg:border-border lg:p-8 lg:pb-8">
        {(screen === "home" || screen === "hunting") && (
          <div className="mb-5 hidden lg:block">
            <Place gps={!!gps} city={truck?.city} big />
          </div>
        )}

        {err && (
          <div className="mb-4 rounded-lg border border-bad/35 bg-bad/12 px-4 py-3 text-[13px] text-bad">
            Can't reach the desk — {err}
          </div>
        )}

        {screen === "home" && <Home onHunt={hunt} driver={truck?.driver} />}
        {screen === "hunting" && <Hunting />}
        {screen === "loads" && board && (
          <Loads board={board} onPick={openScan} />
        )}
        {screen === "trip" && picked && (
          <Trip load={picked} here={here} onArrive={async () => {
            setDet({ active: false });
            const at: [number, number] = [picked.dest_lat, picked.dest_lng];
            setDockPos(at);
            try {
              await api.arrive(picked.id, at[0], at[1]);
            } catch (e: any) {
              setErr(`Arrival did not reach the desk — ${e.message ?? e}`);
            }
            setScreen("dock");
          }} />
        )}
        {screen === "dock" && picked && (
          <>
            <DetentionCard d={det} />
            <Button size="cab" className="mt-4" onClick={() => setScreen("pod")}>
              I'm unloaded — take the paperwork
            </Button>
          </>
        )}
        {screen === "pod" && picked && (
          <Pod
            img={podImg}
            fileRef={fileRef}
            onPick={setPodImg}
            onSend={async () => {
              try {
                await api.depart(picked.id, here[0], here[1]);
                await api.pod(picked.id, podImg ?? "", here[0], here[1]);
              } catch { /* keep the demo moving */ }
              setScreen("paid");
            }}
          />
        )}
        {screen === "paid" && picked && (
          <Paid load={picked} owed={det.owed ?? 0} onDone={() => {
            setPicked(null); setPodImg(null); setDet({ active: false });
            setDockPos(null); setScreen("home");
          }} />
        )}
      </div>

      {screen === "verify" && verifying && (
        <VerifyScan
          broker={verifying.broker}
          checks={scan?.checks ?? []}
          impersonated={verifying.impersonated}
          verdict={scan?.verdict}
          loading={!scan}
          onDone={(blocked) => {
            setScan(null);
            if (blocked) { setVerifying(null); setScreen("loads"); return; }
            setPicked(verifying); setVerifying(null); setScreen("trip");
          }}
        />
      )}
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

function Place({ gps, city, big }: { gps: boolean; city?: string; big?: boolean }) {
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



function Home({ onHunt, driver }: { onHunt: () => void; driver?: string }) {
  return (
    <>
      <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.03em] lg:text-2xl">
        Your truck is empty{driver ? `, ${driver.split(" ").pop()}` : ""}.
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Tap once. We check every load for you before you ever see it.
      </p>
      <Button size="cab" className="mt-6" onClick={onHunt}>Find me a load</Button>
    </>
  );
}

function Hunting() {
  const lines = [
    "Pulling every load near you…",
    "Checking real miles and fuel cost…",
    "Running background checks on each broker…",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, lines.length - 1)), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="pt-1">
      {lines.slice(0, i + 1).map((l, n) => (
        <div key={n} className={cn("scan-row flex items-center gap-2.5 py-2 text-[14.5px]",
          n === i ? "text-foreground" : "text-muted-foreground")}>
          <span className={cn("size-1.5 shrink-0 rounded-full", n === i ? "bg-ok" : "bg-muted-foreground/50")} />
          {l}
        </div>
      ))}
    </div>
  );
}

function Loads({ board, onPick }: { board: DriverBoard; onPick: (l: DriverLoad) => void }) {
  const good = board.loads.filter((l) => !l.blocked);
  const bad = board.loads.filter((l) => l.blocked);
  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-0.03em]">
        {good.length} load{good.length === 1 ? "" : "s"} worth taking
      </h1>
      {!!bad.length && (
        <p className="mt-1.5 text-sm text-bad">We threw out {bad.length} you should never see.</p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {[...good, ...bad].map((l) => <LoadCard key={l.id} l={l} onPick={onPick} />)}
      </div>
    </>
  );
}

/** Three states, never two: a REVIEW load dressed as "SAFE" with a green tick is
 *  the one lie this screen must not tell. */
const VERDICT = {
  CLEAR: { label: "CHECKED · SAFE", cls: "text-ok bg-ok/15", Icon: Check },
  REVIEW: { label: "CHECKED · ONE CATCH", cls: "text-warn bg-warn/15", Icon: AlertTriangle },
  BLOCKED: { label: "BLOCKED", cls: "text-bad bg-bad/15", Icon: X },
} as const;

function LoadCard({ l, onPick }: { l: DriverLoad; onPick: (l: DriverLoad) => void }) {
  const v = VERDICT[l.blocked ? "BLOCKED" : l.verdict === "REVIEW" ? "REVIEW" : "CLEAR"];
  const tone = l.blocked ? "text-bad" : l.verdict === "REVIEW" ? "text-warn" : "text-ok";
  return (
    <button
      onClick={() => onPick(l)}
      className={cn(
        "w-full rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
        l.blocked ? "border-bad/35 opacity-75" : "border-border",
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cn("rounded-full px-2 py-1 text-[10.5px] font-semibold tracking-[0.08em]", v.cls)}>
          {v.label}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{l.eq}</span>
      </div>

      <div className={cn("num text-[34px] leading-none font-semibold tracking-[-0.035em]",
        l.blocked && "text-muted-foreground line-through")}>
        ${l.rate.toLocaleString()}
      </div>
      <div className="mt-2 text-[15px] font-medium">{l.origin} → {l.dest}</div>
      <div className="num mt-0.5 text-[13px] text-muted-foreground">
        {Math.round(l.miles)} miles · ${l.rpm.toFixed(2)} a mile after fuel
      </div>

      <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
        {l.reasons.slice(0, 2).map((r, i) => (
          <div key={i} className="flex gap-2 text-[13px] text-muted-foreground">
            <v.Icon className={cn("mt-px size-3.5 shrink-0", tone)} />
            <span className="min-w-0">{r}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

function Trip({ load, here, onArrive }: {
  load: DriverLoad; here: [number, number]; onArrive: () => void;
}) {
  const left = Math.round(haversineMi(here, [load.dest_lat, load.dest_lng]) * 1.19);
  return (
    <>
      <div className="text-[11px] font-semibold tracking-[0.1em] text-primary/90 uppercase">On the way to</div>
      <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.035em]">{load.dest}</h1>
      <div className="num mt-2.5 text-[15px] text-muted-foreground">
        {left} miles out · ${load.rate.toLocaleString()} on this run
      </div>
      <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3.5 text-[13.5px] leading-relaxed text-muted-foreground">
        When you pull into the dock, hit the button. That timestamp is what gets you
        paid if they make you wait.
      </div>
      <Button size="cab" className="mt-5" onClick={onArrive}>I'm at the dock</Button>
    </>
  );
}

function Pod({ img, fileRef, onPick, onSend }: {
  img: string | null;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPick: (b64: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-0.03em]">Snap the signed paperwork</h1>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
        One photo. We read it, invoice it, and chase the money.
      </p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => onPick(String(r.result).split(",")[1] ?? "");
          r.readAsDataURL(f);
        }} />

      <button
        onClick={() => fileRef.current?.click()}
        className={cn(
          "mt-4 flex h-48 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[15px] font-medium transition-colors",
          img ? "border-ok bg-ok/8 text-ok" : "border-border bg-muted/25 text-muted-foreground hover:bg-muted/40",
        )}
      >
        <Camera className="size-6" />
        {img ? "Photo captured" : "Tap to open the camera"}
      </button>

      <Button size="cab" className="mt-4" disabled={!img} onClick={onSend}>Send it</Button>
    </>
  );
}

function Paid({ load, owed, onDone }: { load: DriverLoad; owed: number; onDone: () => void }) {
  const total = load.rate + owed;
  return (
    <>
      <div className="text-[11px] font-semibold tracking-[0.1em] text-ok uppercase">Money in</div>
      <div className="num mt-1.5 text-[46px] leading-none font-semibold tracking-[-0.04em]">
        ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <Row k="The load" v={`$${load.rate.toLocaleString()}`} />
        {owed > 0 && <Row k="Waiting time we fought for" v={`+$${owed.toFixed(2)}`} accent />}
      </div>
      {owed > 0 && (
        <p className="mt-3.5 text-[13.5px] leading-relaxed text-muted-foreground">
          The broker was going to pay you nothing for that wait. Your GPS timestamps
          are what changed their mind.
        </p>
      )}
      <Button size="cab" className="mt-5" onClick={onDone}>Find the next one</Button>
    </>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between border-t border-border px-4 py-3 text-sm first:border-t-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("num font-medium", accent && "text-primary")}>{v}</span>
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
