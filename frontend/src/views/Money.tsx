import { useCallback, useEffect, useState } from "react";
import { Building2, CircleAlert, Clock, Receipt, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/** One detention claim as Payday filed it. Every field but `owed`, `status`,
 *  `paid` and `evidence` can come back null on a half-written claim. */
interface Claim {
  id?: string | null;
  broker?: string | null;
  mc?: string | null;
  stop?: string | null;
  minutes_on_site?: number | null;
  billable_minutes?: number | null;
  rate_per_hour?: number | null;
  owed: number;
  status: string;
  paid: boolean;
  evidence: boolean;
}

/** Outbox rows, folded to an invoice shape by the backend. `amount` and `ts`
 *  are read off the mail record, which does not always carry them. */
interface Invoice {
  id?: string | null;
  to?: string | null;
  subject?: string | null;
  amount?: number | null;
  ts?: number | null;
}

/** A broker's payment behaviour, written by the agents and reused by them. */
interface Aging {
  broker?: string | null;
  mc?: string | null;
  avg_pay_days: number;
  unpaid: number;
  detention_denied: number;
  prior_loads: number;
}

interface MoneyData {
  owed_now: number;
  claims: Claim[];
  invoices: Invoice[];
  aging: Aging[];
  detention_terms?: { rate_per_hour?: number; free_hours?: number };
}

/** Claim status → the words a driver reads and the ink it wears. The lines are
 *  the driver app's, so one claim reads the same on the phone and the desk. */
const CLAIM_STATUS: Record<string, { line: string; cls: string; ink: string }> = {
  PAID: { line: "Paid", cls: "border-ok/35 bg-ok/12 text-ok", ink: "text-ok" },
  DENIED: { line: "Denied", cls: "border-bad/35 bg-bad/12 text-bad", ink: "text-bad" },
  CLAIM_FILED: { line: "Claim filed", cls: "border-warn/35 bg-warn/12 text-warn", ink: "text-warn" },
  NOTICE_SENT: { line: "Broker notified", cls: "border-warn/35 bg-warn/12 text-warn", ink: "text-warn" },
  METER_RUNNING: { line: "They owe you now", cls: "border-warn/35 bg-warn/12 text-warn", ink: "text-warn" },
  OPEN: { line: "Open", cls: "border-warn/35 bg-warn/12 text-warn", ink: "text-warn" },
  FREE_WINDOW: { line: "Free waiting time", cls: "border-border bg-muted/50 text-muted-foreground", ink: "text-muted-foreground" },
  WAITING: { line: "Waiting to be unloaded", cls: "border-border bg-muted/50 text-muted-foreground", ink: "text-muted-foreground" },
};

const AGING_COLS = "grid grid-cols-[1.7fr_0.8fr_0.9fr_0.8fr_0.6fr] gap-2";

function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hhmm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** "2h" reads better than "2h 00m" for a contract term. */
function hours(h: number): string {
  return Number.isInteger(h) ? `${h}h` : hhmm(h * 60);
}

/** Mail timestamps are seconds since epoch; tolerate milliseconds in case the
 *  record was written by something that used Date.now(). */
function when(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusOf(s: string) {
  return CLAIM_STATUS[s] ?? CLAIM_STATUS.OPEN;
}

/** Everything this carrier is owed and where it is stuck: the detention clock,
 *  the claims, the invoices out, and which brokers are slow to pay. */
export function Money() {
  const [d, setD] = useState<MoneyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch(API_BASE + "/api/money");
      if (!r.ok) throw new Error(String(r.status));
      setD((await r.json()) as MoneyData);
      setFailed(false);
    } catch {
      // The screen never shows a status code. Either it has the numbers or it
      // says, in words, that it could not reach the desk.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!d && failed) {
    return (
      <div className="h-full overflow-x-hidden overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] sm:px-5 lg:px-6 lg:pb-6">
        <Card size="sm" className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-start gap-3 py-2">
            <CircleAlert aria-hidden className="size-5 text-warn" />
            <div>
              <div className="text-[14px] font-semibold">Can’t reach the money desk</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Your claims are still on file — this screen just couldn’t read them.
                Nothing was lost.
              </p>
            </div>
            <Button size="tap" onClick={() => void load()} disabled={busy}>
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 sm:p-5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-22 w-full" />)}
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const claims = d.claims ?? [];
  const invoices = d.invoices ?? [];
  const aging = d.aging ?? [];

  const rate = d.detention_terms?.rate_per_hour ?? claims[0]?.rate_per_hour ?? 75;
  const free = d.detention_terms?.free_hours ?? 2;

  const denied = claims.filter((c) => c.status === "DENIED");
  const openClaims = claims.filter((c) => !c.paid);
  const collected = claims.filter((c) => c.paid).reduce((s, c) => s + (c.owed || 0), 0);
  const onBooks = aging.reduce((s, a) => s + (a.unpaid || 0), 0);

  // Unpaid first — that is the money still in play — and the biggest of those
  // at the top. Settled claims fall to the bottom as receipts.
  const ordered = [...claims].sort(
    (a, b) => Number(a.paid) - Number(b.paid) || (b.owed || 0) - (a.owed || 0),
  );

  return (
    // Breakpoints do the responding. One column is the default; the aging table
    // is the lg-and-up upgrade over the stacked broker cards.
    <div className="h-full overflow-x-hidden overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] sm:px-5 lg:px-6 lg:pb-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        {/* header */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">
              Home / <span className="text-foreground/80">Money</span>
            </div>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.025em] sm:text-[26px]">
              Money owed
            </h1>
          </div>
          <Button
            variant="outline"
            size="tap"
            onClick={() => void load()}
            disabled={busy}
            className="w-full sm:ml-auto sm:w-auto"
          >
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* the payoff number */}
        <Card className="gap-0 py-0">
          <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="text-[13px] text-muted-foreground">They owe you</div>
              <div className="num mt-0.5 text-[clamp(2.25rem,12vw,3.25rem)] leading-none font-semibold tracking-[-0.04em] text-primary">
                {money(d.owed_now ?? 0)}
              </div>
              <div className="mt-2.5 text-[12.5px] text-muted-foreground">
                First {hours(free)} free, ${rate}/hour after — the clock the broker
                counts on you not keeping.
              </div>
            </div>

            {d.owed_now > 0 && (
              <div className="shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 lg:max-w-[19rem]">
                <div className="text-[12.5px] leading-relaxed text-primary/90">
                  {openClaims.length === 1
                    ? "One claim is still unsettled."
                    : `${openClaims.length} claims are still unsettled.`}{" "}
                  Payday keeps billing them until they pay or a human calls it off.
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
            <Tile k="Claims open" v={String(openClaims.length)} sub={`of ${claims.length} filed`} />
            <Tile
              k="Denied by brokers"
              v={String(denied.length)}
              sub={denied.length ? "time they won’t pay for" : "none refused"}
              ink={denied.length ? "text-bad" : undefined}
            />
            <Tile
              k="Collected"
              v={money(collected)}
              sub={collected > 0 ? "detention actually paid" : "nothing settled yet"}
              ink={collected > 0 ? "text-ok" : undefined}
            />
            <Tile
              k="Unpaid on the books"
              v={money(onBooks)}
              sub={onBooks > 0 ? "across all brokers" : "brokers are square"}
              ink={onBooks > 0 ? "text-warn" : undefined}
            />
          </div>
        </Card>

        {/* claims */}
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Clock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-[13px] font-semibold">Detention claims</CardTitle>
            <span className="ml-auto text-[11.5px] text-muted-foreground">
              hours sat, hours billable, money
            </span>
          </CardHeader>

          <CardContent className="flex flex-col gap-2.5 py-3">
            {ordered.length === 0 ? (
              <Empty
                icon={<Clock aria-hidden className="size-5 text-muted-foreground" />}
                title="No detention claimed yet"
                body="Hit ARRIVED at a dock and Payday starts the clock. Past the free window it bills for you — you don’t have to remember anything."
              />
            ) : (
              ordered.map((c, i) => <ClaimRow key={c.id ?? i} c={c} fallbackRate={rate} />)
            )}
          </CardContent>
        </Card>

        {/* invoices */}
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Receipt aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-[13px] font-semibold">Invoices out</CardTitle>
            {invoices.length > 0 && (
              <span className="ml-auto text-[11.5px] text-muted-foreground">
                {invoices.length} raised
              </span>
            )}
          </CardHeader>

          <CardContent className="flex flex-col gap-2 py-3">
            {invoices.length === 0 ? (
              <Empty
                icon={<Receipt aria-hidden className="size-5 text-muted-foreground" />}
                title="Nothing invoiced yet"
                body="Deliver a load and Payday raises it — rate, detention as an accessorial, and the evidence attached."
              />
            ) : (
              invoices.map((inv, i) => (
                <div
                  key={inv.id ?? i}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium break-words">
                      {inv.subject || inv.id || "Invoice"}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground break-words">
                      {inv.to ? `to ${inv.to}` : "recipient not recorded"}
                      {when(inv.ts) ? ` · ${when(inv.ts)}` : ""}
                    </div>
                  </div>
                  {/* An invoice with no amount on the record shows no amount,
                      rather than a confident $0.00 that is not true. */}
                  <div
                    className={cn(
                      "num shrink-0 text-[15px] font-semibold sm:text-right",
                      typeof inv.amount === "number" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {typeof inv.amount === "number" ? money(inv.amount) : "—"}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* aging */}
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Building2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-[13px] font-semibold">Who is slow to pay</CardTitle>
            <span className="ml-auto text-[11.5px] text-muted-foreground">
              memory the agents wrote and reuse
            </span>
          </CardHeader>

          {aging.length === 0 ? (
            <CardContent className="py-3">
              <Empty
                icon={<Building2 aria-hidden className="size-5 text-muted-foreground" />}
                title="No payment history yet"
                body="Every load you run writes a broker’s behaviour back here. Verifier reads it before it clears the next one."
              />
            </CardContent>
          ) : (
            <>
              {/* narrow: stacked broker cards */}
              <CardContent className="flex flex-col gap-2.5 py-3 lg:hidden">
                {aging.map((a, i) => <AgingCard key={a.mc ?? i} a={a} />)}
              </CardContent>

              {/* lg and up: the aging table */}
              <div className="hidden overflow-x-auto lg:block">
                <div className="min-w-[560px]">
                  <div className={cn(AGING_COLS, "border-b border-border bg-muted/40 px-4 py-2")}>
                    <span className="text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground">BROKER</span>
                    <span className="text-right text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground">AVG PAY</span>
                    <span className="text-right text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground">UNPAID</span>
                    <span className="text-right text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground">DET. DENIED</span>
                    <span className="text-right text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground">LOADS</span>
                  </div>
                  {aging.map((a, i) => <AgingRow key={a.mc ?? i} a={a} />)}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Tile({ k, v, sub, ink }: { k: string; v: string; sub: string; ink?: string }) {
  return (
    <div className="bg-card px-3.5 py-3">
      <div className="text-xs text-foreground/80">{k}</div>
      <div className={cn("num mt-1 text-[20px] font-semibold tracking-[-0.02em]", ink)}>{v}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

/** One detention claim: the hours the driver actually sat, the share of them the
 *  broker owes for, the money, and whether there is evidence behind it. */
function ClaimRow({ c, fallbackRate }: { c: Claim; fallbackRate: number }) {
  const s = statusOf(c.status);
  const onSite = c.minutes_on_site ?? 0;
  const billable = c.billable_minutes ?? 0;
  const rate = c.rate_per_hour ?? fallbackRate;
  const freeMin = Math.max(0, onSite - billable);
  const freePct = onSite > 0 ? (freeMin / onSite) * 100 : 100;
  const isDenied = c.status === "DENIED";

  return (
    <div
      className={cn(
        "rounded-xl border border-l-[3px] border-border bg-muted/25 px-3.5 py-3.5",
        isDenied ? "border-l-bad" : c.paid ? "border-l-ok" : "border-l-warn",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold break-words">{c.broker ?? "Broker not recorded"}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground break-words">
            Sat at {c.stop ?? "the dock"}
            {c.mc ? <> · <span className="mono">{c.mc}</span></> : null}
            {c.id ? <> · <span className="mono">{c.id}</span></> : null}
          </div>
        </div>
        <Badge variant="outline" className={cn("shrink-0 h-6 px-2.5 text-[11.5px]", s.cls)}>
          {s.line}
        </Badge>
      </div>

      {/* free window vs. the part they owe for */}
      <div className="mt-3.5 flex h-2 overflow-hidden rounded-full bg-white/10">
        <div className="bg-muted-foreground/70" style={{ width: `${freePct}%` }} />
        {billable > 0 && <div className={cn("flex-1", isDenied ? "bg-bad" : c.paid ? "bg-ok" : "bg-primary")} />}
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        <span>
          Sat <span className="num text-foreground/85">{hhmm(onSite)}</span> · free{" "}
          <span className="num text-foreground/85">{hhmm(freeMin)}</span>
        </span>
        <span>
          Billable <span className="num text-foreground/85">{hhmm(billable)}</span> at ${rate}/hour
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[12.5px] text-muted-foreground">
          {c.paid ? "Paid" : "Owed"}
        </span>
        <span className={cn("num text-[22px] font-semibold tracking-[-0.02em]", c.paid ? "text-ok" : s.ink)}>
          {money(c.owed ?? 0)}
        </span>
      </div>

      {isDenied && (
        <div className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-bad">
          {c.broker ?? "The broker"} refused to pay for{" "}
          <span className="num">{hhmm(billable)}</span> the driver actually sat on their property.
        </div>
      )}

      <div
        className={cn(
          "mt-2.5 flex items-start gap-2 text-[12px] leading-relaxed",
          c.evidence ? "text-ok" : "text-muted-foreground",
        )}
      >
        {c.evidence ? (
          <ShieldCheck aria-hidden className="mt-px size-4 shrink-0" />
        ) : (
          <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
        )}
        <span className="min-w-0">
          {c.evidence
            ? "GPS timestamps and a written notice were filed at the dock. That record is exactly why the next one won’t be denied."
            : "No GPS timestamps or notice went out on this one — nothing to argue with. Hit ARRIVED the second you’re on their property and the next one isn’t deniable."}
        </span>
      </div>
    </div>
  );
}

/** Below lg: one broker, stacked. */
function AgingCard({ a }: { a: Aging }) {
  const repeat = a.detention_denied >= 2;
  return (
    <div
      className={cn(
        "rounded-xl border border-l-[3px] border-border bg-muted/25 px-3.5 py-3",
        a.unpaid > 0 ? "border-l-bad" : repeat ? "border-l-warn" : "border-l-transparent",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold break-words">{a.broker ?? "Unnamed broker"}</div>
          {a.mc && <div className="mono mt-0.5 text-[11px] text-muted-foreground">{a.mc}</div>}
        </div>
        {a.unpaid > 0 && (
          <Badge variant="outline" className="shrink-0 h-6 px-2.5 text-[11.5px] border-bad/35 bg-bad/12 text-bad">
            {money(a.unpaid)} unpaid
          </Badge>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Cell k="Avg pay" v={payLabel(a)} ink={payInk(a)} />
        <Cell
          k="Det. denied"
          v={String(a.detention_denied)}
          ink={a.detention_denied > 0 ? "text-bad" : "text-muted-foreground"}
        />
        <Cell k="Loads" v={String(a.prior_loads)} />
      </div>

      {repeat && <RepeatNote n={a.detention_denied} />}
    </div>
  );
}

/** lg and up: the same broker, dense. */
function AgingRow({ a }: { a: Aging }) {
  const repeat = a.detention_denied >= 2;
  return (
    <div className="border-b border-border last:border-b-0">
      <div className={cn(AGING_COLS, "items-center px-4 py-2.5")}>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium">{a.broker ?? "Unnamed broker"}</div>
          {a.mc && <div className="mono truncate text-[10.5px] text-muted-foreground">{a.mc}</div>}
        </div>
        <div className={cn("num text-right text-xs", payInk(a))}>{payLabel(a)}</div>
        <div className={cn("num text-right text-xs", a.unpaid > 0 ? "text-bad" : "text-muted-foreground")}>
          {a.unpaid > 0 ? money(a.unpaid) : "—"}
        </div>
        <div className={cn("num text-right text-xs", a.detention_denied > 0 ? "text-bad" : "text-muted-foreground")}>
          {a.detention_denied || "—"}
        </div>
        <div className="num text-right text-xs text-muted-foreground">{a.prior_loads}</div>
      </div>
      {repeat && (
        <div className="px-4 pb-2.5">
          <RepeatNote n={a.detention_denied} />
        </div>
      )}
    </div>
  );
}

/** A broker with a habit of denying detention is a broker to time to the second. */
function RepeatNote({ n }: { n: number }) {
  return (
    <div className="mt-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11.5px] leading-relaxed text-warn">
      {n} denied claims on record. Hit ARRIVED the second you’re on their property —
      the timestamp is the whole case.
    </div>
  );
}

/** `avg_pay_days: 0` means no completed payment, not "pays same day". Saying
 *  "0 days" about a broker who has never paid is the one lie this screen
 *  cannot tell. */
function payLabel(a: Aging): string {
  if (a.avg_pay_days > 0) return `${a.avg_pay_days}d`;
  return a.unpaid > 0 ? "never paid" : "—";
}

function payInk(a: Aging): string {
  if (a.avg_pay_days <= 0) return a.unpaid > 0 ? "text-bad" : "text-muted-foreground";
  if (a.avg_pay_days >= 45) return "text-bad";
  if (a.avg_pay_days >= 30) return "text-warn";
  return "text-ok";
}

function Cell({ k, v, ink }: { k: string; v: string; ink?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card px-2.5 py-1.5">
      <span className="text-[10.5px] text-muted-foreground">{k}</span>
      <span className={cn("num mt-0.5 truncate text-[13px]", ink ?? "text-foreground")}>{v}</span>
    </div>
  );
}

/** An empty section that reads as a state, not a failure. */
function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
      {icon}
      <div className="text-[13.5px] font-medium">{title}</div>
      <p className="max-w-sm text-[12.5px] leading-relaxed text-pretty text-muted-foreground">{body}</p>
    </div>
  );
}
