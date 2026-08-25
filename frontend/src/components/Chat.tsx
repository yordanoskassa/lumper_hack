import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/api";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface Msg { role: string; text: string }

// Phrases the Dispatch router resolves even when Gemini is offline and the
// keyword fallback is doing the routing.
const SUGGESTIONS = [
  "Scan the board",
  "Check broker MC-1680087",
  "Run the callback scenario",
  "Run the detention scenario",
];

export function Chat({ chatFeed, onRoute }: { chatFeed: Msg[]; onRoute?: (route: string) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<Msg[]>([
    { role: "assistant", text: "Dispatch here. I route the fleet — Finder, Verifier, Closer and Payday. Tell me what to run, or tap a suggestion below." },
  ]);
  const ref = useRef<HTMLDivElement>(null);

  // Merge server-streamed chat turns (from other surfaces) with local ones.
  const merged = mergeChat(local, chatFeed);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]");
    if (el) el.scrollTop = el.scrollHeight;
  }, [merged.length]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    setLocal((m) => [...m, { role: "user", text }]);
    try {
      const r = await api.chat(text);
      setLocal((m) => [...m, { role: "assistant", text: r.reply }]);
      if (r.route) onRoute?.(r.route);
    } catch {
      setLocal((m) => [...m, { role: "assistant", text: "backend unreachable — is the server running?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 py-0">
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-3">
        <Avatar size="sm">
          <AvatarFallback className="text-[10px] font-semibold">DX</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Dispatch</div>
          <div className="truncate text-[10.5px] text-muted-foreground">
            Orchestrator · routes the four agents
          </div>
        </div>
      </div>
      <Separator />

      <ScrollArea ref={ref} className="min-h-40 flex-1">
        <div className="flex flex-col gap-2.5 px-3 py-3">
          {merged.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[86%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed wrap-anywhere whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-muted/50 text-foreground/90",
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="mono pl-1 text-[11px] text-primary">
              dispatching<span className="blink">_</span>
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />
      <div className="flex shrink-0 flex-wrap gap-1.5 px-3 py-2">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s}
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => send(s)}
            className="h-9 rounded-full text-[11.5px]"
          >
            {s}
          </Button>
        ))}
      </div>

      <Separator />
      <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Tell the fleet what to do…"
          aria-label="Message Dispatch"
          className="h-11 text-[13px]"
        />
        <Button size="tap" disabled={busy} onClick={() => send(input)} className="shrink-0">
          <Send className="size-4" />
          <span className="sr-only sm:not-sr-only">Send</span>
        </Button>
      </div>
    </Card>
  );
}

function mergeChat(local: Msg[], feed: Msg[]): Msg[] {
  // feed carries chat turns initiated elsewhere; dedupe against local by text.
  const seen = new Set(local.map((m) => m.role + "|" + m.text));
  const extra = feed.filter((m) => !seen.has(m.role + "|" + m.text));
  return [...local, ...extra];
}
