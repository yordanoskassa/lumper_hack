import { useEffect, useState } from "react";
import { Fuel } from "lucide-react";
import { API_BASE } from "@/api";
import { cn } from "@/lib/utils";
import { BackendTag } from "@/components/BackendTag";

interface Stop {
  label: string; city: string; padd: string; price: number;
  asof: string; backend: string; why?: string;
}
interface Plan {
  origin: string; dest: string; miles: number | null; mpg: number;
  gallons: number | null; stops: Stop[]; advice: string | null; saving: number;
}

/** Where to buy diesel on this run. Diesel is priced by PADD region and the
 *  spread between two regions is real money on a full tank — a truck crossing a
 *  PADD line can keep more by timing the stop than a dispatcher keeps haggling
 *  the rate. The prices are EIA's own weekly series, read live and keyless. */
export function FuelCard({ postingId }: { postingId?: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const q = postingId ? `?posting_id=${encodeURIComponent(postingId)}` : "";
    fetch(API_BASE + "/api/fuel" + q)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setPlan(d))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [postingId]);

  if (failed || !plan?.stops?.length) return null;
  const worth = plan.saving >= 5;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Fuel className="size-3.5 shrink-0 text-primary" />
        <span className="text-[11.5px] font-semibold text-primary">Finder</span>
        <span className="text-[11px] text-muted-foreground">where to fuel</span>
        {plan.gallons != null && (
          <span className="num ml-auto text-[11px] text-muted-foreground">
            {plan.gallons} gal · {plan.mpg} mpg
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {plan.stops.map((s, i) => {
          const cheapest = plan.stops.every((o) => s.price <= o.price);
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{s.city}</div>
                <div className="text-[10.5px] text-muted-foreground">
                  {s.label} · {s.padd} · week of {s.asof}
                </div>
              </div>
              <div className="text-right">
                <div className={cn("num text-[15px] font-semibold",
                  cheapest && plan.saving >= 5 ? "text-ok" : "text-foreground")}>
                  ${s.price.toFixed(3)}
                </div>
                <BackendTag backend={s.backend} />
              </div>
            </div>
          );
        })}
      </div>

      {plan.advice && (
        <div className={cn("border-t px-4 py-3",
          worth ? "border-ok/25 bg-ok/8" : "border-border bg-muted/25")}>
          {worth && (
            <div className="num text-[20px] leading-none font-semibold text-ok">
              ${plan.saving.toFixed(2)} <span className="text-[12px] font-normal">you keep</span>
            </div>
          )}
          <p className={cn("text-[12px] leading-relaxed text-muted-foreground", worth && "mt-1.5")}>
            {plan.advice}
          </p>
        </div>
      )}
    </div>
  );
}
