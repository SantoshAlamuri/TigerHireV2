/**
 * Adapts the v1 analytics payloads to the v2 tiles.
 *
 * v2 computed its numbers client-side from the first 100 application rows. v1
 * already had server endpoints reading SQL views over all the data, with
 * caching, role restrictions and CSV export — so the redesign was replacing
 * trustworthy numbers with a sample. The v2 information architecture is worth
 * keeping; its arithmetic is not.
 *
 * The honest-null rule survives the move: an empty view yields null with a
 * reason, never a zero. What changes is what the reason MEANS. "Cost per hire:
 * not tracked" used to mean this screen never asked; now it means the org has
 * recorded no spend.
 */
import type { Metric } from "./ta-metrics";
import { resolveBenchmark, compareToTarget, targetLabel, type Verdict } from "./benchmarks";
import type { Period } from "./period";

export interface TimeToHireRow {
  job_id?: string;
  job_title?: string | null;
  avg_days_to_hire?: number | null;
  hired_count?: number | null;
}

export interface PipelineRow {
  job_id?: string;
  job_title?: string | null;
  total_applications?: number | null;
  viewed?: number | null;
  shortlisted?: number | null;
  hired?: number | null;
  rejected?: number | null;
  hire_rate_pct?: number | null;
}

const plain = (label: string, value: number | null, unit: string, note: string): Metric => ({
  label,
  value,
  unit,
  note,
  tone: "plain",
});

/**
 * A weighted mean, not a mean of means. The view gives one average per job, and
 * treating a job that hired nine people the same as one that hired one reports
 * a number nobody experienced.
 */
/**
 * The underlying view measures `updated_at - created_at` on hired applications,
 * which is not time-to-hire — it is time since the row was last touched. Editing
 * a hired application months later silently resets its "duration" to zero. The
 * note says what is being measured so nobody reads it as the real clock.
 */
export function fuseTimeToHire(rows: TimeToHireRow[]): Metric {
  let days = 0;
  let hires = 0;
  for (const r of rows) {
    const avg = r.avg_days_to_hire;
    const n = r.hired_count ?? 0;
    // A hire count with no measured duration cannot contribute a duration.
    if (avg == null || n <= 0) continue;
    days += avg * n;
    hires += n;
  }
  return plain(
    "Time to hire",
    hires > 0 ? Math.round(days / hires) : null,
    "days",
    hires > 0
      ? `weighted across ${hires} hire${hires === 1 ? "" : "s"} · measured to last update, not to a hire date`
      : "No hires with a measured duration yet",
  );
}

export interface OfferOutcomes {
  total_offers?: number | null;
  accepted_count?: number | null;
  declined_count?: number | null;
  acceptance_rate?: number | null;
}

export function fuseOfferAcceptance(o: OfferOutcomes | null | undefined): Metric {
  const decided = (o?.accepted_count ?? 0) + (o?.declined_count ?? 0);
  if (!o || decided === 0) {
    return plain(
      "Offer acceptance",
      null,
      "%",
      o?.total_offers
        ? `${o.total_offers} offer${o.total_offers === 1 ? "" : "s"} still outstanding — none decided`
        : "No offers decided yet — nothing to measure",
    );
  }
  const rate = o.acceptance_rate ?? Math.round(((o.accepted_count ?? 0) / decided) * 100);
  return plain("Offer acceptance", rate, "%", `${decided} decided`);
}

export interface CostPerHire {
  cost_per_hire_usd?: number | null;
  hired_count?: number | null;
  note?: string | null;
}

/**
 * NOT the recruiting cost per hire.
 *
 * The endpoint sums platform_cost_events.amount_usd — TigerHire's own AI and
 * infrastructure spend on the account. The industry metric of the same name
 * means agency fees, job-board spend and referral bonuses, and runs to tens of
 * thousands of rupees. Printing "Cost per hire: 4.71" in a talent dashboard
 * would be read as the second thing while measuring the first, so the label and
 * the currency both have to say what this actually is.
 */
export function fusePlatformCostPerHire(c: CostPerHire | null | undefined): Metric {
  const value = c?.cost_per_hire_usd ?? null;
  if (value !== null) {
    const n = c?.hired_count ?? 0;
    return plain(
      "Platform cost / hire",
      Math.round(value * 100) / 100,
      " USD",
      `TigerHire AI + infra across ${n} hire${n === 1 ? "" : "s"} — not agency or job-board spend`,
    );
  }
  return plain(
    "Platform cost / hire",
    null,
    "",
    // The endpoint explains itself in some cases; overriding that with our own
    // wording would contradict the server.
    c?.note?.trim() ||
      (c?.hired_count ? "No platform cost recorded against these hires" : "No hires yet"),
  );
}

export function fuseReqsPerRecruiter(recruiters: { user_id?: string }[], openJobs: number): Metric {
  if (recruiters.length === 0) {
    return plain("Reqs per recruiter", null, "", "No recruiters on record for this org");
  }
  const per = Math.round((openJobs / recruiters.length) * 10) / 10;
  return {
    label: "Reqs per recruiter",
    value: per,
    unit: "",
    note: `${openJobs} open across ${recruiters.length} recruiter${recruiters.length === 1 ? "" : "s"}`,
    // Beyond roughly seven open roles a desk stops giving each one attention.
    tone: per > 7 ? "warn" : "plain",
  };
}

/**
 * Attaches the benchmark line and the verdict colour to a metric.
 *
 * The note becomes "<what we measured> · <what it is being compared to>", so the
 * reference is never separated from the number it judges. A tile that is red
 * without saying what it is red against is an accusation with no evidence.
 */
export function withBenchmark(
  m: Metric,
  key: string,
  orgTargets: Record<string, number | null | undefined> = {},
): Metric & { verdict: Verdict; target: string | null; benchmarkSource: string | null } {
  const b = resolveBenchmark(key, orgTargets);
  const verdict = compareToTarget(m.value, key, orgTargets);
  return {
    ...m,
    // The target sits in a corner badge, not inside the note. Appending it made
    // an already-long sub-line longer, and buried the one thing a reader scans
    // for: are we over or under.
    note: m.note,
    verdict,
    target: b ? targetLabel(b, m.unit) : null,
    benchmarkSource: b?.source ?? null,
  };
}

/**
 * The v1 endpoints already accept from/to. The period selector therefore needs
 * no server change — it just has to speak their language.
 */
export function periodParams(p: Period): { from?: string; to?: string } {
  if (p.start === null) return {};
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: day(p.start), to: day(p.end) };
}
