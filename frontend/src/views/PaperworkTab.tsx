import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, Camera, ChevronDown, Clock, FileCheck, FileText, Gavel,
  Mail, Navigation, Paperclip, RefreshCw, Send, ShieldX, Truck, Wallet,
} from "lucide-react";
import { API_BASE, type DriverLoad } from "@/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, RunShell, useRun } from "@/driver/RunProvider";

/** The last mile of the money: one photo of the signed bill, sent with the GPS
 *  stamps, and the run pays out — and underneath it, the evidence locker. Every
 *  document the agents actually produced, with its real text, so the claim
 *  "we emailed the broker with the timestamps attached" can be read, not
 *  believed. */
export function PaperworkTab() {
  const { screen, picked, podImg, det, setPodImg, sendPod, reset, hunt, setTab } = useRun();

  // One branch always wins, so this tab can never render an empty column.
  let body: ReactNode;
  if (picked && screen === "pod") {
    body = <Pod img={podImg} onPick={setPodImg} onSend={sendPod} />;
  } else if (picked && screen === "paid") {
    body = <Paid load={picked} owed={det.owed ?? 0} onDone={reset} />;
  } else if (picked) {
    // On a run, but not unloaded yet — the photo is not real evidence until the
    // truck is actually off the dock.
    body = (
      <Empty
        title="Nothing to send yet."
        body={`Finish ${picked.dest} first. The moment you're unloaded, the paperwork lands here.`}
        cta="Back to my run"
        onCta={() => setTab("trip")}
      />
    );
  } else {
    body = (
      <Empty
        title="No paperwork waiting."
        body="Take a load first. Deliver it, snap the signed bill here, and we invoice it and chase the money."
        cta="Find me a load"
        onCta={() => {
          setTab("loads");
          if (screen === "home") hunt();
        }}
      />
    );
  }

  return (
    <RunShell>
      {body}
      <Separator className="mt-7 mb-6" />
      <Evidence screen={screen} />
    </RunShell>
  );
}

/* ------------------------------------------------------------------ capture */

function Pod({ img, onPick, onSend }: {
  img: string | null;
  onPick: (b64: string) => void;
  onSend: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
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

/* ----------------------------------------------------------------- evidence */

interface OutboxMsg {
  id: string;
  ts?: number | null;
  run_id?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  attachment?: string | null;
  kind?: string | null;
  backend?: string | null;
  held_reason?: string | null;
}

interface QuarantineItem {
  load_id?: string | null;
  threat?: string | null;
  findings?: string[] | null;
}

type Tone = "muted" | "ok" | "warn" | "bad";
type Icon = React.ComponentType<{ className?: string }>;

/** Every kind the agents actually emit, said the way a broker's clerk would say
 *  it. An unknown kind falls back to its own raw name rather than a lie. */
const KINDS: Record<string, { label: string; Icon: Icon; tone: Tone }> = {
  offer: { label: "Rate offer", Icon: Send, tone: "muted" },
  outbound: { label: "Rate confirmation", Icon: FileCheck, tone: "ok" },
  assignment: { label: "Assignment to driver", Icon: Truck, tone: "muted" },
  eta: { label: "ETA update", Icon: Navigation, tone: "muted" },
  pod_chase: { label: "Chasing the signed bill", Icon: Camera, tone: "muted" },
  factoring: { label: "Factoring packet", Icon: Wallet, tone: "ok" },
  detention_notice: { label: "Detention notice — timestamped", Icon: Clock, tone: "warn" },
  detention_followup: { label: "Detention follow-up", Icon: Clock, tone: "warn" },
  detention_claim: { label: "Detention claim — timestamped", Icon: Gavel, tone: "warn" },
  escalation: { label: "Past-due escalation", Icon: AlertTriangle, tone: "warn" },
  unpaid: { label: "Unpaid invoice notice", Icon: AlertTriangle, tone: "warn" },
  follow_up: { label: "Payment follow-up", Icon: Mail, tone: "muted" },
  correction: { label: "Correction issued", Icon: FileText, tone: "warn" },
  short_paper: { label: "Short-pay dispute", Icon: Gavel, tone: "warn" },
  armor: { label: "Blocked by Model Armor", Icon: ShieldX, tone: "bad" },
};

const TONE_TEXT: Record<Tone, string> = {
  muted: "text-muted-foreground",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
};
const TONE_BG: Record<Tone, string> = {
  muted: "bg-muted text-muted-foreground",
  ok: "bg-ok/12 text-ok",
  warn: "bg-warn/12 text-warn",
  bad: "bg-bad/12 text-bad",
};

function kindOf(k?: string | null) {
  return (k && KINDS[k]) || { label: k ?? "Document", Icon: FileText, tone: "muted" as Tone };
}

function clock(ts?: number | null) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function since(ts: number | null | undefined, now: number) {
  if (!ts) return "";
  const s = Math.max(0, (now - ts * 1000) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Reads the two ledgers the agents write to and re-reads them while the run is
 *  producing paper. Quarantine has no client in api.ts, so it is fetched here;
 *  a backend without the route is treated as "nothing caught", not an error. */
function useEvidence(screen: string) {
  const [msgs, setMsgs] = useState<OutboxMsg[]>([]);
  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState(() => Date.now());
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const [o, q] = await Promise.all([
        fetch(API_BASE + "/api/outbox").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
        fetch(API_BASE + "/api/quarantine").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      ]);
      if (!alive.current) return;
      setMsgs(Array.isArray(o?.messages) ? o.messages : []);
      setItems(Array.isArray(q?.items) ? q.items : []);
      setErr(null);
    } catch (e: any) {
      if (!alive.current) return;
      setErr(String(e?.message ?? e));
    } finally {
      if (alive.current) { setLoading(false); setAt(Date.now()); }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(load, 6000);
    return () => { alive.current = false; clearInterval(t); };
  }, [load]);

  // The flow writes paperwork as it moves; a screen change is the cheapest
  // signal that there is probably something new to read.
  useEffect(() => { load(); }, [screen, load]);

  return { msgs, items, loading, err, at, reload: load };
}

function Evidence({ screen }: { screen: string }) {
  const { msgs, items, loading, err, at, reload } = useEvidence(screen);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Newest first, then split into the runs that produced them — the paperwork
  // for one load reads as one file, which is how a skeptic will check it.
  const runs = useMemo(() => {
    const sorted = [...msgs].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    const out: { run: string; msgs: OutboxMsg[] }[] = [];
    for (const m of sorted) {
      const run = m.run_id || "—";
      const last = out[out.length - 1];
      if (last && last.run === run) last.msgs.push(m);
      else out.push({ run, msgs: [m] });
    }
    return out;
  }, [msgs]);

  const wire = msgs.filter((m) => m.backend === "live").length;
  const held = msgs.length - wire;

  return (
    <section>
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-[-0.025em]">Documents</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {loading && !msgs.length
              ? "Reading the file…"
              : msgs.length
                ? <>Everything the agents filed on your behalf. <span className="num">{msgs.length}</span> record{msgs.length === 1 ? "" : "s"}.</>
                : "Everything the agents file on your behalf lands here."}
          </p>
        </div>
        <Button size="tap" variant="outline" className="shrink-0 px-3" onClick={reload}
          aria-label="Refresh documents">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </header>

      {err && (
        <p className="mt-3 text-[13px] text-bad">Can't reach the file cabinet — {err}</p>
      )}

      {/* The integrity line. Held mail is the honest half of the story, so it
          is stated before the documents, not buried under them. */}
      {!!msgs.length && (
        <div className={cn(
          "mt-3.5 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed",
          held && !wire ? "border-warn/30 bg-warn/8 text-warn" : "border-border bg-muted/30 text-muted-foreground",
        )}>
          <Mail className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">
            {held && !wire && <>Written for real, delivered nowhere. Every address on these runs is a reserved sandbox domain, so <span className="num">{held}</span> message{held === 1 ? " was" : "s were"} held instead of sent.</>}
            {!!held && !!wire && <><span className="num">{wire}</span> went out on the wire, <span className="num">{held}</span> held at the sandbox boundary.</>}
            {!held && !!wire && <>All <span className="num">{wire}</span> of these went out on the wire for real.</>}
          </span>
        </div>
      )}

      <div className="mt-3.5 flex flex-col gap-2.5">
        {loading && !msgs.length && (
          <>
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </>
        )}

        {!loading && !msgs.length && !err && (
          <Nothing
            title="Nothing filed yet."
            body="Take a load and the paperwork writes itself."
          />
        )}

        {runs.map((g) => (
          <div key={g.run} className="flex flex-col gap-2.5">
            {runs.length > 1 && (
              <div className="mono mt-1.5 flex items-center gap-2 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <span className="shrink-0">Run {g.run}</span>
                <span className="h-px min-w-0 flex-1 bg-border" />
                <span className="num shrink-0">{g.msgs.length}</span>
              </div>
            )}
            {g.msgs.map((m) => (
              <Doc key={m.id} m={m} now={at} open={open.has(m.id)} onToggle={() => toggle(m.id)} />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-[17px] font-semibold tracking-[-0.025em]">Blocked documents</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Paperwork that tried to give the agents orders. Model Armor read it first.
        </p>

        <div className="mt-3.5 flex flex-col gap-2.5">
          {loading && !items.length && <Skeleton className="h-24 w-full rounded-xl" />}
          {!loading && !items.length && (
            <Nothing title="Nothing has tried anything yet." body="If a document does, it stops here and you see exactly what it said." />
          )}
          {items.map((q, i) => <Blocked key={`${q.load_id ?? "q"}-${i}`} q={q} />)}
        </div>
      </div>
    </section>
  );
}

function Nothing({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-6 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/** One record. Collapsed it is a receipt line; expanded it is the actual text
 *  that left the building — no paraphrase, no summary. */
function Doc({ m, now, open, onToggle }: {
  m: OutboxMsg; now: number; open: boolean; onToggle: () => void;
}) {
  const { label, Icon, tone } = kindOf(m.kind);
  const live = m.backend === "live";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_BG[tone])}>
          <Icon className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{label}</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {m.to || "—"}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="outline" className={cn("border-transparent px-1.5", live ? "bg-ok/12 text-ok" : "bg-muted text-muted-foreground")}>
            {live ? "sent" : "held"}
          </Badge>
          <span className="num text-[10.5px] text-muted-foreground">{since(m.ts, now)}</span>
        </span>

        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border px-3.5 py-3.5">
          <div className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">To</div>
          <div className="mt-1 text-[13px] wrap-anywhere">{m.to || "—"}</div>

          <div className="mt-3 text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Subject</div>
          <div className="mt-1 text-[13.5px] font-medium wrap-anywhere">{m.subject || "—"}</div>

          <div className="mt-3 text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Body</div>
          <div className="mt-1 rounded-lg bg-muted/35 px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap wrap-anywhere">
            {m.body || "(no body)"}
          </div>

          {m.attachment && (
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12.5px]">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="mono min-w-0 truncate">{m.attachment}</span>
            </div>
          )}

          <div className={cn(
            "mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-relaxed",
            live ? "border-ok/25 bg-ok/8 text-ok" : "border-border bg-muted/30 text-muted-foreground",
          )}>
            {live ? <Send className="mt-px size-3.5 shrink-0" /> : <ShieldX className="mt-px size-3.5 shrink-0" />}
            <span className="min-w-0 wrap-anywhere">
              {live
                ? "Delivered for real through the mail provider."
                : m.held_reason
                  ? <>Held, not sent — {m.held_reason}.</>
                  : "Held at the sandbox boundary — nothing left the building."}
            </span>
          </div>

          <div className="mono mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="wrap-anywhere">{m.id}</span>
            {m.run_id && <span className="wrap-anywhere">{m.run_id}</span>}
            {!!m.ts && <span className="num">{clock(m.ts)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Model Armor's receipt: what came in, what it tried, and on which load. The
 *  finding text is quoted from the document — it is evidence, not an
 *  instruction to anyone. */
function Blocked({ q }: { q: QuarantineItem }) {
  const findings = q.findings ?? [];
  return (
    <div className="overflow-hidden rounded-xl border border-bad/30 bg-bad/6">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bad/12 text-bad">
          <ShieldX className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium capitalize wrap-anywhere">{q.threat || "Blocked document"}</div>
          <div className="mono mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {q.load_id || "—"}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 border-transparent bg-bad/12 px-1.5 text-bad">
          blocked
        </Badge>
      </div>

      {!!findings.length && (
        <div className="border-t border-bad/20 px-3.5 py-3">
          <div className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
            What was in it
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bad" />
                <span className="min-w-0 whitespace-pre-wrap wrap-anywhere text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-warn">
            Caught before any agent read it. Nothing in this document changed a verdict or a payment.
          </p>
        </div>
      )}
    </div>
  );
}
