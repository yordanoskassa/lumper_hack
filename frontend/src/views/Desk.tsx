import { useEffect, useMemo, useState } from "react";
import { api, type Desk as DeskData, type DeskRow, type TraceEvent } from "../api";
import { C, TONE, money } from "../theme";
import { Card, Pill, Btn } from "../components/ui";
import { Trace } from "../components/Trace";

interface RunRow { id: string; broker: string; stage: string; day: number; amount: number; status: string; tone: string }

const FILTERS = ["All", "Survivors", "Under 50mi DH", "Flagged"] as const;
type Filter = (typeof FILTERS)[number];

const COLS: { key: string; label: string; align: "left" | "right" }[] = [
  { key: "lane", label: "LANE / BROKER", align: "left" },
  { key: "rate", label: "RATE", align: "left" },
  { key: "dh", label: "DH", align: "right" },
  { key: "mi", label: "MI", align: "right" },
  { key: "rpm", label: "RPM", align: "right" },
  { key: "tag", label: "MARGIN", align: "right" },
];

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

  // client-side deal math mirrors the backend Margin computation
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
    setRuns((rs) => [{ id: selRow.id, broker: selRow.broker, stage: "Dispatch", day: 0, amount: Math.round(edit.rate), status: "on track", tone: "neutral" }, ...rs]);
  }
  async function doRefuse() {
    if (!selRow) return;
    await api.refuse(selRow.mc);
    await load();
  }

  if (!desk) return <div style={{ padding: 40, color: C.muted }}>Loading desk…</div>;

  const flagged = desk.rows.filter((r) => r.blacklisted).length;
  const gTone = selRow?.ghost ? verdictTone(selRow.ghost.verdict) : "neutral";

  return (
    <div style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted }}>Home / <span style={{ color: C.slate }}>Desk</span></div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.025em", marginTop: 1 }}>Load board</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 11px", fontSize: 12.5, color: C.body }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A" }} />
            Scout pulled {desk.pulled} · showing {rows.length}
          </div>
          <Btn onClick={doScan} disabled={busy}>Re-scan</Btn>
          <Btn kind="primary" onClick={doReset} disabled={busy}>Reset desk</Btn>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <Tile k="Margin kills" v={String(desk.kills)} sub={`of ${desk.pulled} pulled`} />
        <Tile k="Best RPM after cost" v={`$${desk.best_rpm.toFixed(2)}`} sub={`floor $${desk.floor_rpm.toFixed(2)}`} />
        <Tile k="Brokers flagged" v={String(flagged)} sub={flagged ? "filtered next scan" : "none this session"} accent={flagged > 0} />
        <Tile k="Detention rate" v={`$${desk.detention.rate_per_hour}/hr`} sub={`after ${desk.detention.free_hours}h free`} accent />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 392px", gap: 12 }} className="desk-grid">
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {/* candidates */}
          <Card>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: `1px solid ${C.hair}` }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Candidates</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
                {FILTERS.map((f) => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    border: `1px solid ${filter === f ? C.black : C.border}`, background: filter === f ? C.black : "#fff",
                    color: filter === f ? "#fff" : C.body, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
                  }}>{f}</button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 640 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr .9fr .7fr .7fr .8fr 1fr", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${C.hair}`, background: C.faint }}>
                  {COLS.map((c) => (
                    <button key={c.key} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : (c.key === "rpm" ? -1 : 1) }))}
                      style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".04em", color: sort.key === c.key ? C.ink : C.muted, textAlign: c.align, padding: 0 }}>
                      {c.label}{sort.key === c.key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
                    </button>
                  ))}
                </div>
                {rows.map((r) => <CandidateRow key={r.id} r={r} on={r.id === sel} floor={desk.floor_rpm} onClick={() => selectRow(r)} />)}
              </div>
            </div>
          </Card>

          {/* deal desk */}
          {selRow && edit && m && (
            <Card>
              <div style={{ padding: "13px 16px", display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", borderBottom: `1px solid ${C.hair}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: C.muted }}>Deal desk</div>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.015em", marginTop: 1 }}>{selRow.origin} → {selRow.dest} · {selRow.eq}</div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{selRow.broker} · {selRow.mc}</div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 11.5, color: C.muted }}>Net after cost</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 500, color: m.net > 0 ? C.ink : "#DC2626" }}>{money(m.net)}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(108px,1fr))", borderBottom: `1px solid ${C.border}` }}>
                <Input k="RATE" pre="$" val={edit.rate} step={25} onCh={(v) => setEdit({ ...edit, rate: v })} />
                <Input k="DEADHEAD" val={edit.dh} step={1} suf="mi" onCh={(v) => setEdit({ ...edit, dh: v })} />
                <Input k="LOADED" val={edit.mi} step={1} suf="mi" onCh={(v) => setEdit({ ...edit, mi: v })} />
                <Input k="DIESEL" pre="$" val={edit.diesel} step={0.01} suf="/gal" onCh={(v) => setEdit({ ...edit, diesel: v })} />
                <Input k="MPG" val={edit.mpg} step={0.1} onCh={(v) => setEdit({ ...edit, mpg: v })} />
                <Input k="FLOOR" pre="$" val={edit.floor} step={0.05} onCh={(v) => setEdit({ ...edit, floor: v })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(108px,1fr))", borderBottom: `1px solid ${C.border}`, background: C.faint }}>
                <Derived k="FUEL COST" v={money(m.fuel)} />
                <Derived k="FIXED COST" v={money(m.fixed)} />
                <Derived k="RPM AFTER COST" v={`$${m.rpm.toFixed(2)}`} fg={m.rpm >= edit.floor ? "#15803D" : "#DC2626"} />
                <Derived k="VS LANE" v={`${selRow.lane_avg ? (((edit.rate / edit.mi - selRow.lane_avg) / selRow.lane_avg) * 100 >= 0 ? "+" : "") + (((edit.rate / edit.mi - selRow.lane_avg) / selRow.lane_avg) * 100).toFixed(0) : "0"}%`} fg={edit.rate / edit.mi >= selRow.lane_avg ? "#15803D" : "#B45309"} />
                <Derived k="DRIVE TIME" v={`${m.drive.toFixed(1)}h`} fg={m.sameDay ? "#15803D" : m.hosOk ? "#B45309" : "#DC2626"} />
                <Derived k="HOS" v={m.sameDay ? "legal today" : m.hosOk ? "needs reset" : "illegal"} fg={m.sameDay ? "#15803D" : m.hosOk ? "#B45309" : "#DC2626"} />
              </div>
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <Btn kind="primary" onClick={doBook} disabled={busy || (selRow.ghost?.verdict === "REFUSE" || selRow.blacklisted)}>
                  {selRow.blacklisted ? "Blocked" : selRow.ghost?.verdict === "REFUSE" ? "Override & book" : "Book load"}
                </Btn>
                <Btn onClick={doBook}>Counter & book</Btn>
                <Btn kind="danger" onClick={doRefuse}>Refuse &amp; flag broker</Btn>
                <div style={{ marginLeft: "auto", fontSize: 11.5, color: C.muted, textAlign: "right" }}>
                  {selRow.ghost?.verdict === "REFUSE" ? `${selRow.ghost.failed} Ghost checks failed` : "Driver approves by voice before rate con goes out"}
                </div>
              </div>
            </Card>
          )}

          {/* active runs */}
          <Card>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", borderBottom: `1px solid ${C.hair}` }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Active runs</div>
              <div style={{ marginLeft: "auto", fontSize: 11.5, color: C.muted }}>{runs.length} open · book a load to start one</div>
            </div>
            {runs.length === 0 ? (
              <div style={{ padding: "14px", fontSize: 12, color: C.muted }}>No active runs. Book a load or ask Yard Boss to run a scenario — Mile Marker and Payday advance it over simulated days in the trace.</div>
            ) : runs.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 1fr .8fr 1fr", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${C.hair}` }}>
                <div className="mono" style={{ fontSize: 12 }}>{r.id}</div>
                <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.broker}</div>
                <div style={{ fontSize: 12, color: C.slate }}>{r.stage}</div>
                <div className="mono" style={{ fontSize: 12, textAlign: "right" }}>{money(r.amount)}</div>
                <div style={{ textAlign: "right" }}><Pill tone="neutral">{r.status}</Pill></div>
              </div>
            ))}
          </Card>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {selRow && <GhostPanel row={selRow} tone={gTone} />}
          <Trace trace={trace} connected={connected} height={440} />
        </div>
      </div>
    </div>
  );
}

function CandidateRow({ r, on, floor, onClick }: { r: DeskRow; on: boolean; floor: number; onClick: () => void }) {
  const gv = r.ghost?.verdict;
  const tag = r.blacklisted ? "FLAGGED" : r.kill ? "KILL" : gv === "REFUSE" ? "GHOST RISK" : r.hot ? "TOP" : "PASS";
  const tagTone = tag === "PASS" ? "neutral" : tag === "TOP" ? "green" : tag === "KILL" ? "neutral" : "red";
  return (
    <button onClick={onClick} style={{
      display: "grid", gridTemplateColumns: "1.6fr .9fr .7fr .7fr .8fr 1fr", gap: 8, padding: "9px 14px", width: "100%", textAlign: "left",
      borderBottom: `1px solid ${C.hair}`, background: on ? "#FFF7ED" : "#fff", borderLeft: `3px solid ${on ? "#F97316" : "transparent"}`, opacity: r.kill ? 0.6 : 1,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.origin} → {r.dest}</div>
        <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.broker} · {r.src}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 12 }}>{r.rate ? money(r.rate) : "call"}</div>
        <div style={{ fontSize: 10.5, color: C.muted }}>{r.posted_min < 60 ? `${r.posted_min}m ago` : `${Math.round(r.posted_min / 60)}h ago`}</div>
      </div>
      <div className="mono" style={{ fontSize: 12, textAlign: "right" }}>{r.deadhead}</div>
      <div className="mono" style={{ fontSize: 12, textAlign: "right" }}>{r.miles}</div>
      <div className="mono" style={{ fontSize: 12.5, textAlign: "right", color: !r.rate ? C.muted : r.rpm >= floor ? "#15803D" : "#DC2626" }}>{r.rate ? `$${r.rpm.toFixed(2)}` : "—"}</div>
      <div style={{ textAlign: "right", minWidth: 0 }}>
        <Pill tone={tagTone as any}>{tag}</Pill>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.kill || (gv === "REFUSE" ? `${r.ghost?.failed} checks failed` : `lane $${r.lane_avg.toFixed(2)}`)}
        </div>
      </div>
    </button>
  );
}

function GhostPanel({ row, tone }: { row: DeskRow; tone: string }) {
  const t = TONE[tone as keyof typeof TONE] ?? TONE.neutral;
  const g = row.ghost;
  return (
    <Card>
      <div style={{ padding: "13px 15px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.hair}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Ghost screening</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{row.mc} · {row.broker}</div>
        </div>
        <div style={{ marginLeft: "auto" }}><Pill tone={tone as any} style={{ fontSize: 11.5, padding: "4px 11px" }}>{g?.verdict ?? "—"}</Pill></div>
      </div>
      <div style={{ padding: "12px 15px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 11.5, color: C.sub }}>Risk score</div>
          <div className="mono" style={{ fontSize: 15, color: t.fg }}>{g?.score ?? 0} / 100</div>
        </div>
        <div style={{ height: 6, background: C.hair, borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
          <div style={{ height: 6, width: `${Math.min(100, g?.score ?? 0)}%`, background: t.fg, borderRadius: 3 }} />
        </div>
      </div>
      <div style={{ padding: "11px 15px", background: C.faint, borderTop: `1px solid ${C.hair}`, fontSize: 11.5, color: C.slate, lineHeight: 1.5 }}>
        {g?.verdict === "REFUSE"
          ? `${g.failed} of 7 checks failed — Ghost queried FMCSA, RDAP and the memory graph. Refuse to blacklist this broker and its shell-ring neighbours.`
          : g?.verdict === "CLEAR"
          ? "Clean: active authority, insurance on file, no phone or ACH collisions, pays on time."
          : "Select a candidate to see the full seven-check screen and evidence in the live trace."}
      </div>
    </Card>
  );
}

function Tile({ k, v, sub, accent }: { k: string; v: string; sub: string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? "#FFF7ED" : "#fff", border: `1px solid ${accent ? "#FED7AA" : C.border}`, borderRadius: 11, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: C.slate }}>{k}</div>
      <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: "-.02em", color: accent ? C.orange : C.ink, marginTop: 3 }}>{v}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Input({ k, val, onCh, step, pre, suf }: { k: string; val: number; onCh: (v: number) => void; step: number; pre?: string; suf?: string }) {
  return (
    <div style={{ padding: "9px 13px", borderLeft: `1px solid ${C.border}`, marginLeft: -1, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: C.muted }}>{k}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 2 }}>
        {pre && <span className="mono" style={{ fontSize: 12, color: C.muted }}>{pre}</span>}
        <input type="number" value={val} step={step} onChange={(e) => onCh(parseFloat(e.target.value) || 0)}
          className="mono" style={{ width: "100%", minWidth: 0, border: "none", background: "transparent", fontSize: 14, color: C.ink, padding: 0 }} />
        {suf && <span className="mono" style={{ fontSize: 11, color: C.muted }}>{suf}</span>}
      </div>
    </div>
  );
}

function Derived({ k, v, fg }: { k: string; v: string; fg?: string }) {
  return (
    <div style={{ padding: "9px 13px", borderLeft: `1px solid ${C.border}`, marginLeft: -1, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: C.muted }}>{k}</div>
      <div className="mono" style={{ fontSize: 13.5, color: fg ?? C.ink, marginTop: 3 }}>{v}</div>
    </div>
  );
}

function verdictTone(v: string): string {
  return v === "CLEAR" ? "green" : v === "REVIEW" ? "amber" : v === "REFUSE" || v === "BLACKLISTED" ? "red" : "neutral";
}
