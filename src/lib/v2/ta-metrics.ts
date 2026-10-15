/**
 * The standard talent-acquisition metric set.
 *
 * One rule governs this file: a metric that cannot be computed returns null
 * with a reason, never a number. On preview today there are zero hires, zero
 * offers and zero screening sessions — a dashboard that answers "0 days" or
 * "100%" in that situation is not empty, it is wrong, and wrong numbers on a
 * hiring dashboard get believed and acted on.
 *
 * Medians rather than means throughout, so one 400-day outlier cannot flatter
 * or wreck a number that a hiring plan depends on.
 */
export interface MetricApplication {
  status: string;
  createdAt: string | null;
  hiredAt: string | null;
  /** When the job opened — the other clock in time-to-fill. */
  jobCreatedAt: string | null;
  source: string | null;
}

export interface MetricOffer {
  signedAt: string | null;
  declinedAt: string | null;
}

export interface MetricInput {
  applications: MetricApplication[];
  offers: MetricOffer[];
  openJobs: number;
  recruiters: number;
  /** Applications where the candidate answered screening. */
  screeningAnswered: number;
  /** Screening messages sent, for reply rate. */
  screeningSent: number;
  /** Total recruiting spend in the period, if known. */
  spend: number | null;
  /** 90-day pulse responses: retained, plus manager ratings out of 5. */
  retained: number | null;
  hmRatings: number[];
}

export interface Metric {
  label: string;
  value: number | null;
  unit: string;
  note: string;
  tone: "good" | "warn" | "plain";
}

const DAY = 86_400_000;

/** Days between two instants, or null if either is unusable or reversed. */
function days(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / DAY);
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((p, q) => p - q);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

export interface TalentMetrics {
  costPerHire: Metric;
  candidateReplyRate: Metric;
  retention90: Metric;
  hmSatisfaction: Metric;
  fitScoreValidity: Metric;
  timeToFill: Metric;
  timeToHire: Metric;
  offerAcceptance: Metric;
  fillRate: Metric;
  screenedAutomatically: Metric;
  reqsPerRecruiter: Metric;
  qualityOfHire: Metric;
}

export function talentMetrics(input: MetricInput): TalentMetrics {
  const hires = input.applications.filter((a) => a.status === "hired" || a.hiredAt);

  // Two different clocks: how long the ROLE was open, versus how long the
  // PERSON waited. A fast time-to-hire can sit inside a slow time-to-fill.
  const fillDays = hires
    .map((h) => days(h.jobCreatedAt, h.hiredAt))
    .filter((d): d is number => d !== null);
  const hireDays = hires
    .map((h) => days(h.createdAt, h.hiredAt))
    .filter((d): d is number => d !== null);

  const decidedOffers = input.offers.filter((o) => o.signedAt || o.declinedAt);
  const signed = decidedOffers.filter((o) => o.signedAt).length;

  const reqsPer =
    input.recruiters > 0 ? Math.round((input.openJobs / input.recruiters) * 10) / 10 : null;

  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

  return {
    costPerHire: {
      label: "Cost per hire",
      // Spend with no hires is not a cost per hire, it is just spend.
      value:
        input.spend !== null && hires.length > 0 ? Math.round(input.spend / hires.length) : null,
      unit: "",
      note:
        input.spend === null
          ? "Spend not tracked yet"
          : hires.length
            ? `across ${hires.length} hire${hires.length === 1 ? "" : "s"}`
            : "No hires yet — nothing to divide by",
      tone: "plain",
    },
    candidateReplyRate: {
      label: "Candidate reply rate",
      value: pct(input.screeningAnswered, input.screeningSent),
      unit: "%",
      note: input.screeningSent
        ? `${input.screeningAnswered} of ${input.screeningSent} replied`
        : "No screening messages sent yet",
      tone: "plain",
    },
    retention90: {
      label: "90-day retention",
      value: input.retained !== null && hires.length > 0 ? pct(input.retained, hires.length) : null,
      unit: "%",
      note:
        input.retained === null
          ? "No 90-day pulse data yet"
          : `${input.retained} of ${hires.length} still here`,
      tone: "plain",
    },
    hmSatisfaction: {
      label: "HM satisfaction",
      value: avg(input.hmRatings),
      unit: "/5",
      note: input.hmRatings.length
        ? `${input.hmRatings.length} responses`
        : "No post-hire survey responses yet",
      tone: "plain",
    },
    fitScoreValidity: {
      label: "FitScore validity",
      // A correlation needs paired score/outcome data across enough hires to
      // mean anything; below that it is noise dressed as evidence.
      value: null,
      unit: "",
      note:
        hires.length >= 10
          ? "Needs 90-day outcomes paired to scores"
          : `Needs at least 10 hires — ${hires.length} so far`,
      tone: "plain",
    },
    timeToFill: {
      label: "Time to fill",
      value: median(fillDays),
      unit: "days",
      note: fillDays.length
        ? `median across ${fillDays.length} hire${fillDays.length === 1 ? "" : "s"}`
        : hires.length
          ? "Job open dates missing — cannot measure the req clock"
          : "No hires yet — nothing to measure",
      tone: "plain",
    },
    timeToHire: {
      label: "Time to hire",
      value: median(hireDays),
      unit: "days",
      note: hireDays.length
        ? `application to accept, median of ${hireDays.length}`
        : "No hires yet — nothing to measure",
      tone: "plain",
    },
    offerAcceptance: {
      label: "Offer acceptance",
      value: pct(signed, decidedOffers.length),
      unit: "%",
      note: decidedOffers.length
        ? `${decidedOffers.length} decided`
        : "No offers decided yet — nothing to measure",
      tone: "plain",
    },
    fillRate: {
      label: "Fill rate",
      value: pct(hires.length, input.openJobs),
      unit: "%",
      note: input.openJobs ? `${hires.length} of ${input.openJobs} open roles` : "No open roles",
      tone: "plain",
    },
    screenedAutomatically: {
      label: "Screened automatically",
      value: pct(input.screeningAnswered, input.applications.length),
      unit: "%",
      // "loaded applications" was an accurate description of a broken input:
      // the page handed this function whatever 100 rows its first page returned
      // and the percentage was computed over those. The caller now passes every
      // application in the period, so this is a rate over the organisation.
      note: input.applications.length
        ? `${input.screeningAnswered} of ${input.applications.length} applications answered screening`
        : "No applications yet",
      tone: "plain",
    },
    reqsPerRecruiter: {
      label: "Reqs per recruiter",
      value: reqsPer,
      unit: "",
      note: input.recruiters
        ? `${input.openJobs} open across ${input.recruiters} recruiter${input.recruiters === 1 ? "" : "s"}`
        : "No recruiters on the team",
      // Beyond roughly seven open roles a desk stops giving each one attention.
      tone: reqsPer !== null && reqsPer > 7 ? "warn" : "plain",
    },
    qualityOfHire: {
      label: "Quality of hire",
      value: null,
      unit: "/10",
      note: hires.length ? "Needs 90-day pulse responses" : "No hires yet — nothing to measure",
      tone: "plain",
    },
  };
}
