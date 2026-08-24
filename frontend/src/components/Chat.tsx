import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { C } from "../theme";

interface Msg { role: string; text: string }

const SUGGESTIONS = [
  "Scan the board",
  "Screen MC-1687203",
  "Book P-90412",
  "Run the injection scenario",
];

export function Chat({ chatFeed, onRoute }: { chatFeed: Msg[]; onRoute?: (route: string) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<Msg[]>([
    { role: "assistant", text: "Yard Boss here. I route the fleet. Tell me what to run — try a suggestion below." },
  ]);
  const ref = useRef<HTMLDivElement>(null);

  // Merge server-streamed chat turns (from other surfaces) with local ones.
  const merged = mergeChat(local, chatFeed);

  useEffect(() => {
    const el = ref.current;
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
    } catch (e) {
      setLocal((m) => [...m, { role: "assistant", text: "backend unreachable — is the server running?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, flex: 1 }}>
      <div style={{ padding: "12px 15px", display: "flex", alignItems: "center", gap: 9, borderBottom: `1px solid ${C.hair}` }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: C.faint, color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>YB</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Yard Boss</div>
          <div style={{ fontSize: 10.5, color: C.muted }}>Orchestrator · Gemini function calling</div>
        </div>
      </div>

      <div ref={ref} style={{ flex: 1, overflowY: "auto", padding: "12px 13px", display: "flex", flexDirection: "column", gap: 9, minHeight: 160 }}>
        {merged.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "86%", fontSize: 12.5, lineHeight: 1.5, padding: "8px 11px", borderRadius: 10,
              background: m.role === "user" ? C.black : C.faint,
              color: m.role === "user" ? C.ink : C.body,
              border: m.role === "user" ? "none" : `1px solid ${C.border}`,
              whiteSpace: "pre-wrap",
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="mono" style={{ fontSize: 11, color: C.orange, paddingLeft: 4 }}>dispatching<span style={{ animation: "blink 1s step-end infinite" }}>_</span></div>}
      </div>

      <div style={{ padding: "8px 11px", display: "flex", gap: 6, flexWrap: "wrap", borderTop: `1px solid ${C.hair}` }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy} style={{ fontSize: 11, color: C.body, background: "rgba(255,255,255,.055)", border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 10px" }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ padding: "10px 11px", borderTop: `1px solid ${C.hair}`, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Tell the fleet what to do…"
          style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", fontSize: 12.5, background: C.faint, color: C.ink }}
        />
        <button onClick={() => send(input)} disabled={busy} style={{ background: busy ? C.faint : C.orange, color: busy ? C.muted : C.onAccent, borderRadius: 8, padding: "0 15px", fontSize: 12.5, fontWeight: 600 }}>
          Send
        </button>
      </div>
    </div>
  );
}

function mergeChat(local: Msg[], feed: Msg[]): Msg[] {
  // feed carries chat turns initiated elsewhere; dedupe against local by text.
  const seen = new Set(local.map((m) => m.role + "|" + m.text));
  const extra = feed.filter((m) => !seen.has(m.role + "|" + m.text));
  return [...local, ...extra];
}
