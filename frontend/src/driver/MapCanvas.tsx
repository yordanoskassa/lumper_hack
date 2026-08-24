import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CITY_COORDS, LAKE_PATHS, MAP_H, MAP_W, UNITS_PER_MI, US_PATH, GRID, arc, project } from "./geo";

export interface MapPin {
  lat: number;
  lng: number;
  kind: "you" | "clear" | "blocked" | "review" | "dock";
  label?: string;
}

export interface MapRoute {
  from: [number, number];
  to: [number, number];
  tone: "clear" | "blocked" | "active";
}

const PIN_COLOR: Record<MapPin["kind"], string> = {
  you: "#F97316",
  clear: "#34D399",
  blocked: "#F87171",
  review: "#F59E0B",
  dock: "#FAFAFA",
};

/** Camera: interpolate the viewBox itself so moving between "the whole country"
 *  and "this dock" reads as a flight, not a cut. viewBox isn't CSS-animatable,
 *  so we drive it frame by frame. */
function useCamera(target: [number, number, number, number]) {
  const [box, setBox] = useState(target);
  const from = useRef(target);
  const start = useRef(0);
  const raf = useRef(0);
  const key = target.join(",");

  useEffect(() => {
    from.current = box;
    start.current = performance.now();
    const DUR = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start.current) / DUR);
      // easeInOutCubic — settles instead of slamming
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setBox(from.current.map((v, i) => v + (target[i] - v) * e) as typeof target);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return box;
}

/** Fit a viewBox around the points of interest, with breathing room. A single
 *  point still gets a ~900-mile window — zoomed to a dot, the Midwest is just
 *  empty fill and the viewer loses all sense of place. */
const MIN_SPAN = 900 * UNITS_PER_MI;

function fit(
  points: [number, number][],
  padPct: number,
  aspect: number,
): [number, number, number, number] {
  if (!points.length) return [0, 0, MAP_W, MAP_H];
  const xs = points.map((p) => project(p[0], p[1])[0]);
  const ys = points.map((p) => project(p[0], p[1])[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, MIN_SPAN);
  const h = Math.max(maxY - minY, MIN_SPAN * 0.6);
  const pad = Math.max(w, h) * padPct;
  const bw = w + pad * 2;
  const bh = h + pad * 2;
  // Match the aspect of the element we actually render into. Using the map's own
  // aspect here lets `slice` crop asymmetrically and throws the subject off-centre.
  let fw = bw, fh = bh;
  if (bw / bh > aspect) fh = bw / aspect;
  else fw = bh * aspect;
  // centre the points of interest inside the final window
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return [cx - fw / 2, cy - fh / 2, fw, fh];
}

export function MapCanvas({
  pins,
  routes = [],
  focus,
  geofenceMi,
  scanning,
  className,
}: {
  pins: MapPin[];
  routes?: MapRoute[];
  /** Points the camera should frame. Omit to show the whole country. */
  focus?: [number, number][];
  /** Draw a dock radius (miles) around the first "dock" pin. */
  geofenceMi?: number;
  scanning?: boolean;
  /** The map fills whatever box it is given — the parent owns the height so a
   *  breakpoint can change it without JavaScript. */
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(MAP_W / MAP_H);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width && height) setAspect(width / height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const box = useCamera(focus?.length ? fit(focus, 0.35, aspect) : [0, 0, MAP_W, MAP_H]);
  const viewBox = box.map((v) => v.toFixed(1)).join(" ");
  // Scale strokes/radii with zoom so nothing balloons when the camera closes in.
  const z = box[2] / MAP_W;
  const dock = pins.find((p) => p.kind === "dock") ?? pins.find((p) => p.kind === "you");
  // 1° latitude ≈ 69 miles → radius in projected units
  const fenceR = geofenceMi ? (geofenceMi / 69) * (MAP_H / 25.4) : 0;

  return (
    <div ref={wrap} className={cn("relative h-full overflow-hidden bg-[#0C0C0F]", className)}>
      <svg viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
        className="block">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F97316" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2F2F37" />
            <stop offset="100%" stopColor="#24242B" />
          </linearGradient>
          <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={3 * z} />
          </filter>
        </defs>

        {/* grid — meridians and parallels, barely there */}
        <g stroke="#FFFFFF" strokeOpacity="0.05" strokeWidth={1 * z}>
          {GRID.meridians.map((x, i) => <line key={`m${i}`} x1={x} y1={0} x2={x} y2={MAP_H} />)}
          {GRID.parallels.map((y, i) => <line key={`p${i}`} x1={0} y1={y} x2={MAP_W} y2={y} />)}
        </g>

        <path d={US_PATH} fill="url(#land)" stroke="#4A4A55" strokeWidth={1.4 * z}
          strokeLinejoin="round" />

        {LAKE_PATHS.map((d, i) => (
          <path key={i} d={d} fill="#0C0C0F" stroke="#4A4A55" strokeWidth={1 * z}
            strokeLinejoin="round" />
        ))}

        {/* every city the board posts from, as faint ground truth */}
        <g fill="#FFFFFF" fillOpacity="0.16">
          {Object.values(CITY_COORDS).map(([lat, lng], i) => {
            const [x, y] = project(lat, lng);
            return <circle key={i} cx={x} cy={y} r={1.8 * z} />;
          })}
        </g>

        {routes.map((r, i) => {
          const a = project(r.from[0], r.from[1]);
          const b = project(r.to[0], r.to[1]);
          const color = r.tone === "blocked" ? "#F87171" : r.tone === "active" ? "#F97316" : "#34D399";
          return (
            <g key={i}>
              <path d={arc(a, b)} fill="none" stroke={color} strokeOpacity="0.22"
                strokeWidth={6 * z} filter="url(#soft)" />
              <path d={arc(a, b)} fill="none" stroke={color} strokeWidth={2 * z}
                strokeLinecap="round"
                strokeDasharray={r.tone === "active" ? `${8 * z} ${6 * z}` : undefined}>
                {r.tone === "active" && (
                  <animate attributeName="stroke-dashoffset" from={14 * z} to="0"
                    dur="0.9s" repeatCount="indefinite" />
                )}
              </path>
            </g>
          );
        })}

        {/* dock geofence — the radius that decides "the driver is on site" */}
        {geofenceMi && dock && (() => {
          const [x, y] = project(dock.lat, dock.lng);
          return (
            <g>
              <circle cx={x} cy={y} r={fenceR} fill="#F59E0B" fillOpacity="0.07"
                stroke="#F59E0B" strokeOpacity="0.5" strokeWidth={1.2 * z}
                strokeDasharray={`${5 * z} ${4 * z}`} />
              <circle cx={x} cy={y} r={fenceR} fill="none" stroke="#F59E0B" strokeWidth={1 * z}
                opacity="0.6">
                <animate attributeName="r" from={fenceR * 0.75} to={fenceR * 1.05}
                  dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="2.6s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })()}

        {pins.map((p, i) => {
          const [x, y] = project(p.lat, p.lng);
          const c = PIN_COLOR[p.kind];
          const you = p.kind === "you";
          return (
            <g key={i}>
              {you && <circle cx={x} cy={y} r={26 * z} fill="url(#glow)" />}
              {you && (
                <circle cx={x} cy={y} r={5 * z} fill="none" stroke="#F97316" strokeWidth={1.5 * z}>
                  <animate attributeName="r" from={5 * z} to={22 * z} dur="2.1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.9" to="0" dur="2.1s" repeatCount="indefinite" />
                </circle>
              )}
              {p.kind === "blocked" && (
                <circle cx={x} cy={y} r={9 * z} fill="none" stroke="#F87171"
                  strokeWidth={1.2 * z} strokeOpacity="0.7" strokeDasharray={`${3 * z} ${3 * z}`}>
                  <animateTransform attributeName="transform" type="rotate"
                    from={`0 ${x} ${y}`} to={`360 ${x} ${y}`} dur="7s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={x} cy={y} r={(you ? 5.5 : 4) * z} fill={c}
                stroke="#141417" strokeWidth={1.4 * z} />
              {p.label && (
                <text x={x} y={y - 11 * z} textAnchor="middle" fill="#FAFAFA"
                  fontSize={11 * z} fontWeight="600" letterSpacing={-0.2 * z}
                  style={{ paintOrder: "stroke", stroke: "#141417", strokeWidth: 3 * z }}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {scanning && <ScanSweep />}
      {/* vignette so the map sinks under the UI instead of fighting it */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 35%, transparent 40%, rgba(10,10,12,.55) 100%)" }}
      />
    </div>
  );
}

/** The security sweep: a radar bar crossing the map while agents verify. */
function ScanSweep() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: "repeating-linear-gradient(0deg, rgba(52,211,153,.05) 0 1px, transparent 1px 3px)" }}
      />
      <div
        className="scan-bar absolute inset-x-0 h-30"
        style={{ background: "linear-gradient(180deg, transparent, rgba(52,211,153,.18) 60%, rgba(52,211,153,.55) 96%, transparent)" }}
      />
    </div>
  );
}
