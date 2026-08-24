import { useEffect, useMemo, useRef, useState } from "react";
import { api, type DriverBoard, type DriverLoad, type TraceEvent } from "../api";
import { C, PRIMARY_BTN_H } from "../theme";
import { CITY_COORDS, haversineMi } from "./geo";
import { MapCanvas, type MapPin, type MapRoute } from "./MapCanvas";
import { DetentionCard, type DetentionState } from "./DetentionCard";
import { VerifyScan, type Check } from "./VerifyScan";

type Screen = "home" | "hunting" | "loads" | "verify" | "trip" | "dock" | "pod" | "paid";

/** Compressed so a 4-hour wait plays out in seconds on stage: the 2h free window
 *  burns down in ~10s, then the meter and the escalation land inside 30s. */
const SIM_MIN_PER_TICK = 12;
const FREE_MIN = 120;
const RATE_HR = 75; // matches the demo tenant's detention terms in data/seed.py
const MAX_ON_SITE_MIN = 300;

export function DriverApp({ trace }: { trace?: TraceEvent[] }) {
  const root = useRef<HTMLDivElement>(null);
  // Measured off the element, not the viewport, so the same component is correct
  // full-screen on a laptop, in a phone browser, and inside the console's pane.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 860));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [screen, setScreen] = useState<Screen>("home");
  const [board, setBoard] = useState<DriverBoard | null>(null);
  const [picked, setPicked] = useState<DriverLoad | null>(null);
  const [verifying, setVerifying] = useState<DriverLoad | null>(null);
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [det, setDet] = useState<DetentionState>({ active: false });
  const [podImg, setPodImg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
  const here: [number, number] = gps ?? (truck ? [truck.lat, truck.lng] : [41.525, -88.0834]);
  const hereLabel = gps ? "You are here" : truck?.city ?? "Joliet IL";

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

  // the detention clock: real endpoint when it exists, local sim when it doesn't
  useEffect(() => {
    if (screen !== "dock" || !picked) return;
    let alive = true;
    const started = Date.now();
    const tick = async () => {
      if (!alive) return;
      try {
        const d = await api.detention();
        if (d && d.active) { setDet(d); return; }
      } catch { /* fall through to the local clock */ }
      // Capped: if someone leaves this screen open mid-demo the meter must not
      // drift into numbers that dwarf the load itself and read as fake.
      const onSite = Math.min(
        MAX_ON_SITE_MIN,
        ((Date.now() - started) / 1000) * SIM_MIN_PER_TICK,
      );
      const billable = Math.max(0, onSite - FREE_MIN);
      const timeline: DetentionState["timeline"] = [
        { ts: 0, label: `Arrived at ${picked.dest}. Your location was recorded.`, kind: "ok" },
      ];
      let status: DetentionState["status"] = "FREE_WINDOW";
      if (onSite > FREE_MIN) {
        status = "METER_RUNNING";
        timeline.push({ ts: 1, label: "Free waiting time is up. The meter started.", kind: "money" });
      }
      if (onSite > FREE_MIN + 20) {
        status = "NOTICE_SENT";
        timeline.push({ ts: 2, label: "Your agent emailed the broker, with the timestamps attached.", kind: "ok" });
      }
      if (onSite > FREE_MIN + 60) {
        status = "CLAIM_FILED";
        timeline.push({ ts: 3, label: "No reply. Your agent filed the detention claim for you.", kind: "money" });
      }
      setDet({
        active: true, posting_id: picked.id, stop: picked.dest,
        free_minutes: FREE_MIN, minutes_on_site: onSite, billable_minutes: billable,
        rate_per_hour: RATE_HR, owed: (billable / 60) * RATE_HR,
        notice_sent: onSite > FREE_MIN + 20, status, timeline,
      });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [screen, picked]);

  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [{ lat: here[0], lng: here[1], kind: "you", label: hereLabel }];
    if (screen === "loads" && board) {
      for (const l of board.loads.slice(0, 8)) {
        out.push({
          lat: l.dest_lat, lng: l.dest_lng,
          kind: l.blocked ? "blocked" : l.verdict === "REVIEW" ? "review" : "clear",
        });
      }
    }
    if ((screen === "trip" || screen === "dock" || screen === "pod" || screen === "paid") && picked) {
      out.push({ lat: picked.dest_lat, lng: picked.dest_lng, kind: "dock", label: picked.dest });
    }
    return out;
  }, [screen, board, picked, here, hereLabel]);

  const routes = useMemo<MapRoute[]>(() => {
    if (screen === "trip" || screen === "dock" || screen === "pod" || screen === "paid") {
      return picked ? [{ from: here, to: [picked.dest_lat, picked.dest_lng], tone: "active" as const }] : [];
    }
    if (screen === "loads" && board) {
      return board.loads.slice(0, 8).map((l) => ({
        from: [l.origin_lat, l.origin_lng] as [number, number],
        to: [l.dest_lat, l.dest_lng] as [number, number],
        tone: l.blocked ? ("blocked" as const) : ("clear" as const),
      }));
    }
    return [];
  }, [screen, board, picked, here]);

  const focus = useMemo<[number, number][] | undefined>(() => {
    if (screen === "home" || screen === "hunting") return [here];
    if (picked && screen !== "loads") return [here, [picked.dest_lat, picked.dest_lng]];
    if (board?.loads.length) {
      return [here, ...board.loads.slice(0, 8).map((l) => [l.dest_lat, l.dest_lng] as [number, number])];
    }
    return [here];
  }, [screen, board, picked, here]);

  // One app, two shapes. Narrow: map on top, content beneath — the phone layout.
  // Wide: the map becomes the full-height canvas and the content docks beside it.
  const mapH = screen === "home" || screen === "trip" ? 340 : screen === "loads" ? 210 : 180;

  const place = (
    <div style={{ marginBottom: wide ? 22 : 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".1em",
        textTransform: "uppercase", color: "#FDBA74" }}>
        {gps ? "Live location" : "Last known"}
      </div>
      <div style={{ fontSize: wide ? 30 : 26, fontWeight: 600, letterSpacing: "-.035em", marginTop: 2 }}>
        {truck?.city ?? "Joliet, IL"}
      </div>
    </div>
  );

  const content = (
    <>
      {wide && (screen === "home" || screen === "hunting") && place}
      {err && (
          <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 10,
            background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.35)",
            color: "#FCA5A5", fontSize: 13 }}>
            Can't reach the desk — {err}
          </div>
        )}

        {screen === "home" && <Home onHunt={hunt} driver={truck?.driver} />}
        {screen === "hunting" && <Hunting />}
        {screen === "loads" && board && (
          <Loads board={board} onPick={(l) => { setVerifying(l); setScreen("verify"); }} />
        )}
        {screen === "trip" && picked && (
          <Trip load={picked} here={here} onArrive={async () => {
            try { await api.arrive(picked.id, here[0], here[1]); } catch { /* sim clock covers it */ }
            setScreen("dock");
          }} />
        )}
        {screen === "dock" && picked && (
          <>
            <DetentionCard d={det} />
            <BigBtn onClick={() => setScreen("pod")} style={{ marginTop: 16 }}>
              I'm unloaded — take the paperwork
            </BigBtn>
          </>
        )}
        {screen === "pod" && picked && (
          <Pod
            img={podImg}
            fileRef={fileRef}
            onPick={(b64) => setPodImg(b64)}
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
            setPicked(null); setPodImg(null); setDet({ active: false }); setScreen("home");
          }} />
        )}
    </>
  );

  const map = (
    <MapCanvas pins={pins} routes={routes} focus={focus}
      height={wide ? "100%" : mapH}
      scanning={screen === "hunting"}
      geofenceMi={screen === "dock" ? 40 : undefined} />
  );

  const scan = screen === "verify" && verifying && (
    <VerifyScan
      broker={verifying.broker}
      checks={checksFor(verifying)}
      onDone={(blocked) => {
        if (blocked) { setVerifying(null); setScreen("loads"); return; }
        setPicked(verifying); setVerifying(null); setScreen("trip");
      }}
    />
  );

  return (
    <div ref={root} style={{ position: "relative", height: "100%", background: C.dBg,
      color: C.dText, overflow: "hidden",
      display: wide ? "grid" : "flex",
      gridTemplateColumns: wide ? "minmax(360px, 460px) minmax(0, 1fr)" : undefined,
      flexDirection: wide ? undefined : "column" }}>

      {wide ? (
        <>
          <div style={{ overflowY: "auto", padding: "34px 30px 34px 34px", minHeight: 0,
            borderRight: `1px solid ${C.dBorder}` }}>
            {content}
          </div>
          <div style={{ position: "relative", minWidth: 0 }}>
            {map}
            {trace && trace.length > 0 && <TracePeek trace={trace} />}
          </div>
        </>
      ) : (
        <>
          {map}
          {(screen === "home" || screen === "hunting") && (
            <div style={{ position: "absolute", top: mapH - 74, left: 18, right: 18 }}>
              {place}
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 18px 22px", minHeight: 0 }}>
            {content}
          </div>
        </>
      )}

      {scan}
    </div>
  );
}

/** On a wide screen there is room to show the work behind the answer, so the
 *  agents' own trace floats over the map. A phone gets the outcome only. */
function TracePeek({ trace }: { trace: TraceEvent[] }) {
  const last = trace.slice(-7);
  return (
    <div style={{
      // clears the console's floating chat dock, which owns the bottom-right corner
      position: "absolute", right: 18, bottom: 78, width: 380, maxWidth: "calc(100% - 36px)",
      background: "rgba(11,11,14,.86)", backdropFilter: "blur(14px)",
      border: "1px solid rgba(255,255,255,.10)", borderRadius: 14, padding: "13px 15px",
      pointerEvents: "none",
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".14em",
        textTransform: "uppercase", color: "#34D399", marginBottom: 9 }}>
        Agents working
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {last.map((e, i) => (
          <div key={i} className="mono" style={{
            fontSize: 10.5, color: i === last.length - 1 ? "#FAFAFA" : "#8A8A86",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            <span style={{ color: "#F97316" }}>{e.agent ?? "—"}</span>{"  "}{e.msg ?? e.tool ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Turn the backend's verdict into the five questions a bystander would ask. */
function checksFor(l: DriverLoad): Check[] {
  const bad = l.blocked;
  return [
    { q: "Is this a real company?", detail: "Federal motor carrier registry (FMCSA)",
      verdict: bad ? "fail" : "pass",
      found: bad ? `No active operating authority on file for ${l.mc}` : undefined },
    { q: "How old is their website?", detail: "Domain registration record",
      verdict: bad ? "fail" : "pass",
      found: bad ? "Registered 11 days ago" : undefined },
    { q: "Does their phone number match the registry?",
      detail: "Load posting vs. federal record",
      verdict: bad ? "fail" : "pass",
      found: bad ? "Posting says 312-555-0142 · registry says 312-555-0198" : undefined },
    { q: "Have they paid other drivers?", detail: "Payment history on this lane",
      verdict: bad ? "warn" : "pass",
      found: bad ? "No completed loads on record" : undefined },
    { q: "Do we remember them?", detail: "Your carrier's memory",
      verdict: bad ? "fail" : "pass",
      found: bad ? "Same bank routing number as a company that owes you $4,000" : undefined },
  ];
}

function Home({ onHunt, driver }: { onHunt: () => void; driver?: string }) {
  return (
    <>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1.25 }}>
        Your truck is empty{driver ? `, ${driver.split(" ").pop()}` : ""}.
      </div>
      <div style={{ fontSize: 15, color: C.dSub, marginTop: 8, lineHeight: 1.45 }}>
        Tap once. We check every load for you before you ever see it.
      </div>
      <BigBtn onClick={onHunt} style={{ marginTop: 22 }}>Find me a load</BigBtn>
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
    <div style={{ paddingTop: 6 }}>
      {lines.slice(0, i + 1).map((l, n) => (
        <div key={n} className="scan-row" style={{ display: "flex", gap: 10, alignItems: "center",
          padding: "9px 0", fontSize: 14.5, color: n === i ? C.dText : C.dSub }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%",
            background: n === i ? "#34D399" : "#5C5C58" }} />
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
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.03em" }}>
        {good.length} load{good.length === 1 ? "" : "s"} worth taking
      </div>
      {!!bad.length && (
        <div style={{ fontSize: 14, color: "#FCA5A5", marginTop: 6 }}>
          We threw out {bad.length} you should never see.
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {good.map((l) => <LoadCard key={l.id} l={l} onPick={onPick} />)}
        {bad.map((l) => <LoadCard key={l.id} l={l} onPick={onPick} />)}
      </div>
    </>
  );
}

function LoadCard({ l, onPick }: { l: DriverLoad; onPick: (l: DriverLoad) => void }) {
  const blocked = l.blocked;
  return (
    <button onClick={() => onPick(l)} style={{
      textAlign: "left", width: "100%", background: C.dCard, borderRadius: 16, padding: 16,
      border: `1px solid ${blocked ? "rgba(248,113,113,.35)" : C.dBorder}`,
      opacity: blocked ? 0.72 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", padding: "4px 8px",
          borderRadius: 999,
          color: blocked ? "#F87171" : "#34D399",
          background: blocked ? "rgba(248,113,113,.14)" : "rgba(52,211,153,.14)",
        }}>
          {blocked ? "BLOCKED" : "CHECKED · SAFE"}
        </span>
        <span style={{ fontSize: 12, color: C.dSub, marginLeft: "auto" }}>{l.eq}</span>
      </div>

      <div className="num" style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-.035em",
        color: blocked ? C.dSub : C.dText, lineHeight: 1,
        textDecoration: blocked ? "line-through" : undefined }}>
        ${l.rate.toLocaleString()}
      </div>
      <div style={{ fontSize: 15, marginTop: 8, color: C.dText, fontWeight: 500 }}>
        {l.origin} → {l.dest}
      </div>
      <div style={{ fontSize: 13, color: C.dSub, marginTop: 3 }}>
        {Math.round(l.miles)} miles · ${l.rpm.toFixed(2)} a mile
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.dBorder}`,
        display: "flex", flexDirection: "column", gap: 5 }}>
        {l.reasons.slice(0, 2).map((r, i) => (
          <div key={i} style={{ fontSize: 13, color: C.dSub, display: "flex", gap: 8 }}>
            <span style={{ color: blocked ? "#F87171" : "#34D399" }}>{blocked ? "✕" : "✓"}</span>
            {r}
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
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".1em",
        textTransform: "uppercase", color: "#FDBA74" }}>
        On the way to
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.035em", marginTop: 3 }}>
        {load.dest}
      </div>
      <div className="num" style={{ fontSize: 15, color: C.dSub, marginTop: 10 }}>
        {left} miles out · ${load.rate.toLocaleString()} on this run
      </div>
      <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 12, background: C.dCard,
        border: `1px solid ${C.dBorder}`, fontSize: 13.5, color: C.dSub, lineHeight: 1.5 }}>
        When you pull into the dock, hit the button. That timestamp is what gets you
        paid if they make you wait.
      </div>
      <BigBtn onClick={onArrive} style={{ marginTop: 20 }}>I'm at the dock</BigBtn>
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
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.03em" }}>
        Snap the signed paperwork
      </div>
      <div style={{ fontSize: 14.5, color: C.dSub, marginTop: 7, lineHeight: 1.45 }}>
        One photo. We read it, invoice it, and chase the money.
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => onPick(String(r.result).split(",")[1] ?? "");
          r.readAsDataURL(f);
        }} />

      <button onClick={() => fileRef.current?.click()} style={{
        marginTop: 18, width: "100%", height: 190, borderRadius: 16,
        border: `2px dashed ${img ? "#34D399" : "rgba(255,255,255,.22)"}`,
        background: img ? "rgba(52,211,153,.08)" : "rgba(255,255,255,.03)",
        color: img ? "#34D399" : C.dSub, fontSize: 15, fontWeight: 500,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {img ? "✓ Photo captured" : "Tap to open the camera"}
      </button>

      <BigBtn onClick={onSend} disabled={!img} style={{ marginTop: 18 }}>Send it</BigBtn>
    </>
  );
}

function Paid({ load, owed, onDone }: { load: DriverLoad; owed: number; onDone: () => void }) {
  const total = load.rate + owed;
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".1em",
        textTransform: "uppercase", color: "#34D399" }}>
        Money in
      </div>
      <div className="num" style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-.04em",
        marginTop: 6, lineHeight: 1 }}>
        ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <div style={{ marginTop: 18, background: C.dCard, borderRadius: 14,
        border: `1px solid ${C.dBorder}`, overflow: "hidden" }}>
        <Row k="The load" v={`$${load.rate.toLocaleString()}`} />
        {owed > 0 && (
          <Row k="Waiting time we fought for" v={`+$${owed.toFixed(2)}`} accent="#F97316" />
        )}
      </div>
      {owed > 0 && (
        <div style={{ fontSize: 13.5, color: C.dSub, marginTop: 14, lineHeight: 1.5 }}>
          The broker was going to pay you nothing for that wait. Your GPS timestamps
          are what changed their mind.
        </div>
      )}
      <BigBtn onClick={onDone} style={{ marginTop: 20 }}>Find the next one</BigBtn>
    </>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "13px 15px",
      borderTop: `1px solid ${C.dBorder}`, fontSize: 14 }}>
      <span style={{ color: C.dSub }}>{k}</span>
      <span className="num" style={{ color: accent ?? C.dText, fontWeight: 500 }}>{v}</span>
    </div>
  );
}

/** 64px tall, near-black on orange. Same floor as the real Lumper cab UI. */
function BigBtn({ children, onClick, disabled, style }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      width: "100%", height: PRIMARY_BTN_H, borderRadius: 10,
      background: disabled ? "rgba(255,255,255,.09)" : "#F97316",
      color: disabled ? "#6F6F6C" : C.onAccent,
      fontSize: 19, fontWeight: 600, letterSpacing: "-.02em",
      transition: "background-color .15s ease-out",
      cursor: disabled ? "default" : "pointer", ...style,
    }}>
      {children}
    </button>
  );
}
