import { useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { api, type Desk as DeskData, type DeskRow, type TraceEvent } from "@/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Trace } from "@/components/Trace";

interface RunRow { id: string; broker: string; stage: string; day: number; amount: number; status: string }

const FILTERS = ["All", "Survivors", "Under 50mi DH", "Flagged"] as const;
type Filter = (typeof FILTERS)[number];

const COLS: { key: string; label: string; align: "left" | "right" }[] = [
  { key: "lane", label: "LANE / BROKER", align: "left" },
  { key: "rate", label: "RATE", align: "left" },
  { key: "dh", label: "DH", align: "right" },
  { key: "mi", label: "MI", align: "right" },
  { key: "rpm", label: "RPM", align: "right" },
  { key: "tag", label: "VERDICT", align: "right" },
];

/** The six-column table grid, shared by its header and its rows so they line up. */
const TABLE_COLS = "grid grid-cols-[1.6fr_0.9fr_0.7fr_0.7fr_0.8fr_1fr] gap-2";

/** Verdict wash + ink. Mirrors the driver app so one load reads the same on both. */
const TAG_CLS: Record<string, string> = {
  TOP: "border-ok/35 bg-ok/12 text-ok",
  PASS: "border-border bg-muted/50 text-muted-foreground",
  KILL: "border-border bg-muted/50 text-muted-foreground",
  RISK: "border-bad/35 bg-bad/12 text-bad",
  FLAGGED: "border-bad/35 bg-bad/12 text-bad",
};

const VERDICT_CLS: Record<string, string> = {
  CLEAR: "border-ok/35 bg-ok/12 text-ok",
  REVIEW: "border-warn/35 bg-warn/12 text-warn",
  REFUSE: "border-bad/35 bg-bad/12 text-bad",
  BLACKLISTED: "border-bad/35 bg-bad/12 text-bad",
};

const VERDICT_BAR: Record<string, string> = {
  CLEAR: "bg-ok", REVIEW: "bg-warn", REFUSE: "bg-bad", BLACKLISTED: "bg-bad",
};

const VERDICT_INK: Record<string, string> = {
  CLEAR: "text-ok", REVIEW: "text-warn", REFUSE: "text-bad", BLACKLISTED: "text-bad",
};

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

function tagFor(r: DeskRow): string {
  // `ghost` is the legacy key on the desk payload — the agent that fills it is
  // Verifier, and no user-facing string says otherwise.
  const gv = r.ghost?.verdict;
  return r.blacklisted ? "FLAGGED" : r.kill ? "KILL" : gv === "REFUSE" ? "RISK" : r.hot ? "TOP" : "PASS";
}

export function Desk({ trace, connected, deskFromStream }: {
  trace: TraceEvent[]; connected: boolean; deskFromStream: DeskData | null;
}) {
  const [desk, setDesk] = useState<DeskData | null>(null);
  const [sel, setSel] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("All");
  const [sort, setSort] = useState<{ key: string; dir: number }>({ key: "rpm", dir: -1 });
  const [busy, setBusy] = useState(false);
  // editable deal-desk overrides
  const [edit, setEdit] = useState<{ rate: number; dh: number; mi: number; diesel: number; mpg: number; floor: number } | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);

  useEffect(() => { load(); }, []);
  useEffect(() => { if (deskFromStream) setDesk(deskFromStream); }, [deskFromStream]);

  async function load() {
    setBusy(true);
    try {
      const d = await api.desk();
      setDesk(d);
      if (!sel && d.rows.length) selectRow(d.rows.find((r) => !r.kill) ?? d.rows[0], d);
    } finally { setBusy(false); }
  }

  function selectRow(r: DeskRow, d: DeskData | null = desk) {
    setSel(r.id);
    setEdit({
      rate: r.rate ?? Math.round(r.miles * (r.lane_avg || 2.1)),
      dh: r.deadhead, mi: r.miles,
      diesel: 3.94, mpg: d?.truck?.mpg ?? 6.4, floor: d?.floor_rpm ?? 1.45,
    });
  }

  const selRow = desk?.rows.find((r) => r.id === sel) ?? null;

  // client-side deal math mirrors the profit test Finder runs on the backend
  const m = useMemo(() => {
    if (!edit) return null;
    const total = edit.mi + edit.dh;
    const fuel = edit.mpg > 0 ? (total / edit.mpg) * edit.diesel : 0;
    const fixed = total * (desk?.truck?.fixed_cpm ?? 0.62);
    const net = edit.rate - fuel - fixed;
    const rpm = edit.mi > 0 ? (edit.rate - fuel) / edit.mi : 0;
    const drive = total / 52;
    const hosLeft = desk?.truck?.hos_left_h ?? 8.4;
    return { total, fuel, fixed, net, rpm, drive, sameDay: drive <= hosLeft, hosOk: drive <= hosLeft + 11 };
  }, [edit, desk]);

  const rows = useMemo(() => {
    if (!desk) return [];
    let list = desk.rows.slice();
    if (filter === "Survivors") list = list.filter((r) => !r.kill);
    if (filter === "Under 50mi DH") list = list.filter((r) => r.deadhead < 50);
    if (filter === "Flagged") list = list.filter((r) => r.ghost && r.ghost.verdict !== "CLEAR");
    const keyf: Record<string, (r: DeskRow) => number | string> = {
      lane: (r) => r.origin, rate: (r) => r.rate ?? 0, dh: (r) => r.deadhead,
      mi: (r) => r.miles, rpm: (r) => r.rpm, tag: (r) => (r.kill ? 0 : 1),
    };
    const f = keyf[sort.key] ?? keyf.rpm;
    return list.sort((a, b) => {
      const A = f(a), B = f(b);
      return (A > B ? 1 : A < B ? -1 : 0) * sort.dir;
    });
  }, [desk, filter, sort]);

  async function doScan() {
    setBusy(true);
    try { await api.scan(); } finally { setBusy(false); }
  }
  async function doReset() {
    setBusy(true);
    try { await api.reset(); await load(); setRuns([]); } finally { setBusy(false); }
  }
  async function doBook() {
    if (!selRow || !edit) return;
    await api.book(selRow.id, Math.round(edit.rate));
    setRuns((rs) => [{ id: selRow.id, broker: selRow.broker, stage: "Dispatch", day: 0, amount: Math.round(edit.rate), status: "on track" }, ...rs]);
  }
  async function doRefuse() {
    if (!selRow) return;
    await api.refuse(selRow.mc);
    await load();
  }

  if (!desk) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 sm:p-5">
        <Skeleton className="h-9 w-44" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-22 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const flagged = desk.rows.filter((r) => r.blacklisted).length;

  return (
    // Breakpoints do the responding, never a measured width: stacked cards is the
    // default and the six-column table is the lg-and-up upgrade.
    <div className="h-full overflow-x-hidden overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:px-5 lg:px-6 lg:pb-6">
      <div className="flex flex-col gap-3">
        {/* header */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">
              Home / <span className="text-foreground/80">Desk</span>
            </div>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.025em] sm:text-[26px]">Load board</h1>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <Badge
              variant="outline"
              className="h-11 gap-2 rounded-lg px-3 text-[12.5px] font-normal text-foreground/80 sm:h-9"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-ok" />
              Finder pulled {desk.pulled} · showing {rows.length}
            </Badge>
            {/* Re-scan is the routine action, reset wipes the session — the loud
                orange belongs to the one you actually want pressed. */}
            <Button size="tap" onClick={doScan} disabled={busy} className="flex-1 sm:flex-none">
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
              Re-scan
            </Button>
            <Button variant="outline" size="tap" onClick={doReset} disabled={busy} className="flex-1 sm:flex-none">
              <RotateCcw className="size-4" />
              Reset desk
            </Button>
          </div>
        </div>

        {/* stat tiles */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Tile k="Killed on cost" v={String(desk.kills)} sub={`of ${desk.pulled} pulled`} />
          <Tile k="Best RPM after cost" v={`$${desk.best_rpm.toFixed(2)}`} sub={`floor $${desk.floor_rpm.toFixed(2)}`} />
          <Tile k="Brokers flagged" v={String(flagged)} sub={flagged ? "filtered next scan" : "none this session"} accent={flagged > 0} />
          <Tile k="Detention rate" v={`$${desk.detention.rate_per_hour}/hr`} sub={`after ${desk.detention.free_hours}h free`} accent />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* LEFT */}
          <div className="flex min-w-0 flex-col gap-3">
            {/* candidates */}
            <Card className="gap-0 py-0">
              <CardHeader className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <CardTitle className="text-[13px] font-semibold">Candidates</CardTitle>
                <div className="flex w-full flex-wrap gap-1.5 sm:ml-auto sm:w-auto">
                  {FILTERS.map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filter === f ? "default" : "outline"}
                      onClick={() => setFilter(f)}
                      className="min-h-11 rounded-full px-3.5 text-[12.5px] lg:min-h-0"
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </CardHeader>

              {/* narrow: stacked load cards, echoing the driver app */}
              <CardContent className="flex flex-col gap-2.5 py-3 lg:hidden">
                {rows.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    Nothing matches this filter.
                  </div>
                )}
                {rows.map((r) => (
                  <CandidateCard key={r.id} r={r} on={r.id === sel} floor={desk.floor_rpm} onClick={() => selectRow(r)} />
                ))}
              </CardContent>

              {/* lg and up: the six-column desk table */}
              <div className="hidden overflow-x-auto lg:block">
                <div className="min-w-[560px]">
                  <div className={cn(TABLE_COLS, "border-b border-border bg-muted/40 px-4 py-2")}>
                    {COLS.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : (c.key === "rpm" ? -1 : 1) }))}
                        className={cn(
                          "text-[10.5px] font-semibold tracking-[0.04em]",
                          c.align === "right" ? "text-right" : "text-left",
                          sort.key === c.key ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {c.label}{sort.key === c.key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
                      </button>
                    ))}
                  </div>
                  {rows.map((r) => (
                    <CandidateRow key={r.id} r={r} on={r.id === sel} floor={desk.floor_rpm} onClick={() => selectRow(r)} />
                  ))}
                </div>
              </div>
            </Card>

            {/* deal desk */}
            {selRow && edit && m && (
              <Card className="gap-0 py-0">
                <CardHeader className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="text-[11.5px] text-muted-foreground">Deal desk</div>
                    <CardTitle className="mt-0.5 text-base font-semibold tracking-[-0.015em] break-words">
                      {selRow.origin} → {selRow.dest} · {selRow.eq}
                    </CardTitle>
                    <div className="mt-0.5 text-xs text-muted-foreground break-words">
                      {selRow.broker} · {selRow.mc}
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-[11.5px] text-muted-foreground">Net after cost</div>
                    <div className={cn("num text-[22px] font-medium", m.net > 0 ? "text-foreground" : "text-bad")}>
                      {money(m.net)}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-3 lg:grid-cols-6">
                  <NumField k="RATE" pre="$" val={edit.rate} step={25} onCh={(v) => setEdit({ ...edit, rate: v })} />
                  <NumField k="DEADHEAD" val={edit.dh} step={1} suf="mi" onCh={(v) => setEdit({ ...edit, dh: v })} />
                  <NumField k="LOADED" val={edit.mi} step={1} suf="mi" onCh={(v) => setEdit({ ...edit, mi: v })} />
                  <NumField k="DIESEL" pre="$" val={edit.diesel} step={0.01} suf="/gal" onCh={(v) => setEdit({ ...edit, diesel: v })} />
                  <NumField k="MPG" val={edit.mpg} step={0.1} onCh={(v) => setEdit({ ...edit, mpg: v })} />
                  <NumField k="FLOOR" pre="$" val={edit.floor} step={0.05} onCh={(v) => setEdit({ ...edit, floor: v })} />
                </CardContent>

                <Separator />

                <CardContent className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Derived k="FUEL COST" v={money(m.fuel)} />
                  <Derived k="FIXED COST" v={money(m.fixed)} />
                  <Derived k="RPM AFTER COST" v={`$${m.rpm.toFixed(2)}`} fg={m.rpm >= edit.floor ? "text-ok" : "text-bad"} />
                  <Derived
                    k="VS LANE"
                    v={`${selRow.lane_avg ? (((edit.rate / edit.mi - selRow.lane_avg) / selRow.lane_avg) * 100 >= 0 ? "+" : "") + (((edit.rate / edit.mi - selRow.lane_avg) / selRow.lane_avg) * 100).toFixed(0) : "0"}%`}
                    fg={edit.rate / edit.mi >= selRow.lane_avg ? "text-ok" : "text-warn"}
                  />
                  <Derived k="DRIVE TIME" v={`${m.drive.toFixed(1)}h`} fg={m.sameDay ? "text-ok" : m.hosOk ? "text-warn" : "text-bad"} />
                  <Derived k="HOS" v={m.sameDay ? "legal today" : m.hosOk ? "needs reset" : "illegal"} fg={m.sameDay ? "text-ok" : m.hosOk ? "text-warn" : "text-bad"} />
                </CardContent>

                <Separator />

                <CardContent className="flex flex-wrap items-center gap-2 py-3">
                  <Button
                    size="tap"
                    onClick={doBook}
                    disabled={busy || selRow.ghost?.verdict === "REFUSE" || selRow.blacklisted}
                    className="flex-1 sm:flex-none"
                  >
                    {selRow.blacklisted ? "Blocked" : selRow.ghost?.verdict === "REFUSE" ? "Override & book" : "Book load"}
                  </Button>
                  <Button variant="outline" size="tap" onClick={doBook} className="flex-1 sm:flex-none">
                    Counter & book
                  </Button>
                  <Button variant="destructive" size="tap" onClick={doRefuse} className="flex-1 sm:flex-none">
                    Refuse &amp; flag broker
                  </Button>
                  <div className="w-full text-[11.5px] text-muted-foreground sm:ml-auto sm:w-auto sm:text-right">
                    {selRow.ghost?.verdict === "REFUSE"
                      ? `${selRow.ghost.failed} verification checks failed`
                      : "Driver approves by voice before rate con goes out"}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* active runs */}
            <Card className="gap-0 py-0">
              <CardHeader className="flex items-center gap-2 border-b border-border px-4 py-3">
                <CardTitle className="text-[13px] font-semibold">Active runs</CardTitle>
                <div className="ml-auto text-right text-[11.5px] text-muted-foreground">
                  {runs.length} open · book a load to start one
                </div>
              </CardHeader>
              {runs.length === 0 ? (
                <CardContent className="py-3.5 text-xs leading-relaxed text-muted-foreground">
                  No active runs. Book a load or ask Dispatch to run a scenario — Closer and Payday
                  advance it over simulated days in the trace.
                </CardContent>
              ) : (
                runs.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0"
                  >
                    <span className="mono text-xs">{r.id}</span>
                    <span className="min-w-0 flex-1 truncate text-xs">{r.broker}</span>
                    <span className="text-xs text-foreground/80">{r.stage}</span>
                    <span className="num text-xs">{money(r.amount)}</span>
                    <Badge variant="outline" className="text-muted-foreground">{r.status}</Badge>
                  </div>
                ))
              )}
            </Card>
          </div>

          {/* RIGHT */}
          <div className="flex min-w-0 flex-col gap-3">
            {selRow && <ScreeningPanel row={selRow} />}
            <Trace trace={trace} connected={connected} height={440} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Narrow-screen load card: the same shape the driver sees on the phone —
 *  big rate, lane, miles and $/mi, one verdict badge. */
function CandidateCard({ r, on, floor, onClick }: { r: DeskRow; on: boolean; floor: number; onClick: () => void }) {
  const tag = tagFor(r);
  const rpmCls = !r.rate ? "text-muted-foreground" : r.rpm >= floor ? "text-ok" : "text-bad";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border p-4 text-left transition-colors",
        on ? "border-primary/60 bg-primary/8" : "border-border bg-muted/20 hover:bg-muted/40",
        r.kill && "opacity-65",
      )}
    >
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn("text-[10px] tracking-[0.06em]", TAG_CLS[tag])}>{tag}</Badge>
        <span className="ml-auto truncate text-xs text-muted-foreground">{r.eq}</span>
      </div>

      <div
        className={cn(
          "num mt-2.5 text-[30px] leading-none font-semibold tracking-[-0.035em]",
          r.kill ? "text-muted-foreground line-through" : "text-foreground",
        )}
      >
        {r.rate ? money(r.rate) : "call"}
      </div>
      <div className="mt-2 text-[15px] font-medium break-words">{r.origin} → {r.dest}</div>
      <div className="mt-1 text-[13px] text-muted-foreground">
        {Math.round(r.miles)} miles · <span className={rpmCls}>{r.rate ? `$${r.rpm.toFixed(2)}` : "—"}</span> a mile · {r.deadhead} mi deadhead
      </div>

      <Separator className="my-3" />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{r.broker} · {r.src}</span>
        <span className="ml-auto shrink-0">
          {r.kill || (tag === "RISK" ? `${r.ghost?.failed} checks failed` : `lane $${r.lane_avg.toFixed(2)}`)}
        </span>
      </div>
    </button>
  );
}

/** lg-and-up table row. Same data, dense. */
function CandidateRow({ r, on, floor, onClick }: { r: DeskRow; on: boolean; floor: number; onClick: () => void }) {
  const tag = tagFor(r);
  return (
    <button
      onClick={onClick}
      className={cn(
        TABLE_COLS,
        "w-full border-b border-l-[3px] border-border px-4 py-2.5 text-left transition-colors",
        on ? "border-l-primary bg-primary/8" : "border-l-transparent hover:bg-muted/30",
        r.kill && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium">{r.origin} → {r.dest}</div>
        <div className="truncate text-[11px] text-muted-foreground">{r.broker} · {r.src}</div>
      </div>
      <div className="min-w-0">
        <div className="num text-xs">{r.rate ? money(r.rate) : "call"}</div>
        <div className="text-[10.5px] text-muted-foreground">
          {r.posted_min < 60 ? `${r.posted_min}m ago` : `${Math.round(r.posted_min / 60)}h ago`}
        </div>
      </div>
      <div className="num text-right text-xs">{r.deadhead}</div>
      <div className="num text-right text-xs">{r.miles}</div>
      <div
        className={cn(
          "num text-right text-[12.5px]",
          !r.rate ? "text-muted-foreground" : r.rpm >= floor ? "text-ok" : "text-bad",
        )}
      >
        {r.rate ? `$${r.rpm.toFixed(2)}` : "—"}
      </div>
      <div className="min-w-0 text-right">
        <Badge variant="outline" className={cn("text-[10px] tracking-[0.06em]", TAG_CLS[tag])}>{tag}</Badge>
        <div className="mt-1 truncate text-[10.5px] text-muted-foreground">
          {r.kill || (tag === "RISK" ? `${r.ghost?.failed} checks failed` : `lane $${r.lane_avg.toFixed(2)}`)}
        </div>
      </div>
    </button>
  );
}

/** Verifier's broker screen. The payload key is still `ghost` for backwards
 *  compatibility; nothing a user reads says so. */
function ScreeningPanel({ row }: { row: DeskRow }) {
  const g = row.ghost;
  const v = g?.verdict ?? "";
  const score = Math.min(100, g?.score ?? 0);
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <CardTitle className="text-[13px] font-semibold">Broker screening</CardTitle>
          <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{row.mc} · {row.broker}</div>
        </div>
        <Badge
          variant="outline"
          className={cn("ml-auto shrink-0 h-6 px-2.5 text-[11.5px]", VERDICT_CLS[v] ?? "text-muted-foreground")}
        >
          {g?.verdict ?? "—"}
        </Badge>
      </CardHeader>

      <CardContent className="py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11.5px] text-foreground/80">Risk score</span>
          <span className={cn("num text-[15px]", VERDICT_INK[v] ?? "text-muted-foreground")}>
            {g?.score ?? 0} / 100
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          {/* the one genuinely computed value on this card */}
          <div className={cn("h-full rounded-full", VERDICT_BAR[v] ?? "bg-muted-foreground")} style={{ width: `${score}%` }} />
        </div>
      </CardContent>

      <div className="border-t border-border bg-muted/40 px-4 py-3 text-[11.5px] leading-relaxed text-foreground/80">
        {v === "REFUSE"
          ? `${g?.failed} of 7 checks failed — Verifier queried FMCSA, RDAP and the memory graph. Refuse to blacklist this broker and its shell-ring neighbours.`
          : v === "CLEAR"
          ? "Clean: active authority, insurance on file, no phone or ACH collisions, pays on time."
          : "Select a candidate to see the full seven-check screen and evidence in the live trace."}
      </div>
    </Card>
  );
}

function Tile({ k, v, sub, accent }: { k: string; v: string; sub: string; accent?: boolean }) {
  return (
    <Card
      size="sm"
      className={cn("gap-0 px-3.5 py-3", accent && "bg-primary/8 ring-primary/25")}
    >
      <div className="text-xs text-foreground/80">{k}</div>
      <div className={cn("num mt-1 text-[22px] font-semibold tracking-[-0.02em]", accent && "text-primary")}>{v}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </Card>
  );
}

function NumField({ k, val, onCh, step, pre, suf }: {
  k: string; val: number; onCh: (v: number) => void; step: number; pre?: string; suf?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border px-3 py-1.5">
      <span className="text-[10.5px] text-muted-foreground">{k}</span>
      <span className="flex items-baseline gap-1">
        {pre && <span className="mono shrink-0 text-xs text-muted-foreground">{pre}</span>}
        <Input
          type="number"
          value={val}
          step={step}
          onChange={(e) => onCh(parseFloat(e.target.value) || 0)}
          className="mono h-9 min-w-0 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {suf && <span className="mono shrink-0 text-[11px] text-muted-foreground">{suf}</span>}
      </span>
    </label>
  );
}

function Derived({ k, v, fg }: { k: string; v: string; fg?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-muted/40 px-3 py-2">
      <span className="text-[10.5px] text-muted-foreground">{k}</span>
      <span className={cn("num mt-1 truncate text-[13.5px]", fg ?? "text-foreground")}>{v}</span>
    </div>
  );
}
