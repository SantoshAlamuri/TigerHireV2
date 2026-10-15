/**
 * Talent pool rows — who was passed over, why, and what they would fit now.
 *
 * 380 CVs per job is only an asset if rejections stay queryable. Every reject
 * carries a structured reason, so the pool can answer "open a ₹35–45L role and
 * the CTC-rejected are instant pipeline — already screened, already scored".
 *
 * The "fit for" column is the one that has to be right or not shown. It is
 * derived from the reason that actually blocked the person: a candidate turned
 * down on compensation fits a job whose band now covers what they asked, and a
 * candidate turned down on location fits a job in the place they are. Anything
 * else returns "no open match" rather than a guess, because a wrong suggestion
 * here costs a recruiter a wasted outreach and the candidate a second rejection.
 *
 * UNITS: jobs.compensation_min/max are ABSOLUTE RUPEES (1200000 = ₹12L) while
 * applications.expected_ctc_lpa is in LAKHS. Comparing them directly reads
 * ₹40L as ₹40 and marks every band as fitting. The conversion lives here, once.
 */
import { REJECT_REASONS } from "./review-queue";

const RUPEES_PER_LAKH = 100_000;

export interface PoolCandidate {
  applicationId: string;
  candidateId: string;
  name: string;
  /** The job they were rejected from. */
  jobTitle: string;
  /** The score they held at the time of that decision. */
  score: number | null;
  rejectionReason: string | null;
  /** What they asked for, in lakhs per annum. */
  expectedCtcLpa: number | null;
  location: string | null;
  rejectedAt: string | null;
}

export interface OpenJob {
  id: string;
  title: string;
  /** Absolute rupees, as stored. */
  compensationMin: number | null;
  compensationMax: number | null;
  location: string | null;
}

export type FitTone = "fits" | "stretch" | "none";

export interface PoolRow extends PoolCandidate {
  reasonLabel: string;
  /** The reason in the recruiter's terms, with the number that caused it. */
  reasonDetail: string;
  /** Month the decision was made, or null when the timestamp is missing. */
  when: string | null;
  fitFor: { label: string; tone: FitTone };
}

const REASON_LABELS = new Map(REJECT_REASONS.map((r) => [r.id, r.label]));

export function reasonLabel(reason: string | null | undefined): string {
  const key = reason?.trim();
  if (!key) return "No reason recorded";
  return REASON_LABELS.get(key) ?? key;
}

/** "₹40L" — lakhs are how Indian recruiters read and negotiate compensation. */
function lakhs(value: number): string {
  return `₹${Number.isInteger(value) ? value : value.toFixed(1)}L`;
}

function bandLabel(job: OpenJob): string | null {
  const min = job.compensationMin;
  const max = job.compensationMax;
  if (!min || !max || max <= 0) return null;
  return `${lakhs(min / RUPEES_PER_LAKH)}–${lakhs(max / RUPEES_PER_LAKH)}`;
}

/**
 * Why they were passed over, in the terms the recruiter would use.
 *
 * The category alone ("Compensation fit") does not tell you whether to
 * re-approach; the number does. Where the number was never captured the label
 * stands alone rather than being padded with an invented figure.
 */
export function reasonDetail(row: PoolCandidate): string {
  const label = reasonLabel(row.rejectionReason);
  if (row.rejectionReason?.trim() === "compensation" && row.expectedCtcLpa) {
    return `Asked ${lakhs(row.expectedCtcLpa)}`;
  }
  if (row.rejectionReason?.trim() === "location" && row.location) {
    return `${label} · based in ${row.location}`;
  }
  return label;
}

function sameCity(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.trim().toLowerCase().split(",")[0].trim();
  return norm(a) === norm(b);
}

/**
 * The open job this person would clear today, judged only against the thing
 * that blocked them last time.
 *
 * Deliberately narrow. A candidate rejected for missing must-have skills is not
 * suddenly a fit because another job is open, so those return "no open match" —
 * the pool is for circumstantial rejections, which is what `poolable` marks.
 */
export function fitFor(row: PoolCandidate, openJobs: OpenJob[]): { label: string; tone: FitTone } {
  const none = { label: "no open match", tone: "none" as const };
  const reason = row.rejectionReason?.trim();

  if (reason === "compensation" && row.expectedCtcLpa) {
    const askedRupees = row.expectedCtcLpa * RUPEES_PER_LAKH;
    for (const job of openJobs) {
      const band = bandLabel(job);
      if (!band || job.compensationMax === null) continue;
      if (askedRupees <= job.compensationMax)
        return { label: `${job.title} — band fits`, tone: "fits" };
    }
    // Within a tenth of the top of a band is a conversation, not a match.
    for (const job of openJobs) {
      if (!bandLabel(job) || job.compensationMax === null) continue;
      if (askedRupees <= job.compensationMax * 1.1) {
        return { label: `${job.title} — stretch`, tone: "stretch" };
      }
    }
    return none;
  }

  if (reason === "location" && row.location) {
    for (const job of openJobs) {
      if (sameCity(job.location, row.location)) {
        return { label: `${job.title} — location matches`, tone: "fits" };
      }
    }
    return none;
  }

  return none;
}

/** Month the decision was made — "May" reads faster than a full date in a table. */
export function whenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", { month: "short" });
}

export function buildPoolRows(rows: PoolCandidate[], openJobs: OpenJob[]): PoolRow[] {
  return rows.map((r) => ({
    ...r,
    reasonLabel: reasonLabel(r.rejectionReason),
    reasonDetail: reasonDetail(r),
    when: whenLabel(r.rejectedAt),
    fitFor: fitFor(r, openJobs),
  }));
}

/** How many sit under each reason, for the filter chips. */
export function countByReason(rows: PoolCandidate[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = r.rejectionReason?.trim() || "unspecified";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
