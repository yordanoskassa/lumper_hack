import { DriverApp } from "../driver/DriverApp";
import type { TraceEvent } from "../api";

/** The product itself, not a mock of it. Same component the driver loads in a
 *  phone browser or installs to a home screen — it just has more room here, so
 *  the map goes full-height and the agents' trace surfaces over it. */
export function Driver({ trace }: { trace: TraceEvent[]; connected: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <DriverApp trace={trace} />
    </div>
  );
}
