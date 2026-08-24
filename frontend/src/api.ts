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

async function jn<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  health: () => fetch("/api/health").then(jn<any>),
  registry: () => fetch("/api/registry").then(jn<{ agents: AgentCard[] }>),
  tenant: () => fetch("/api/tenant").then(jn<any>),
  desk: () => fetch("/api/desk").then(jn<Desk>),
  scan: () => fetch("/api/scan", { method: "POST" }).then(jn<any>),
  screen: (mc: string, run_id?: string) =>
    fetch("/api/screen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mc, run_id }),
    }).then(jn<any>),
  book: (posting_id: string, rate?: number) =>
    fetch("/api/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posting_id, rate }),
    }).then(jn<any>),
  refuse: (mc: string, run_id?: string) =>
    fetch("/api/refuse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mc, run_id }),
    }).then(jn<any>),
  scenario: (which: string) =>
    fetch("/api/scenario", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ which }),
    }).then(jn<any>),
  chat: (message: string, run_id?: string) =>
    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, run_id }),
    }).then(jn<any>),
  runs: () => fetch("/api/runs").then(jn<{ runs: any[] }>),
  outbox: () => fetch("/api/outbox").then(jn<{ messages: any[] }>),
  reset: () => fetch("/api/reset", { method: "POST" }).then(jn<any>),
};
