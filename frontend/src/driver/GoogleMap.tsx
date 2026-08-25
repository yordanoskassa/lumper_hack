import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MapPin, MapRoute } from "./MapCanvas";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/** Loads the Maps JS API once per page.
 *
 *  With `loading=async` the script's onload fires before the constructors are
 *  attached — `google.maps` exists but `google.maps.Map` is still undefined, so
 *  constructing straight from onload throws. `importLibrary` is the documented
 *  way to await the actual library, and it is what makes this reliable. */
let loader: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    if (!KEY) return reject(new Error("no VITE_GOOGLE_MAPS_API_KEY"));
    if (window.google?.maps) return resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=geometry&v=weekly&loading=async`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Maps JS failed to load"));
    document.head.appendChild(s);
  }).then(async () => {
    const g = window.google?.maps as
      | (typeof window.google.maps & { importLibrary?: (n: string) => Promise<unknown> })
      | undefined;
    if (g?.importLibrary) {
      await g.importLibrary("maps");
      return;
    }
    // Older bootstrap, or a cached loader without importLibrary: wait for the
    // constructor itself rather than assuming which loading style we got.
    const deadline = Date.now() + 8000;
    while (!window.google?.maps?.Map) {
      if (Date.now() > deadline) throw new Error("google.maps.Map never appeared");
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  return loader;
}

/** The cab palette applied to Google's tiles: the map has to sit *under* the
 *  UI, so roads stay legible while everything else drops back. */
const DARK: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#242428" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9a9a98" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#4a4a55" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#b4b4b1" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#35353d" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3f3f49" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#57575f" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#d7d7d4" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c0c0f" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3f3f49" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#212126" }] },
];

const PIN_COLOR: Record<MapPin["kind"], string> = {
  you: "#F97316",
  clear: "#34D399",
  blocked: "#F87171",
  review: "#FBBF24",
  dock: "#FAFAFA",
};

const MAPS = new WeakMap<HTMLElement, google.maps.Map>();

function dot(color: string, r: number): google.maps.Symbol {
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: r,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#141417",
    strokeWeight: 2,
  };
}

export function GoogleMapCanvas({
  pins,
  routes = [],
  focus,
  geofenceMi,
  className,
  onFail,
}: {
  pins: MapPin[];
  routes?: MapRoute[];
  focus?: [number, number][];
  geofenceMi?: number;
  className?: string;
  /** Called if Maps can't load, so the caller can swap in the offline map. */
  onFail?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drawn = useRef<{ setMap: (m: google.maps.Map | null) => void }[]>([]);
  // The map lives in state, not a ref, on purpose. StrictMode remounts this
  // component and builds a second Map over the same div; with a boolean "ready"
  // flag the overlay effect never re-ran and drew its pins onto the discarded
  // first instance, so the visible map came up bare.
  const [map, setMap] = useState<google.maps.Map | null>(null);

  useEffect(() => {
    let alive = true;
    loadMaps()
      .then(() => {
        if (!alive || !host.current) return;
        // One Map per div, cached on the node. StrictMode (and every HMR pass)
        // remounts this component; constructing a second Map over the same div
        // orphans the first one's tiles and leaves the map black.
        const existing = MAPS.get(host.current);
        if (existing) return setMap(existing);
        const created = new window.google.maps.Map(host.current, {
          center: { lat: 41.525, lng: -88.0834 },
          zoom: 6,
          styles: DARK,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          backgroundColor: "#1a1a1d",
        });
        MAPS.set(host.current, created);
        setMap(created);
      })
      .catch((e) => {
        // Surface it: a silent fallback here looks identical to "no key set",
        // and that ambiguity cost real debugging time once already.
        console.error("[map] falling back to the offline map:", e);
        if (alive) onFail?.();
      });
    return () => { alive = false; };
  }, [onFail]);

  // Redraw overlays whenever the world changes. Google objects aren't React
  // children, so they're tracked by hand and cleared before each pass.
  useEffect(() => {
    const m = map;
    if (!m) return;
    const g = window.google.maps;

    drawn.current.forEach((o) => o.setMap(null));
    drawn.current = [];

    for (const r of routes) {
      const color = r.tone === "blocked" ? "#F87171" : r.tone === "active" ? "#F97316" : "#34D399";
      const line = new g.Polyline({
        path: [
          { lat: r.from[0], lng: r.from[1] },
          { lat: r.to[0], lng: r.to[1] },
        ],
        geodesic: true,
        strokeColor: color,
        strokeOpacity: r.tone === "active" ? 0 : 0.85,
        strokeWeight: 2.5,
        icons: r.tone === "active"
          ? [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: color, scale: 3 },
               offset: "0", repeat: "14px" }]
          : undefined,
        map: m,
      });
      drawn.current.push(line);
    }

    for (const p of pins) {
      const pos = { lat: p.lat, lng: p.lng };
      if (p.kind === "you") {
        drawn.current.push(new g.Marker({
          position: pos, map: m, zIndex: 3,
          icon: { ...dot(PIN_COLOR.you, 7), fillOpacity: 0.22, strokeWeight: 0, scale: 18 },
        }));
      }
      const r = p.kind === "you" ? 7 : 5.5;
      drawn.current.push(new g.Marker({
        position: pos, map: m, zIndex: 4,
        // labelOrigin is in symbol units, so it scales with the dot and the
        // text clears the pin instead of sitting on top of it.
        icon: { ...dot(PIN_COLOR[p.kind], r), labelOrigin: new g.Point(0, -(r * 0.55 + 2)) },
        title: p.label,
        label: p.label
          ? { text: p.label, color: "#FAFAFA", fontSize: "12px", fontWeight: "600",
              className: "map-label" }
          : undefined,
      }));
    }

    const dockPin = pins.find((p) => p.kind === "dock") ?? pins.find((p) => p.kind === "you");
    if (geofenceMi && dockPin) {
      drawn.current.push(new g.Circle({
        center: { lat: dockPin.lat, lng: dockPin.lng },
        radius: geofenceMi * 1609.34,
        map: m,
        fillColor: "#FBBF24", fillOpacity: 0.07,
        strokeColor: "#FBBF24", strokeOpacity: 0.5, strokeWeight: 1.5,
      }));
    }

    const pts = focus?.length ? focus : pins.map((p) => [p.lat, p.lng] as [number, number]);
    if (pts.length === 1) {
      m.setCenter({ lat: pts[0][0], lng: pts[0][1] });
      m.setZoom(7);
    } else if (pts.length > 1) {
      const b = new g.LatLngBounds();
      pts.forEach(([lat, lng]) => b.extend({ lat, lng }));
      m.fitBounds(b, { top: 60, bottom: 60, left: 40, right: 40 });
    }
  }, [map, pins, routes, focus, geofenceMi]);

  return <div ref={host} className={cn("h-full w-full bg-background", className)} />;
}

export const hasMapsKey = Boolean(KEY);
