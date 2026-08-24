import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface DetentionState {
  active: boolean;
  posting_id?: string;
  stop?: string;
  arrived_at?: number;
  free_minutes?: number;
  minutes_on_site?: number;
  billable_minutes?: number;
  rate_per_hour?: number;
  owed?: number;
  notice_sent?: boolean;
  status?: "WAITING" | "FREE_WINDOW" | "METER_RUNNING" | "NOTICE_SENT" | "CLAIM_FILED" | "PAID";
  timeline?: { ts: number; label: string; kind?: string }[];
}

const STATUS: Record<string, { line: string; cls: string }> = {
  WAITING: { line: "Waiting to be unloaded", cls: "text-muted-foreground bg-muted/60" },
  FREE_WINDOW: { line: "Free waiting time", cls: "text-muted-foreground bg-muted/60" },
  METER_RUNNING: { line: "They owe you now", cls: "text-primary bg-primary/15" },
  NOTICE_SENT: { line: "Broker has been told", cls: "text-warn bg-warn/15" },
  CLAIM_FILED: { line: "Claim filed for you", cls: "text-warn bg-warn/15" },
  PAID: { line: "Detention paid", cls: "text-ok bg-ok/15" },
};

function hhmm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** The clock the driver never keeps and the broker counts on them not keeping.
 *  Ticks locally between polls so it reads as live, not as a refreshing table. */
export function DetentionCard({ d }: { d: DetentionState }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const free = d.free_minutes ?? 120;
  const onSite = d.minutes_on_site ?? 0;
  const rate = d.rate_per_hour ?? 75;
  const billable = Math.max(0, onSite - free);
  const owed = d.owed ?? (billable / 60) * rate;
  const s = STATUS[d.status ?? "WAITING"] ?? STATUS.WAITING;
  const pastFree = onSite > free;
  // Before the window closes the bar fills toward it; after, it splits the whole
  // stay into free vs. billable so the orange share grows as the money does.
  const freePct = pastFree ? (free / onSite) * 100 : (onSite / free) * 100;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase", s.cls)}>
          {s.line}
        </span>
        {d.status === "METER_RUNNING" && <span className="pulse-dot size-[7px] rounded-full bg-primary" />}
      </div>

      <div className="text-[13px] text-muted-foreground">Sitting at {d.stop ?? "the dock"}</div>
      <div className="num text-[clamp(2rem,11vw,2.75rem)] leading-none font-semibold tracking-[-0.04em]">
        {hhmm(onSite)}
      </div>

      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10">
        <div className="bg-muted-foreground/70 transition-[width] duration-500"
          style={{ width: `${freePct}%` }} />
        {pastFree && <div className="flex-1 bg-gradient-to-r from-primary to-warn" />}
      </div>
      <div className="mt-1.5 flex justify-between text-[11.5px] text-muted-foreground">
        <span>First {hhmm(free)} free</span>
        <span>${rate}/hour after</span>
      </div>

      {pastFree && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3.5">
          <div className="text-[12.5px] text-primary/90">They owe you</div>
          <div className="num text-[clamp(1.6rem,9vw,2.125rem)] leading-tight font-semibold tracking-[-0.03em] text-primary">
            ${owed.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-primary/80">{hhmm(billable)} past the free window</div>
        </div>
      )}

      {!!d.timeline?.length && (
        <div className="mt-5">
          <div className="mb-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            What your agent did
          </div>
          <div className="flex flex-col">
            {d.timeline.map((t, i) => (
              <div key={i} className="flex items-stretch gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full",
                    t.kind === "money" ? "bg-primary" : t.kind === "ok" ? "bg-ok" : "bg-muted-foreground/60")} />
                  {i < d.timeline!.length - 1 && <span className="min-h-4 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 pb-3 text-[13.5px] leading-snug">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
