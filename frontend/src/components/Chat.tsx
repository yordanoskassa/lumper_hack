import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Send, Sparkles } from "lucide-react";
import { api, type TraceEvent } from "@/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackendTag } from "@/components/BackendTag";

export interface Msg {
  role: string;
  text: string;
  /** Set on an assistant turn so its agents' work can be shown underneath it. */
  runId?: string;
  pending?: boolean;
}

export const CHAT_GREETING: Msg = {
  role: "assistant",
  text:
    "I'm Dispatch. I run the fleet — Finder prices the loads, Verifier pulls the " +
    "federal record on the broker, Closer negotiates, Payday chases the money. " +
    "Tell me what to do, or name any real MC number and I'll check it.",
};

const SUGGESTIONS = [
  "Scan the board",
  "Check broker MC-1680087",
  "Run the callback scenario",
  "Run the detention scenario",
];

/** Colour per agent id, matching the live trace so the same agent reads the same
 *  everywhere in the product. */
const AGENT_INK: Record<string, string> = {
  "YARD BOSS": "text-primary", DISPATCH: "text-primary",
  FINDER: "text-[#60A5FA]", VERIFIER: "text-ok",
  CLOSER: "text-[#C084FC]", PAYDAY: "text-warn",
};

function agentOf(e: TraceEvent): string {
  return (e as { agent_name?: string }).agent_name || e.agent || "—";
}

/** The work behind an answer. Dispatch routes; the sub-agents do the job. If you
 *  cannot watch that happen, the claim that this is a fleet of agents is just a
 *  sentence on a slide. */
function AgentWork({ events, live }: { events: TraceEvent[]; live: boolean }) {
  const [open, setOpen] = useState(true);
  if (!events.length) return null;

  const agents: string[] = [];
  for (const e of events) {
    const a = agentOf(e);
    if (a !== "—" && !agents.includes(a)) agents.push(a);
  }
  const shown = open ? events.slice(-14) : [];

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-muted/25">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-90")} />
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {live ? "Agents working" : `${agents.length} agent${agents.length === 1 ? "" : "s"} · ${events.length} steps`}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {agents.slice(0, 5).map((a) => (
            <span key={a} className={cn("text-[10px] font-semibold", AGENT_INK[a.toUpperCase()] ?? "text-muted-foreground")}>
              {a.split(" ")[0]}
            </span>
          ))}
          {live && <span className="pulse-dot ml-1 size-1.5 rounded-full bg-ok" />}
        </span>
      </button>

      {open && (
        <div className="max-h-64 overflow-y-auto border-t border-border px-3 py-2">
          {shown.map((e, i) => (
            <div key={i} className="flex gap-2 py-1">
              <span className={cn("w-16 shrink-0 text-[10px] font-semibold",
                AGENT_INK[agentOf(e).toUpperCase()] ?? "text-muted-foreground")}>
                {agentOf(e).split(" ")[0]}
              </span>
              <span className="mono min-w-0 flex-1 text-[10.5px] leading-relaxed break-words text-foreground/80">
                {e.msg ?? e.tool ?? ""}
              </span>
              {e.backend && <BackendTag backend={e.backend} className="mt-px shrink-0" />}
            </div>
          ))}
          {live && !shown.length && (
            <div className="mono py-1 text-[10.5px] text-muted-foreground">
              routing<span className="blink">_</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** `local` is owned by App. Closing the panel used to unmount this component and
 *  take the answer with it, so every command destroyed its own reply. */
export function Chat({ chatFeed, local, setLocal, trace, onRoute }: {
  chatFeed: Msg[];
  local: Msg[];
  setLocal: React.Dispatch<React.SetStateAction<Msg[]>>;
  trace: TraceEvent[];
  onRoute?: (route: string) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveRun, setLiveRun] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const merged = mergeChat(local, chatFeed);

  // Group the stream by run so each answer can show the work that produced it.
  const byRun = useMemo(() => {
    const m = new Map<string, TraceEvent[]>();
    for (const e of trace) {
      if (!e.run_id || e.type === "chat") continue;
      const list = m.get(e.run_id) ?? [];
      list.push(e);
      m.set(e.run_id, list);
    }
    return m;
  }, [trace]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [merged.length, trace.length]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    setLocal((m) => [...m, { role: "user", text }]);
    try {
      const r = await api.chat(text);
      setLiveRun(r.run_id ?? null);
      setLocal((m) => [...m, { role: "assistant", text: r.reply, runId: r.run_id }]);
      if (r.route) onRoute?.(r.route);
    } catch {
      setLocal((m) => [...m, { role: "assistant", text: "The desk is unreachable — is the backend running?" }]);
    } finally {
      setBusy(false);
      // let the run keep streaming for a beat before it stops reading as live
      setTimeout(() => setLiveRun(null), 12000);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      {/* header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Sparkles className="size-4 text-primary" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Dispatch</div>
          <div className="truncate text-[11px] text-muted-foreground">
            Orchestrator · routes Finder, Verifier, Closer and Payday
          </div>
        </div>
      </div>

      {/* transcript */}
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {merged.map((m, i) => (
            <div key={i} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed wrap-anywhere whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-muted/40 text-foreground/90",
              )}>
                {m.text}
              </div>
              {m.role !== "user" && m.runId && (
                <div className="w-full max-w-[92%]">
                  <AgentWork events={byRun.get(m.runId) ?? []} live={liveRun === m.runId} />
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="mono flex items-center gap-2 pl-1 text-[11.5px] text-primary">
              Dispatch is routing this<span className="blink">_</span>
            </div>
          )}
        </div>
      </div>

      {/* suggestions + composer */}
      <div className="shrink-0 border-t border-border">
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 sm:px-4">
          {SUGGESTIONS.map((s) => (
            <Button key={s} variant="outline" size="sm" disabled={busy}
              onClick={() => send(s)} className="h-11 rounded-full text-[11.5px]">
              {s}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Tell the fleet what to do — or type any real MC number"
            aria-label="Message Dispatch"
            className="h-11 text-[13px]"
          />
          <Button size="tap" disabled={busy} onClick={() => send(input)} className="shrink-0">
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function mergeChat(local: Msg[], feed: Msg[]): Msg[] {
  // Turns started on another surface arrive on the stream. They happened before
  // anything typed here, so they sort first — appending them made a new question
  // render above an older answer while auto-scroll jumped to the stale one.
  const seen = new Set(local.map((m) => m.role + "|" + m.text));
  const extra = feed.filter((m) => !seen.has(m.role + "|" + m.text));
  return [extra.length ? extra : [], local].flat();
}
