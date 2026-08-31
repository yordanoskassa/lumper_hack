import type { ReactNode } from "react";
import type { DriverLoad } from "@/api";
import { Button } from "@/components/ui/button";
import { DetentionCard } from "@/driver/DetentionCard";
import { haversineMi } from "@/driver/geo";
import { Empty, RunShell, useRun } from "@/driver/RunProvider";

/** The run itself: the route, the arrival timestamp, and the clock that turns a
 *  four-hour wait into money. */
export function TripTab() {
  const { screen, picked, here, det, hunt, arrive, takePaperwork, setTab, reset } = useRun();

  // One branch always wins, so this tab can never render an empty column.
  let body: ReactNode;
  if (picked && screen === "trip") {
    body = <Trip load={picked} here={here} onArrive={arrive} onDrop={reset} />;
  } else if (picked && screen === "dock") {
    body = (
      <>
        <DetentionCard d={det} />
        <Button size="cab" className="mt-4" onClick={takePaperwork}>
          I'm unloaded — take the paperwork
        </Button>
      </>
    );
  } else if (picked) {
    // Delivered but not yet invoiced: the run is over, the money is not.
    body = (
      <Empty
        title="This run is done."
        body={`You're off the dock at ${picked.dest}. The paperwork is the last thing between you and the money.`}
        cta="Go to Paperwork"
        onCta={() => setTab("paperwork")}
      />
    );
  } else {
    body = (
      <Empty
        title="No load on."
        body="Find one in Loads. Once a broker clears our checks, the run and its detention clock live here."
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

function Trip({ load, here, onArrive, onDrop }: {
  load: DriverLoad; here: [number, number]; onArrive: () => void; onDrop?: () => void;
}) {
  const left = Math.round(haversineMi(here, [load.dest_lat, load.dest_lng]) * 1.19);
  return (
    <>
      <div className="text-[11px] font-semibold tracking-[0.1em] text-primary/90 uppercase">On the way to</div>
      <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.035em]">{load.dest}</h1>
      <div className="num mt-2.5 text-[15px] text-muted-foreground">
        {left} miles out · ${load.rate.toLocaleString()} on this run
      </div>
      <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3.5 text-[13.5px] leading-relaxed text-muted-foreground">
        When you pull into the dock, hit the button. That timestamp is what gets you
        paid if they make you wait.
      </div>
      <Button size="cab" className="mt-5" onClick={onArrive}>I'm at the dock</Button>
      {/* Before the clock starts there is no claim to lose, so backing out is
          free — and a driver who tapped the wrong card should not have to
          finish someone else's run to escape it. */}
      {onDrop && (
        <Button variant="ghost" size="tap" className="mt-2 w-full" onClick={onDrop}>
          Not taking this one
        </Button>
      )}
    </>
  );
}
