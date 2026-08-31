import { useRef, type ReactNode } from "react";
import { Camera } from "lucide-react";
import type { DriverLoad } from "@/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Empty, RunShell, useRun } from "@/driver/RunProvider";

/** The last mile of the money: one photo of the signed bill, sent with the GPS
 *  stamps, and the run pays out. */
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

  return <RunShell>{body}</RunShell>;
}

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
