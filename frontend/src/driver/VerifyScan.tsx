import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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
  loading,
  onDone,
  stepMs = 340,
}: {
  broker: string;
  checks: Check[];
  /** True when the docket holder is real and the posting is the forgery. The
   *  screen must never badge a licensed company as the fraudster. */
  impersonated?: boolean;
  /** The Verifier's own call — REFUSE / REVIEW / CLEAR. A REVIEW has warnings
   *  but no hard failure, so it cannot be inferred from the rows alone. */
  verdict?: string;
  loading?: boolean;
  onDone?: (blocked: boolean) => void;
  stepMs?: number;
}) {
  const [shown, setShown] = useState(0);

  // Nothing reveals until the real result is back — no pre-rolled theatre.
  useEffect(() => {
    if (loading) { setShown(0); return; }
    if (shown >= checks.length) {
      const t = setTimeout(() => onDone?.(verdict === "REFUSE" || verdict === "BLACKLISTED"), 1300);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((n) => n + 1), stepMs);
    return () => clearTimeout(t);
  }, [shown, checks.length, stepMs, loading, verdict]);

  const done = !loading && shown >= checks.length;
  const blocked = verdict === "REFUSE" || verdict === "BLACKLISTED";
  const review = verdict === "REVIEW";

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
          </div>
        )}
      </div>
    </div>
  );
}
