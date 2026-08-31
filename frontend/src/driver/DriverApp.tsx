import type { TraceEvent } from "@/api";
import { RunProvider, useRun } from "./RunProvider";
import { LoadsTab } from "@/views/LoadsTab";
import { TripTab } from "@/views/TripTab";
import { PaperworkTab } from "@/views/PaperworkTab";

/** Installed to a home screen there is no tab bar to switch, so the whole run
 *  lives on one surface: the same three tabs the console shows, selected by the
 *  flow itself. The state lives in RunProvider either way — this file is now
 *  just the standalone shell. */
export function DriverApp({ trace }: { trace?: TraceEvent[] }) {
  return (
    <RunProvider trace={trace}>
      <RunSurface />
    </RunProvider>
  );
}

function RunSurface() {
  const { activeTab } = useRun();
  if (activeTab === "trip") return <TripTab />;
  if (activeTab === "paperwork") return <PaperworkTab />;
  return <LoadsTab />;
}
