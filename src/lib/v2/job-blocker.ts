/**
 * Blocker computation for the v2 Jobs list.
 *
 * The point of the Jobs list is that a recruiter or Head of Talent reads twelve
 * jobs in ten seconds and knows what is wrong with each. So the blocker is
 * derived from data, never a status someone typed and forgot to update.
 *
 * Ordering is deliberate — a broken system outranks a slow human, and an aging
 * offer outranks a queue, because offers expire and queues do not.
 */
export interface JobBlockerInput {
  daysOpen: number;
  applicants: number;
  /** Role-specific rubric approved — without it, scoring falls back to the generic path. */
  rubricApproved: boolean;
  /** How many scored applicants meet the rubric threshold. */
  clearingBar: number;
  /** Applicants with no active score — silent drops were a real production bug. */
  unscored: number;
  awaitingReview: number;
  overdueScorecards: number;
  /** Offers sent and neither signed nor declined past the nudge window. */
  offersAging: number;
}

export type BlockerSeverity = "critical" | "warning" | "ok";

export interface JobBlocker {
  severity: BlockerSeverity;
  label: string;
  detail: string;
  /** Sub-path under the job to fix it, or null when nothing to fix. */
  actionHref: "scoring" | "applications" | "interviews" | "offers" | null;
}

/** Below this, "nobody clears the bar" is noise rather than signal. */
const MIN_APPLICANTS_FOR_CLEAR_RATE = 10;

/** India median time-to-fill is ~45 days; past that a job is aging regardless. */
const AGING_DAYS = 45;

export function computeJobBlocker(input: JobBlockerInput): JobBlocker {
  const {
    daysOpen,
    applicants,
    rubricApproved,
    clearingBar,
    unscored,
    awaitingReview,
    overdueScorecards,
    offersAging,
  } = input;

  // 1. The system is broken: scoring cannot be trusted at all.
  if (!rubricApproved) {
    return {
      severity: "critical",
      label: "No rubric approved — generic scoring",
      detail: applicants
        ? `${applicants} applicants scored on the generic path`
        : "Approve the rubric before applicants arrive",
      actionHref: "scoring",
    };
  }

  // 2. The bar itself is wrong, or sourcing is aimed at the wrong people.
  if (applicants >= MIN_APPLICANTS_FOR_CLEAR_RATE && clearingBar === 0) {
    return {
      severity: "critical",
      label: "Nobody clears the bar",
      detail: `${applicants} scored, none above threshold — recalibrate or re-source`,
      actionHref: "scoring",
    };
  }

  // 3. Candidates exist that the system has not scored. Never hide this.
  if (unscored > 0) {
    return {
      severity: "warning",
      label: "Uploaded but not scored",
      detail: `${unscored} waiting to be scored`,
      actionHref: "applications",
    };
  }

  // 4. An offer is out and decaying — the most expensive thing to lose.
  if (offersAging > 0) {
    return {
      severity: "warning",
      label: "Offer aging",
      detail: `${offersAging} offer${offersAging === 1 ? "" : "s"} out with no response`,
      actionHref: "offers",
    };
  }

  // 5. A named human is the bottleneck.
  if (overdueScorecards > 0) {
    return {
      severity: "warning",
      label: "Interview feedback overdue",
      detail: `${overdueScorecards} scorecard${overdueScorecards === 1 ? "" : "s"} not filed`,
      actionHref: "interviews",
    };
  }

  // 6. Work is queued for the recruiter.
  if (awaitingReview > 0) {
    return {
      severity: "warning",
      label: "Applications to review",
      detail: `${awaitingReview} waiting`,
      actionHref: "applications",
    };
  }

  // 7. Nothing specific is wrong, but the clock is the problem.
  if (daysOpen > AGING_DAYS) {
    return {
      severity: "warning",
      label: "Aging — past 45 days",
      detail: `${daysOpen} days open, no active blocker`,
      actionHref: null,
    };
  }

  return { severity: "ok", label: "On track", detail: `${daysOpen} days open`, actionHref: null };
}
