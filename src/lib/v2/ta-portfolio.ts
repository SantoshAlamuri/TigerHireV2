/**
 * The Head of Talent's portfolio: every open job, what is blocking it, and who
 * owns that blocker.
 *
 * This is the screen where a Head of Talent earns the budget conversation, so
 * it lives or dies on whether the blockers are true. Two rules follow from that:
 *
 *  1. A metric that cannot be computed returns null with a reason, never a
 *     number — the same rule ta-metrics.ts is built on. "0 days" on an empty
 *     org is not empty, it is wrong, and wrong numbers here get acted on.
 *  2. The signals actually evaluated are reported alongside the verdict. A job
 *     shown as "on track" when nothing checked its offers is a false all-clear,
 *     and a false all-clear is worse than a missing row.
 */
import { computeJobBlocker, type JobBlocker } from "./job-blocker";

export interface PortfolioApplication {
  jobId: string;
  status: string;
  /** Null when the applicant has no active score — a silent drop. */
  score: number | null;
}

export interface PortfolioJob {
  id: string;
  title: string;
  createdAt: string | null;
  /** Display name of whoever owns the job, or null when unassigned. */
  ownerName: string | null;
  rubricApproved: boolean;
  /** The score a candidate must reach on this job's rubric, if it has one. */
  threshold: number | null;
}

/**
 * What the blocker engine needs to know about a job's applicants.
 *
 * These are counts, not rows, because the page used to derive them from
 * `/api/applications?limit=100` — a route that hard-caps at 100 — and then
 * printed "47 waiting" as though it had seen everything. Past a hundred
 * applications across the org the numbers were simply wrong, silently, on the
 * screen whose entire claim is that its blockers are true.
 */
export interface JobApplicantCounts {
  applicants: number;
  awaitingReview: number;
  /** Applied but never scored — a silent drop, not a slow reviewer. */
  unscored: number;
  /** At or above this job's threshold. Equals `scored` when it has no bar. */
  clearingBar: number;
}

export const NO_APPLICANTS: JobApplicantCounts = {
  applicants: 0,
  awaitingReview: 0,
  unscored: 0,
  clearingBar: 0,
};

/** Statuses that mean a human still owes this applicant a decision. */
export const AWAITING_REVIEW_STATUSES = ["applied", "viewed"] as const;

/**
 * Roll applications up per job.
 *
 * Lives here rather than in the route so the counting rules — what "awaiting
 * review" means, what clearing the bar means when there is no bar — are stated
 * once and tested once, wherever the rows come from.
 */
export function tallyApplications(
  jobs: PortfolioJob[],
  applications: PortfolioApplication[],
): Map<string, JobApplicantCounts> {
  const thresholds = new Map(jobs.map((j) => [j.id, j.threshold]));
  const counts = new Map<string, JobApplicantCounts>();
  for (const job of jobs) counts.set(job.id, { ...NO_APPLICANTS });

  for (const a of applications) {
    const c = counts.get(a.jobId);
    if (!c) continue;
    c.applicants += 1;
    if ((AWAITING_REVIEW_STATUSES as readonly string[]).includes(a.status)) c.awaitingReview += 1;
    if (a.score === null) {
      c.unscored += 1;
      continue;
    }
    // With no threshold there is no bar to clear, so every scored applicant
    // counts — "nobody clears it" must not fire on a missing rubric.
    const threshold = thresholds.get(a.jobId) ?? null;
    if (threshold === null || a.score >= threshold) c.clearingBar += 1;
  }
  return counts;
}

/** Offers that reached an answer, and how many of those were a yes. */
export interface OfferOutcomes {
  accepted: number;
  declined: number;
  expired: number;
}

/**
 * Offer accept rate, or null with the reason.
 *
 * The tile that showed this was a hardcoded em-dash: a quarter of the summary
 * strip that could never populate, on any org, ever. It is a real number now —
 * and still null, not 0%, until an offer has actually been answered. Nought
 * percent accept and nobody-has-replied-yet are opposite situations to walk
 * into a budget conversation with.
 */
export function offerAcceptRate(o: OfferOutcomes): { pct: number | null; decided: number } {
  const decided = o.accepted + o.declined + o.expired;
  return { pct: decided === 0 ? null : Math.round((o.accepted / decided) * 100), decided };
}

export interface PortfolioRow {
  jobId: string;
  jobTitle: string;
  daysOpen: number | null;
  blocker: JobBlocker;
  owner: string;
}

const DAY = 86_400_000;

export function daysOpen(createdAt: string | null, now: number): number | null {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t) || t > now) return null;
  return Math.round((now - t) / DAY);
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * The signals this rollup could NOT evaluate.
 *
 * Overdue scorecards and aging offers each need a per-job fetch the portfolio
 * does not make, so they are passed as zero to the blocker engine — which means
 * a job whose only problem is an aging offer reads as "on track". Naming them
 * on the page is the difference between an incomplete view and a misleading one.
 */
export const UNEVALUATED_SIGNALS = ["overdue scorecards", "aging offers"] as const;

export function portfolioRows(
  jobs: PortfolioJob[],
  countsByJob: Map<string, JobApplicantCounts>,
  now: number,
): PortfolioRow[] {
  return jobs
    .map((job) => {
      const counts = countsByJob.get(job.id) ?? NO_APPLICANTS;
      return {
        jobId: job.id,
        jobTitle: job.title,
        daysOpen: daysOpen(job.createdAt, now),
        owner: job.ownerName?.trim() || "unassigned",
        blocker: computeJobBlocker({
          daysOpen: daysOpen(job.createdAt, now) ?? 0,
          applicants: counts.applicants,
          rubricApproved: job.rubricApproved,
          clearingBar: counts.clearingBar,
          unscored: counts.unscored,
          awaitingReview: counts.awaitingReview,
          overdueScorecards: 0,
          offersAging: 0,
        }),
      };
    })
    .sort((a, b) => {
      // Broken systems before slow humans; within a severity, the oldest job.
      const rank = { critical: 0, warning: 1, ok: 2 } as const;
      const d = rank[a.blocker.severity] - rank[b.blocker.severity];
      if (d !== 0) return d;
      return (b.daysOpen ?? 0) - (a.daysOpen ?? 0);
    });
}

export interface PortfolioSummary {
  openJobs: number;
  /** Null when no job carries a usable open date. */
  medianDaysOpen: number | null;
  rubricCoverage: { withRubric: number; total: number; pct: number | null };
  /** Jobs whose blocker is critical — the number that starts the conversation. */
  blocked: number;
}

export function portfolioSummary(
  jobs: PortfolioJob[],
  rows: PortfolioRow[],
  now: number,
): PortfolioSummary {
  const ages = jobs.map((j) => daysOpen(j.createdAt, now)).filter((d): d is number => d !== null);
  const withRubric = jobs.filter((j) => j.rubricApproved).length;
  return {
    openJobs: jobs.length,
    medianDaysOpen: median(ages),
    rubricCoverage: {
      withRubric,
      total: jobs.length,
      pct: jobs.length === 0 ? null : Math.round((withRubric / jobs.length) * 100),
    },
    blocked: rows.filter((r) => r.blocker.severity === "critical").length,
  };
}
