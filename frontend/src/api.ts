export interface TraceEvent {
  type: "trace" | "state" | "chat" | "mail";
  run_id: string;
  agent?: string;
  msg?: string;
  tone?: string;
  kind?: string;
  tool?: string;
  backend?: string;
  latency_ms?: number;
  clock?: string;
  seq: number;
  state?: any;
  role?: string;
  text?: string;
  mail?: any;
}

export interface AgentCard {
  key: string;
  name: string;
  version: string;
  badge: string;
  role: string;
  handoff: string;
  scopes: string[];
  tools: string[];
  loop: string;
}

export interface DeskRow {
  id: string;
  mc: string;
  broker: string;
  src: string;
  origin: string;
  dest: string;
  eq: string;
  rate: number | null;
  posted_min: number;
  miles: number;
  deadhead: number;
  rpm: number;
  lane_avg: number;
  fuel: number;
  fixed: number;
  net: number;
  drive_h: number;
  kill: string | null;
  hot: boolean;
  blacklisted: boolean;
  broker_email?: string;
  ghost?: { verdict: string; score: number; failed: number };
}

export interface Desk {
  pulled: number;
  kills: number;
  survivors: number;
  floor_rpm: number;
  best_rpm: number;
  truck: any;
  detention: { rate_per_hour: number; free_hours: number };
  rows: DeskRow[];
}

/** Driver-app shape: one load, already judged, in words a non-trucker reads. */
export interface DriverLoad {
  id: string;
  broker: string;
  mc: string;
  origin: string;
  origin_lat: number;
  origin_lng: number;
  dest: string;
  dest_lat: number;
  dest_lng: number;
  rate: number;
  miles: number;
  rpm: number;
  net: number;
  deadhead: number;
  eq: string;
  /** What is on the deck — "2 operable sedans", "1 inoperable pickup". */
  units?: string | null;
  /** The pickup window as the posting states it. */
  pickup?: string | null;
  /** Whatever else the posting advertises — "Quick Pay eligible", "Direct". */
  posting_note?: string | null;
  /** No posted rate: this one is answered with an offer, not a price. */
  bid_only?: boolean;
  drive_h: number;
  lane_avg: number;
  verdict: "CLEAR" | "REVIEW" | "BLOCKED";
  risk: number;
  blocked: boolean;
  /** The docket is real and licensed; the POSTING is the forgery. */
  impersonated?: boolean;
  posing_as?: string | null;
  /** Which board this posting came off, and how stale it is. */
  source?: string | null;
  posted_min?: number | null;
  /** The posting exactly as the load-board adapter handed it over. The
   *  card shows its own working from this; nothing is added to it. */
  raw?: Record<string, unknown>;
  reasons: string[];
}

export interface DriverBoard {
  truck: { city: string; lat: number; lng: number; driver: string };
  loads: DriverLoad[];
}

/** Backend origin for split deploys — frontend on Netlify, FastAPI elsewhere.
 *  Production builds default to the deployed Cloud Run service; VITE_API_BASE
 *  overrides it. Dev stays empty so the Vite proxy forwards /api locally. */
const CLOUD_RUN = "https://lumper-backstop-1094415841088.us-central1.run.app";
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.PROD ? CLOUD_RUN : "")).replace(/\/+$/, "");
const req = (path: string, init?: RequestInit) => fetch(API_BASE + path, init);

async function jn<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/** Until the backend ships /api/loads, fold the desk board into the driver shape
 *  so the phone is demoable on its own. Coordinates come from the city table. */
function deskToDriver(d: Desk, coords: Record<string, [number, number]>): DriverBoard {
  const truckCity: string = d.truck?.city ?? "Joliet IL";
  const [tlat, tlng] = coords[truckCity] ?? [41.525, -88.0834];
  // Finder already killed the unprofitable ones; the driver should never scroll
  // past them. Blocked brokers stay, because the block is the point.
  const visible = d.rows.filter(
    (r) => !r.kill || r.blacklisted || r.ghost?.verdict === "REFUSE",
  );
  const loads: DriverLoad[] = visible.map((r) => {
    const [olat, olng] = coords[r.origin] ?? [tlat, tlng];
    const [dlat, dlng] = coords[r.dest] ?? [tlat, tlng];
    const v = r.ghost?.verdict ?? "";
    const blocked = r.blacklisted || v === "REFUSE" || v === "REFUSED";
    return {
      id: r.id, broker: r.broker, mc: r.mc,
      origin: r.origin, origin_lat: olat, origin_lng: olng,
      dest: r.dest, dest_lat: dlat, dest_lng: dlng,
      rate: r.rate ?? 0, miles: r.miles, rpm: r.rpm, net: r.net,
      deadhead: r.deadhead, eq: r.eq, drive_h: r.drive_h, lane_avg: r.lane_avg,
      verdict: blocked ? "BLOCKED" : v === "REVIEW" ? "REVIEW" : "CLEAR",
      risk: r.ghost?.score ?? 0,
      blocked,
      reasons: blocked
        ? ["This company failed our checks", "You would not have been paid"]
        : ["Real company on the federal registry", "Pays on time"],
    };
  });
  return { truck: { city: truckCity, lat: tlat, lng: tlng, driver: d.truck?.driver ?? "Driver" }, loads };
}

export const api = {
  health: () => req("/api/health").then(jn<any>),
  registry: () => req("/api/registry").then(jn<{ agents: AgentCard[] }>),
  tenant: () => req("/api/tenant").then(jn<any>),
  desk: () => req("/api/desk").then(jn<Desk>),
  scan: () => req("/api/scan", { method: "POST" }).then(jn<any>),
  /** `explain: false` skips the Gemini prose. The driver app renders the
   *  evidence rows and never the paragraph, and it halves the wait. */
  screen: (mc: string, run_id?: string, explain = true) =>
    req("/api/screen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mc, run_id, explain }),
    }).then(jn<any>),
  /** One "we'll take it" email to the broker, then the flow stops. */
  interest: (posting_id: string) =>
    req("/api/interest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posting_id }),
    }).then(jn<{ run_id: string; to?: string; broker?: string; backend?: string; detail?: string }>),
  /** Payday fights for the waiting time in the background: clock, timestamped
   *  notice, escalation, claim. Falls back to the seeded dock story without a
   *  posting. */
  requestDetention: (posting_id?: string) =>
    req("/api/detention/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posting_id }),
    }).then(jn<{ run_id: string; started: boolean }>),
  book: (posting_id: string, rate?: number) =>
    req("/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posting_id, rate }),
    }).then(jn<any>),
  refuse: (mc: string, run_id?: string) =>
    req("/api/refuse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mc, run_id }),
    }).then(jn<any>),
  scenario: (which: string) =>
    req("/api/scenario", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ which }),
    }).then(jn<any>),
  chat: (message: string, run_id?: string) =>
    req("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, run_id }),
    }).then(jn<any>),
  loads: async (coords: Record<string, [number, number]>): Promise<DriverBoard> => {
    const r = await req("/api/loads");
    if (r.ok) return r.json();
    if (r.status !== 404) throw new Error(`${r.status} ${await r.text()}`);
    return deskToDriver(await req("/api/desk").then(jn<Desk>), coords);
  },
  arrive: (posting_id: string, lat?: number, lng?: number) =>
    req("/api/arrive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posting_id, lat, lng }),
    }).then(jn<{ run_id: string; started: boolean }>),
  depart: (posting_id: string, lat?: number, lng?: number) =>
    req("/api/depart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posting_id, lat, lng }),
    }).then(jn<any>),
  /** null when the backend has no detention endpoint yet — caller falls back to
   *  its own clock so the phone demos standalone. */
  detention: async (): Promise<any | null> => {
    const r = await req("/api/detention");
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  },
  pod: (posting_id: string, image_b64: string, lat?: number, lng?: number) =>
    req("/api/pod", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posting_id, image_b64, lat, lng }),
    }).then(jn<{ run_id: string; started: boolean }>),
  runs: () => req("/api/runs").then(jn<{ runs: any[] }>),
  outbox: () => req("/api/outbox").then(jn<{ messages: any[] }>),
  reset: () => req("/api/reset", { method: "POST" }).then(jn<any>),
};
