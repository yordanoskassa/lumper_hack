import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FederalRecord } from "@/lib/screening";

export interface Check {
  q: string;          // plain English, what a bystander understands
  detail: string;     // the actual source, so it reads as real work
  verdict: "pass" | "fail" | "warn";
  found?: string;     // the damning line, when there is one
}

const TONE = {
  pass: { label: "OK", text: "text-ok", chip: "text-ok border-ok/30 bg-ok/10", box: "border-ok/25 bg-ok/8" },
  warn: { label: "ODD", text: "text-warn", chip: "text-warn border-warn/30 bg-warn/10", box: "border-warn/25 bg-warn/8" },
  fail: { label: "BAD", text: "text-bad", chip: "text-bad border-bad/30 bg-bad/10", box: "border-bad/25 bg-bad/8" },
} as const;

/** The security sweep. Deliberately the only place in the product that looks
 *  like a terminal — this is the moment we want to feel like a background check,
 *  not a freight app. Everywhere else keeps the calm Lumper surface. */
export function VerifyScan({
  broker,
  checks,
  verdict,
  impersonated,
  federal,
  mc,
  loading,
  onDone,
  stepMs = 950,
}: {
  broker: string;
  checks: Check[];
  /** True when the docket holder is real and the posting is the forgery. The
   *  screen must never badge a licensed company as the fraudster. */
  impersonated?: boolean;
  /** The raw record the verdict was drawn from. Shown so the claim can be
   *  checked against the public source rather than believed. */
  federal?: FederalRecord;
  mc?: string;
  /** The Verifier's own call — REFUSE / REVIEW / CLEAR. A REVIEW has warnings
   *  but no hard failure, so it cannot be inferred from the rows alone. */
  verdict?: string;
  loading?: boolean;
  onDone?: (blocked: boolean) => void;
  stepMs?: number;
}) {
  const [shown, setShown] = useState(0);
  const blocked = verdict === "REFUSE" || verdict === "BLACKLISTED";
  const review = verdict === "REVIEW";

  // Nothing reveals until the real result is back — no pre-rolled theatre.
  // And nothing auto-advances, in either direction: each check lands slowly
  // enough to be read, and a cleared broker still waits for the driver to say
  // "I want this load". Racing eight green lights past a human and then moving
  // them on unasked made the check feel like an animation, not a decision.
  useEffect(() => {
    if (loading) { setShown(0); return; }
    if (shown >= checks.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), stepMs);
    return () => clearTimeout(t);
  }, [shown, checks.length, stepMs, loading]);

  const done = !loading && shown >= checks.length;

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-[#0B0B0E] px-5 py-6 sm:px-8 lg:px-10">
      {/* faint scanline field */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "repeating-linear-gradient(0deg, rgba(52,211,153,.045) 0 1px, transparent 1px 3px)" }}
      />

      <div className="relative mx-auto w-full max-w-2xl">
        <div className="mono text-[10.5px] tracking-[0.14em] text-ok/80">BACKGROUND CHECK RUNNING</div>
        {impersonated && (
          <div className="mt-1.5 text-[13px] font-medium text-warn">Someone posing as</div>
        )}
        <div className={cn("text-xl leading-tight font-semibold tracking-[-0.03em] sm:text-2xl",
          impersonated ? "mt-0.5" : "mt-1.5")}>
          {broker}
        </div>

        {loading && (
          <div className="mono mt-6 flex items-center gap-2 text-[12px] text-ok">
            retrieving the federal record<span className="blink">_</span>
          </div>
        )}

        <div className="mt-6 flex flex-col">
          {checks.map((c, i) => {
            const state = i < shown ? "done" : i === shown ? "running" : "idle";
            if (state === "idle") return null;
            const t = TONE[c.verdict];
            return (
              <div key={i} className="scan-row border-b border-white/6 py-3">
                <div className="flex items-baseline gap-2.5">
                  <span className="flex-1 text-[14.5px] leading-snug font-medium">{c.q}</span>
                  {state === "running" ? (
                    <span className="mono blink text-[11px] text-ok">···</span>
                  ) : (
                    <span className={cn("mono shrink-0 rounded border px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.1em]", t.chip)}>
                      {t.label}
                    </span>
                  )}
                </div>
                <div className="mono mt-1 text-[11px] text-muted-foreground">{c.detail}</div>
                {state === "done" && c.found && (
                  <div className={cn("mono mt-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-relaxed break-words", t.box, t.text)}>
                    {c.found}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {done && federal?.legal_name && (
          <div className="scan-row mt-4 overflow-hidden rounded-2xl border border-border bg-muted/25">
            <div className="border-b border-border px-4 py-2.5">
              <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                The federal record we read
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Public record. Look it up yourself at safer.fmcsa.dot.gov
                {federal.dot_number ? ` — USDOT ${federal.dot_number}` : ""}.
              </div>
            </div>
            <dl className="divide-y divide-border">
              <FedRow k="Legal name" v={federal.legal_name} />
              {federal.dba_name && <FedRow k="Doing business as" v={federal.dba_name} />}
              <FedRow k="USDOT" v={federal.dot_number} />
              <FedRow k="Docket" v={federal.docket ?? mc} />
              <FedRow k="Registered address" v={federal.registered_address} />
              <FedRow k="Registered phone" v={federal.registered_phone} />
              <FedRow k="Broker authority" v={federal.broker_authority} />
              <FedRow
                k="Surety bond"
                v={federal.bond_on_file ? "on file" : federal.bond_required ? "REQUIRED, not on file" : "not required"}
                tone={federal.bond_on_file ? "ok" : federal.bond_required ? "bad" : undefined}
              />
            </dl>
          </div>
        )}

        {done && (
          <div className={cn("scan-row mt-4 rounded-2xl border px-4 py-4",
            blocked ? "border-bad/40 bg-bad/12"
              : review ? "border-warn/40 bg-warn/12" : "border-ok/40 bg-ok/12")}>
            <div className={cn("text-2xl leading-tight font-semibold tracking-[-0.035em]",
              blocked ? "text-bad" : review ? "text-warn" : "text-ok")}>
              {blocked ? "We blocked this load"
                : review ? "Take it, but watch them" : "This one is safe"}
            </div>
            <div className="mt-1.5 text-sm leading-snug text-muted-foreground">
              {blocked
                ? impersonated
                  ? "This company is real. Whoever posted this load is not them — you would have hauled it and never been paid."
                  : "You would have hauled it and never been paid."
                : review ? "They check out, but their record has a catch worth knowing."
                : "Real company. They pay. Go get it."}
            </div>
            {blocked ? (
              <Button size="cab" className="mt-4" onClick={() => onDone?.(true)}>
                Back to the board
              </Button>
            ) : (
              <>
                <Button size="cab" className="mt-4" onClick={() => onDone?.(false)}>
                  I want this load — send the offer
                </Button>
                <Button variant="ghost" size="tap" className="mt-2 w-full"
                  onClick={() => onDone?.(true)}>
                  Pass on it
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FedRow({ k, v, tone }: { k: string; v?: string | null; tone?: "ok" | "bad" }) {
  if (!v) return null;
  return (
    <div className="flex gap-3 px-4 py-2">
      <dt className="w-36 shrink-0 text-[11.5px] text-muted-foreground">{k}</dt>
      <dd className={cn("mono min-w-0 flex-1 text-[11.5px] break-words",
        tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-foreground/85")}>
        {v}
      </dd>
    </div>
  );
}
