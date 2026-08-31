/** A map with no API key and no npm dependency: a coarse continental-US outline
 *  traced in real lat/lng, projected through the same function as the city pins
 *  and route lines. Same projection for every layer is the whole trick — outline,
 *  truck, loads and routes cannot drift apart. Nothing here can fail on stage. */

/** Equirectangular, squeezed by cos(lat) at mid-latitude so the country isn't
 *  stretched wide. Good enough at phone size; an Albers conic buys nothing here. */
const LAT0_COS = Math.cos((38.5 * Math.PI) / 180);

export const BOUNDS = { lngMin: -125.2, lngMax: -66.4, latMin: 24.2, latMax: 49.6 };

export const MAP_W = 1000;
export const MAP_H = Math.round(
  (MAP_W * (BOUNDS.latMax - BOUNDS.latMin)) /
    ((BOUNDS.lngMax - BOUNDS.lngMin) * LAT0_COS),
);

export function project(lat: number, lng: number): [number, number] {
  const x =
    ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * MAP_W;
  const y =
    ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * MAP_H;
  return [x, y];
}

/** [lng, lat] walking the border clockwise from the Pacific Northwest. The Great
 *  Lakes are cut straight across — at this scale the notches read as noise. */
const OUTLINE: [number, number][] = [
  [-124.7, 48.4], [-124.1, 46.9], [-124.0, 44.6], [-124.4, 43.0], [-124.2, 41.8],
  [-124.1, 40.4], [-123.8, 39.4], [-122.9, 38.0], [-121.9, 36.6], [-120.6, 34.6],
  [-118.4, 33.7], [-117.1, 32.5],
  [-114.7, 32.7], [-111.0, 31.3], [-108.2, 31.3], [-106.5, 31.8], [-104.9, 30.6],
  [-103.1, 29.0], [-101.4, 29.8], [-99.1, 26.4], [-97.4, 25.9],
  [-97.2, 27.8], [-95.3, 28.9], [-93.8, 29.7], [-91.5, 29.2], [-89.4, 29.0],
  [-88.0, 30.4], [-85.7, 30.2], [-84.3, 30.0], [-82.8, 29.0], [-82.7, 27.5],
  [-81.8, 26.0], [-80.4, 25.2],
  [-80.1, 26.7], [-80.6, 28.4], [-81.3, 29.9], [-81.0, 31.5], [-79.9, 32.8],
  [-78.0, 33.9], [-75.8, 35.2], [-76.0, 36.9], [-75.1, 38.3], [-74.0, 39.5],
  [-74.0, 40.7], [-71.9, 41.3], [-70.0, 41.7], [-70.8, 42.9], [-70.7, 43.5],
  [-69.0, 44.0], [-67.0, 44.9], [-67.8, 45.7], [-69.2, 47.5], [-71.5, 45.0],
  [-74.7, 45.0], [-76.8, 44.0], [-79.2, 43.5], [-79.0, 42.8], [-81.3, 42.2],
  [-83.0, 42.0], [-82.4, 43.0], [-82.6, 45.9], [-84.5, 46.5], [-86.5, 46.5],
  [-88.4, 48.3], [-90.0, 48.1], [-95.2, 49.0], [-104.0, 49.0], [-117.0, 49.0],
  [-123.0, 49.0],
];

export const US_PATH =
  OUTLINE.map(([lng, lat], i) => {
    const [x, y] = project(lat, lng);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z";

/** The Great Lakes, drawn over the land. Coarse, but they are what makes a
 *  Midwest view legible at a glance — Joliet sits on Lake Michigan's south tip,
 *  and without the lake that whole region is featureless fill. */
const LAKES: [number, number][][] = [
  // Michigan
  [[-87.9, 41.65], [-86.4, 41.75], [-86.2, 42.8], [-86.4, 44.0], [-85.6, 45.2],
   [-85.0, 45.8], [-85.6, 45.9], [-86.9, 45.4], [-87.6, 45.1], [-87.2, 44.5],
   [-87.8, 44.0], [-87.6, 43.0], [-87.9, 42.3]],
  // Superior
  [[-92.1, 46.75], [-90.4, 46.6], [-89.3, 46.85], [-88.4, 46.9], [-87.0, 46.5],
   [-85.5, 46.7], [-84.4, 46.5], [-84.3, 46.9], [-85.0, 47.2], [-86.5, 47.6],
   [-88.0, 48.2], [-89.5, 48.0], [-90.8, 48.1]],
  // Huron
  [[-84.4, 46.5], [-83.5, 46.0], [-82.5, 45.3], [-81.7, 45.2], [-81.3, 44.5],
   [-81.7, 43.5], [-82.4, 43.0], [-82.5, 44.0], [-83.4, 44.3], [-83.9, 43.9],
   [-83.5, 44.9], [-84.7, 45.8]],
  // Erie
  [[-83.5, 41.7], [-82.7, 41.5], [-81.5, 42.0], [-80.2, 42.3], [-79.0, 42.8],
   [-79.6, 42.95], [-80.5, 42.6], [-82.0, 42.4], [-83.1, 42.1]],
  // Ontario
  [[-79.8, 43.3], [-78.0, 43.3], [-76.5, 43.3], [-76.2, 43.9], [-77.5, 44.1],
   [-79.3, 43.6]],
];

export const LAKE_PATHS = LAKES.map((poly) =>
  poly.map(([lng, lat], i) => {
    const [x, y] = project(lat, lng);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z",
);

/** Projected units per mile — the camera thinks in miles, not degrees. */
export const UNITS_PER_MI =
  MAP_W / ((BOUNDS.lngMax - BOUNDS.lngMin) * 69.17 * LAT0_COS);

/** Meridians and parallels, for the faint ops-room grid under the country. */
export const GRID = {
  meridians: [-120, -110, -100, -90, -80, -70].map((lng) => project(0, lng)[0]),
  parallels: [30, 35, 40, 45].map((lat) => project(lat, 0)[1]),
};

/** Cities the sandbox load board actually posts from. Kept in sync with
 *  backend/app/data/seed.py CITY_COORDS. */
export const CITY_COORDS: Record<string, [number, number]> = {
  "Chicago IL": [41.8781, -87.6298],
  "Joliet IL": [41.525, -88.0834],
  "Gary IN": [41.5934, -87.3464],
  "Milwaukee WI": [43.0389, -87.9065],
  "Grand Rapids MI": [42.9634, -85.6681],
  "Madison WI": [43.0731, -89.4012],
  "Rockford IL": [42.2711, -89.0940],
  "Green Bay WI": [44.5133, -88.0133],
  "Des Moines IA": [41.5868, -93.6250],
  "Columbus OH": [39.9612, -82.9988],
  "Cincinnati OH": [39.1031, -84.512],
  "Toledo OH": [41.6528, -83.5379],
  "Memphis TN": [35.1495, -90.049],
  "Nashville TN": [36.1627, -86.7816],
  "Indianapolis IN": [39.7684, -86.1581],
  "Dallas TX": [32.7767, -96.797],
  "Pittsburgh PA": [40.4406, -79.9959],
  "Louisville KY": [38.2527, -85.7585],
  "Denver CO": [39.7392, -104.9903],
};

/** A gentle arc between two points — a straight line between cities reads as a
 *  wire, a bowed one reads as a trip. Perpendicular offset, 12% of span. */
export function arc(
  a: [number, number],
  b: [number, number],
): string {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * len * 0.12;
  const cy = my + (dx / len) * len * 0.12;
  return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
}

/** Point along the quadratic arc at t ∈ [0,1] — moves the truck along the route. */
export function arcPoint(
  a: [number, number],
  b: [number, number],
  t: number,
): [number, number] {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * len * 0.12;
  const cy = my + (dx / len) * len * 0.12;
  const u = 1 - t;
  return [
    u * u * x1 + 2 * u * t * cx + t * t * x2,
    u * u * y1 + 2 * u * t * cy + t * t * y2,
  ];
}

/** Great-circle miles — the phone shows "you are N miles out" from real GPS. */
export function haversineMi(
  a: [number, number],
  b: [number, number],
): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
