import { cn } from "@/lib/utils";

/** Where an answer actually came from. Surfacing this is the honesty feature —
 *  a cached estimate must never be mistaken for a live measurement. */
const TAG: Record<string, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "text-ok border-ok/35 bg-ok/12" },
  sandbox: { label: "SANDBOX", cls: "text-primary border-primary/35 bg-primary/12" },
  cached: { label: "CACHED", cls: "text-warn border-warn/35 bg-warn/12" },
  template: { label: "TEMPLATE", cls: "text-muted-foreground border-border bg-muted/40" },
  keyword: { label: "KEYWORD", cls: "text-muted-foreground border-border bg-muted/40" },
};

export function BackendTag({ backend, className }: { backend?: string; className?: string }) {
  if (!backend) return null;
  const t = TAG[backend] ?? {
    label: backend.toUpperCase(),
    cls: "text-muted-foreground border-border bg-muted/40",
  };
  return (
    <span
      className={cn(
        "mono inline-block rounded-full border px-1.5 py-px text-[9px] tracking-[0.06em]",
        t.cls,
        className,
      )}
    >
      {t.label}
    </span>
  );
}
