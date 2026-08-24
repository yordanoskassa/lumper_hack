import { useEffect, useRef, useState } from "react";
import type { TraceEvent } from "./api";

// One shared SSE connection to the backend trace/state stream. Components read
// the rolling trace list; state snapshots (desk/run) are surfaced via callback.
export function useStream(onState?: (runId: string, state: any) => void,
                         onChat?: (e: TraceEvent) => void,
                         onMail?: (m: any) => void) {
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const cbState = useRef(onState);
  const cbChat = useRef(onChat);
  const cbMail = useRef(onMail);
  cbState.current = onState;
  cbChat.current = onChat;
  cbMail.current = onMail;

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      const e: TraceEvent = JSON.parse(ev.data);
      if (e.type === "state" && e.state) {
        cbState.current?.(e.run_id, e.state);
        return;
      }
      if (e.type === "chat") {
        cbChat.current?.(e);
        return;
      }
      if (e.type === "mail") {
        cbMail.current?.(e.mail);
        return;
      }
      setTrace((prev) => {
        const next = prev.length > 600 ? prev.slice(-600) : prev.slice();
        next.push(e);
        return next;
      });
    };
    return () => es.close();
  }, []);

  return { trace, connected, clearTrace: () => setTrace([]) };
}
