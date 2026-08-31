import { api } from "@/api";
import type { Check as ScanCheck } from "@/driver/VerifyScan";

/** The plain-English question each federal/memory check actually answers. The
 *  evidence string is the agent's own words — we never invent it here. */
export const CHECK_COPY: Record<string, { q: string; detail: string }> = {
  safer:     { q: "Is this a real company?",                     detail: "Federal carrier registry (SAFER)" },
  callback:  { q: "Does their phone number match the registry?", detail: "Load posting vs. the federal record" },
  authority: { q: "Are they licensed to broker freight?",        detail: "FMCSA Licensing & Insurance" },
  insurance: { q: "Is their bond on file?",                      detail: "FMCSA surety bond record" },
  oos:       { q: "Have they been shut down?",                   detail: "Out-of-service orders" },
  domain:    { q: "How old is their website?",                   detail: "Domain registration (RDAP)" },
  phone:     { q: "Is anyone else using this number?",           detail: "Your carrier's memory" },
  ach:       { q: "Is their bank account shared?",               detail: "Your carrier's memory" },
  payment:   { q: "Have they paid you before?",                  detail: "Payment history" },
  detention: { q: "Do they pay for waiting time?",               detail: "Detention claim history" },
};

export interface VerifierCheck {
  key: string; name: string; ok: boolean; warn: boolean; skipped: boolean; evidence?: string;
}

export interface ScanResult {
  checks: ScanCheck[];
  verdict: string;
  broker: string;
  impersonated: boolean;
}

/** Map the Verifier's real checks onto the scan rows. Skipped checks are dropped
 *  rather than shown as passes — "we could not look" is not "it is clean". */
export function toChecks(list: VerifierCheck[] | undefined): ScanCheck[] {
  if (!list?.length) return [];
  return list
    .filter((c) => !c.skipped)
    .map((c) => {
      const copy = CHECK_COPY[c.key] ?? { q: c.name, detail: "Verifier" };
      return {
        q: copy.q,
        detail: copy.detail,
        verdict: c.ok ? ("pass" as const) : c.warn ? ("warn" as const) : ("fail" as const),
        // Only surface evidence when it says something; a passing row stays quiet.
        found: c.ok ? undefined : c.evidence,
      };
    });
}

/** One screening path for the whole product. The dispatcher on the desk and the
 *  driver on their phone are looking at the same load — they should be looking
 *  at the same evidence, produced by the same agent, not two lookalike screens
 *  that could drift apart. `explain: false` skips the Gemini prose neither
 *  surface renders. */
export async function runScreen(
  postingId: string,
  fallback?: { broker: string; blocked: boolean; verdict?: string; reasons?: string[] },
): Promise<ScanResult> {
  try {
    const r = await api.screen(postingId, undefined, false);
    const v = r.verifier ?? r.ghost ?? {};
    return {
      checks: toChecks(v.checks),
      verdict: v.verdict ?? (fallback?.blocked ? "REFUSE" : "CLEAR"),
      broker: v.broker ?? fallback?.broker ?? postingId,
      impersonated: Boolean(v.impersonated),
    };
  } catch {
    // The board already carries a verdict and its reasons; fall back to those
    // rather than inventing federal findings we did not actually retrieve.
    return {
      checks: (fallback?.reasons ?? []).map((r) => ({
        q: r,
        detail: "From this load's screening",
        verdict: fallback?.blocked ? ("fail" as const) : ("pass" as const),
      })),
      verdict: fallback?.blocked ? "REFUSE" : fallback?.verdict === "REVIEW" ? "REVIEW" : "CLEAR",
      broker: fallback?.broker ?? postingId,
      impersonated: false,
    };
  }
}
