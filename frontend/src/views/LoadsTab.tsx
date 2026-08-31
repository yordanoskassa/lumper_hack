import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import type { DriverBoard, DriverLoad } from "@/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Empty, Place, RunShell, useRun } from "@/driver/RunProvider";
import { VerifyScan } from "@/driver/VerifyScan";

/** Find me a load, through the background check. The tab ends the moment a
 *  broker clears — from there the run belongs to Trip. */
/** How long a posting has been sitting. A load nobody has taken in six hours is
 *  a different proposition from one posted two minutes ago — and naming the
 *  board it came off means the load has a provenance, not just a price. */
function postedAgo(min?: number | null): string {
  if (min == null) return "just posted";
  if (min < 60) return `posted ${Math.round(min)}m ago`;
  return `posted ${Math.floor(min / 60)}h ago`;
}

export function LoadsTab() {
  const {
    screen, board, verifying, scan, gps, truck, onTrip, picked,
    hunt, openScan, finishVerify, setTab, reset,
  } = useRun();

  // The background check is a takeover, not a screen swap: the board stays
  // mounted underneath it so a refused broker drops back exactly where it was.
  const checking = screen === "verify" ? verifying : null;

  return (
    <RunShell
      map={false}
      overlay={
        checking ? (
          <VerifyScan
            broker={checking.broker}
            checks={scan?.checks ?? []}
            impersonated={checking.impersonated}
            verdict={scan?.verdict}
            federal={scan?.federal}
            mc={scan?.mc ?? checking.mc}
            loading={!scan}
            onDone={finishVerify}
          />
        ) : null
      }
    >
      {(screen === "home" || screen === "hunting") && (
        <div className="mb-5 hidden lg:block">
          <Place gps={!!gps} city={truck?.city} big />
        </div>
      )}

      {screen === "home" && <Home onHunt={hunt} driver={truck?.driver} />}
      {screen === "hunting" && <Hunting />}
      {(screen === "loads" || screen === "verify") && board && (
        <Loads board={board} onPick={openScan} />
      )}

      {/* You cannot shop for freight while you are hauling some. */}
      {onTrip && picked && (
        <Empty
          title="You're already on a load."
          body={
            screen === "pod" || screen === "paid"
              ? `${picked.dest} is delivered. Finish the paperwork and this board comes back.`
              : `${picked.origin} → ${picked.dest}. Finish this run and we'll find you the next one.`
          }
          cta={screen === "pod" || screen === "paid" ? "Back to the paperwork" : "Back to my run"}
          onCta={() => setTab(screen === "pod" || screen === "paid" ? "paperwork" : "trip")}
          // Tapping the wrong load used to commit you to the entire flow. A
          // driver who changes their mind needs a way back to the board that
          // is not "reload the page".
          alt="Drop it and find another"
          onAlt={reset}
        />
      )}
    </RunShell>
  );
}

function Home({ onHunt, driver }: { onHunt: () => void; driver?: string }) {
  return (
    <>
      <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.03em] lg:text-2xl">
        Your truck is empty{driver ? `, ${driver.split(" ").pop()}` : ""}.
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Tap once. We check every load for you before you ever see it.
      </p>
      <Button size="cab" className="mt-6" onClick={onHunt}>Find me a load</Button>
    </>
  );
}

function Hunting() {
  const lines = [
    "Pulling every load near you…",
    "Checking real miles and fuel cost…",
    "Running background checks on each broker…",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, lines.length - 1)), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="pt-1">
      {lines.slice(0, i + 1).map((l, n) => (
        <div key={n} className={cn("scan-row flex items-center gap-2.5 py-2 text-[14.5px]",
          n === i ? "text-foreground" : "text-muted-foreground")}>
          <span className={cn("size-1.5 shrink-0 rounded-full", n === i ? "bg-ok" : "bg-muted-foreground/50")} />
          {l}
        </div>
      ))}
    </div>
  );
}

function Loads({ board, onPick }: { board: DriverBoard; onPick: (l: DriverLoad) => void }) {
  // Which card is showing its source record. One at a time.
  const [raw, setRaw] = useState<string | null>(null);
  // Tapping a load picks it. Running the check is a separate, deliberate act,
  // and it is attributed: you are handing this posting to Verifier, not
  // pressing a button that makes a verdict appear.
  const [sel, setSel] = useState<string | null>(null);
  const good = board.loads.filter((l) => !l.blocked);
  const bad = board.loads.filter((l) => l.blocked);
  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-0.03em]">
        {good.length} load{good.length === 1 ? "" : "s"} worth taking
      </h1>
      {!!bad.length && (
        <p className="mt-1.5 text-sm text-bad">We threw out {bad.length} you should never see.</p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {[...good, ...bad].map((l) => (
          <LoadCard
            key={l.id}
            l={l}
            selected={sel === l.id}
            onSelect={() => setSel(sel === l.id ? null : l.id)}
            onVerify={() => onPick(l)}
            raw={raw}
            setRaw={setRaw}
          />
        ))}
      </div>
    </>
  );
}

/** Three states, never two: a REVIEW load dressed as "SAFE" with a green tick is
 *  the one lie this screen must not tell. */
const VERDICT = {
  CLEAR: { label: "CHECKED · SAFE", cls: "text-ok bg-ok/15", Icon: Check },
  REVIEW: { label: "CHECKED · ONE CATCH", cls: "text-warn bg-warn/15", Icon: AlertTriangle },
  BLOCKED: { label: "BLOCKED", cls: "text-bad bg-bad/15", Icon: X },
} as const;

function LoadCard({ l, selected, onSelect, onVerify, raw, setRaw }: {
  l: DriverLoad;
  selected: boolean;
  onSelect: () => void;
  onVerify: () => void;
  raw: string | null; setRaw: (id: string | null) => void;
}) {
  const v = VERDICT[l.blocked ? "BLOCKED" : l.verdict === "REVIEW" ? "REVIEW" : "CLEAR"];
  const tone = l.blocked ? "text-bad" : l.verdict === "REVIEW" ? "text-warn" : "text-ok";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className={cn(
        "w-full cursor-pointer rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
        l.blocked ? "border-bad/35 opacity-75" : "border-border",
        selected && "ring-2 ring-primary/60",
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cn("rounded-full px-2 py-1 text-[10.5px] font-semibold tracking-[0.08em]", v.cls)}>
          {v.label}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{l.eq}</span>
      </div>

      <div className={cn("num text-[34px] leading-none font-semibold tracking-[-0.035em]",
        l.blocked && "text-muted-foreground line-through")}>
        ${l.rate.toLocaleString()}
      </div>
      <div className="mt-2 text-[15px] font-medium">{l.origin} → {l.dest}</div>
      <div className="num mt-0.5 text-[13px] text-muted-foreground">
        {Math.round(l.miles)} miles · ${l.rpm.toFixed(2)} a mile after fuel
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
        <span className="mono">{l.source ?? "board"}</span>
        <span>·</span>
        <span>{postedAgo(l.posted_min)}</span>
        <span>·</span>
        <span className="mono">{l.mc}</span>
        {l.raw && (
          <button
            onClick={(e) => { e.stopPropagation(); setRaw(raw === l.id ? null : l.id); }}
            className="ml-auto min-h-11 text-[11.5px] text-primary underline-offset-2 hover:underline"
          >
            {raw === l.id ? "hide posting" : "see the posting"}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
        {raw === l.id && l.raw && (
          <div className="mb-2.5 overflow-hidden rounded-lg border border-border bg-background/60">
            <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              The posting, as it came off {String(l.raw.src ?? "the board")}
            </div>
            <dl className="divide-y divide-border">
              {Object.entries(l.raw)
                .filter(([k]) => !k.startsWith("_") && k !== "posted_ts")
                .map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-3 py-1">
                    <dt className="mono w-20 shrink-0 text-[10.5px] text-muted-foreground">{k}</dt>
                    <dd className="mono min-w-0 flex-1 text-[10.5px] break-words text-foreground/80">
                      {String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
            <div className="border-t border-border px-3 py-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
              <span className="mono">cph</span> and <span className="mono">cem</span> are the
              contact this posting claims. The check compares them against the federal record.
            </div>
          </div>
        )}
        {selected && (
          <div className="mb-3 rounded-xl border border-ok/30 bg-ok/8 p-3">
            <div className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-ok" />
              <span className="text-[12px] font-semibold text-ok">Verifier</span>
              <span className="text-[11.5px] text-muted-foreground">proves the broker is real</span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              Pulls the live federal record for {l.mc}, diffs it field by field against
              what this posting claims, and checks it against everything we remember.
            </p>
            <Button
              size="cab"
              className="mt-3 bg-ok text-[#052e21] hover:bg-ok/90"
              onClick={(e) => { e.stopPropagation(); onVerify(); }}
            >
              Run the check with Verifier
            </Button>
          </div>
        )}

        {l.reasons.slice(0, 2).map((r, i) => (
          <div key={i} className="flex gap-2 text-[13px] text-muted-foreground">
            <v.Icon className={cn("mt-px size-3.5 shrink-0", tone)} />
            <span className="min-w-0">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
