import { useEffect, useRef } from "react";
import { AlertTriangle, Check, MapPin, X } from "lucide-react";
import type { DriverLoad } from "@/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRun } from "@/driver/RunProvider";
import { DetentionCard } from "@/driver/DetentionCard";

/** The cards Dispatch answers with. A fleet of agents that replies in
 *  paragraphs is a chatbot; one that hands back the actual loads, the actual
 *  federal record and the actual running clock is the product. Every card reads
 *  from the live run, so the chat and the tabs are never two versions of the
 *  truth — they are two windows on one. */

const VERDICT = {
  CLEAR: { label: "CHECKED · SAFE", cls: "text-ok bg-ok/15", Icon: Check },
  REVIEW: { label: "ONE CATCH", cls: "text-warn bg-warn/15", Icon: AlertTriangle },
  BLOCKED: { label: "BLOCKED", cls: "text-bad bg-bad/15", Icon: X },
} as const;

function verdictOf(l: DriverLoad) {
  return VERDICT[l.blocked ? "BLOCKED" : l.verdict === "REVIEW" ? "REVIEW" : "CLEAR"];
}

/** The board, as cards, inside the conversation. */
export function LoadsCard() {
  const { board, openScan } = useRun();
  if (!board?.loads.length) return null;
  const good = board.loads.filter((l) => !l.blocked);
  const bad = board.loads.filter((l) => l.blocked);

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="text-[11.5px] text-muted-foreground">
        {good.length} worth taking · {bad.length} thrown out.
        {bad.length > 0 && " The ones I stopped pay the most — that is what bait looks like."}
      </div>
      {[...good, ...bad].map((l) => {
        const v = verdictOf(l);
        return (
          <button
            key={l.id}
            onClick={() => openScan(l)}
            className={cn(
              "rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40",
              l.blocked ? "border-bad/30 opacity-80" : "border-border",
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.07em]", v.cls)}>
                {v.label}
              </span>
              <span className="ml-auto text-[10.5px] text-muted-foreground">
                {l.source ?? "board"} · {l.eq}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className={cn("num text-[22px] leading-none font-semibold tracking-[-0.03em]",
                l.blocked && "text-muted-foreground line-through")}>
                ${l.rate.toLocaleString()}
              </span>
              <span className="num text-[11px] text-muted-foreground">
                {Math.round(l.miles)} mi · ${l.rpm.toFixed(2)}/mi after fuel
              </span>
            </div>
            <div className="mt-1 text-[12.5px] font-medium">{l.origin} → {l.dest}</div>
            <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{l.broker}</div>
            <div className="mt-2 text-[11px] font-medium text-ok">
              Tap to hand it to Verifier →
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Verifier's findings, in the thread. */
export function VerifyCard() {
  const { verifying, scan, finishVerify } = useRun();
  // A thread is a record. Once the run moves on, `verifying` clears and this
  // card would blank out — deleting the evidence the driver was just shown.
  // Keep the last result so the finding stays where it was said.
  const kept = useRef<{ broker: string; scan: typeof scan; impersonated: boolean } | null>(null);
  useEffect(() => {
    if (verifying && scan) {
      kept.current = { broker: verifying.broker, scan, impersonated: Boolean(scan.impersonated) };
    }
  }, [verifying, scan]);

  const live = verifying ? { broker: verifying.broker, scan, impersonated: Boolean(scan?.impersonated) } : null;
  const show = live ?? kept.current;
  const settled = !verifying;
  if (!show) return null;
  const result = show.scan;
  const blocked = result?.verdict === "REFUSE" || result?.verdict === "BLACKLISTED";
  const review = result?.verdict === "REVIEW";
  const fed = result?.federal;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-ok/30 bg-ok/6">
      <div className="flex items-center gap-2 border-b border-ok/20 px-3 py-2">
        <span className="size-2 shrink-0 rounded-full bg-ok" />
        <span className="text-[11.5px] font-semibold text-ok">Verifier</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {show.impersonated ? "someone posing as " : ""}{show.broker}
        </span>
      </div>

      {!result ? (
        <div className="mono px-3 py-2.5 text-[11px] text-ok">
          pulling the federal record<span className="blink">_</span>
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border">
            {result.checks.map((c, i) => (
              <div key={i} className="px-3 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 text-[12px]">{c.q}</span>
                  <span className={cn("mono text-[9.5px] font-semibold tracking-[0.08em]",
                    c.verdict === "pass" ? "text-ok" : c.verdict === "warn" ? "text-warn" : "text-bad")}>
                    {c.verdict === "pass" ? "OK" : c.verdict === "warn" ? "ODD" : "BAD"}
                  </span>
                </div>
                {c.found && (
                  <div className="mono mt-1 text-[10.5px] leading-relaxed break-words text-bad">
                    {c.found}
                  </div>
                )}
              </div>
            ))}
          </div>

          {fed?.legal_name && (
            <div className="border-t border-border bg-background/40 px-3 py-2">
              <div className="text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                The federal record · check it at safer.fmcsa.dot.gov
              </div>
              <div className="mono mt-1 text-[10.5px] leading-relaxed break-words text-foreground/80">
                {fed.legal_name} · USDOT {fed.dot_number} · {fed.registered_address}
                <br />registered phone {fed.registered_phone} · authority {fed.broker_authority}
                {fed.bond_on_file ? " · bond on file" : " · NO bond on file"}
              </div>
            </div>
          )}

          <div className={cn("border-t px-3 py-2.5",
            blocked ? "border-bad/25 bg-bad/8" : review ? "border-warn/25 bg-warn/8" : "border-ok/25 bg-ok/8")}>
            <div className={cn("text-[13px] font-semibold",
              blocked ? "text-bad" : review ? "text-warn" : "text-ok")}>
              {blocked ? "Blocked — you would never have been paid"
                : review ? "Take it, but watch them" : "Safe. Go get it."}
            </div>
            {!settled && (
              <Button
                size="tap"
                variant={blocked ? "outline" : "default"}
                className="mt-2 w-full"
                onClick={() => finishVerify(blocked)}
              >
                {blocked ? "Back to the board" : "Take this load"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Payday's clock, live in the thread. */
export function DetentionChatCard() {
  const { det, picked, arrive, screen, takePaperwork } = useRun();
  if (!picked) return null;

  if (screen === "trip") {
    return (
      <div className="mt-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 shrink-0 text-primary" />
          <span className="text-[11.5px] font-semibold text-primary">Closer</span>
          <span className="truncate text-[11px] text-muted-foreground">running the trip</span>
        </div>
        <div className="mt-1.5 text-[12.5px]">{picked.origin} → {picked.dest}</div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Tell me when you are on their property. That timestamp is what wins the
          detention claim if they make you wait.
        </p>
        <Button size="tap" className="mt-2 w-full" onClick={arrive}>I'm at the dock</Button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full bg-warn" />
        <span className="text-[11.5px] font-semibold text-warn">Payday</span>
        <span className="text-[11px] text-muted-foreground">running the clock</span>
      </div>
      <DetentionCard d={det} />
      <Button size="tap" className="mt-2 w-full" onClick={takePaperwork}>
        I'm unloaded — take the paperwork
      </Button>
    </div>
  );
}

/** The money, at the end of the thread. */
export function PaidCard() {
  const { picked, det, reset } = useRun();
  if (!picked) return null;
  const owed = det.owed ?? 0;
  return (
    <div className="mt-2 rounded-xl border border-ok/30 bg-ok/8 p-3">
      <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ok uppercase">Money in</div>
      <div className="num mt-1 text-[26px] leading-none font-semibold tracking-[-0.035em]">
        ${(picked.rate + owed).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <div className="mt-2 flex flex-col gap-0.5 text-[11.5px]">
        <div className="flex justify-between"><span className="text-muted-foreground">The load</span>
          <span className="num">${picked.rate.toLocaleString()}</span></div>
        {owed > 0 && (
          <div className="flex justify-between"><span className="text-muted-foreground">Waiting time I fought for</span>
            <span className="num text-primary">+${owed.toFixed(2)}</span></div>
        )}
      </div>
      <Button size="tap" variant="outline" className="mt-2.5 w-full" onClick={reset}>
        Find me the next one
      </Button>
    </div>
  );
}
