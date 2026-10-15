/**
 * Per-job diagnosis for the By-job view.
 *
 * Split out of analytics-fusion so each file stays readable; the reasoning about
 * why a diagnosis must name a CATEGORY rather than just a severity lives with
 * the code that decides it.
 */
import type { PipelineRow, TimeToHireRow } from "./analytics-fusion";

/**
 * Which disease this job has.
 *
 * The three are treated differently and confusing them wastes weeks: "the bar"
 * means the rubric rejects everyone and needs recalibrating, "sourcing" means
 * too few people are arriving, "process" means good candidates are stuck waiting
 * on a human. A single "needs attention" chip would send a recruiter to source
 * more applicants for a job whose rubric is the problem.
 */
export type Ailment =
  | "healthy"
  | "bar"
  | "sourcing"
  | "process"
  | "offer-risk"
  | "unusable"
  | "new";

export interface Diagnosis {
  ailment: Ailment;
  /** Category then cause, e.g. "the bar — nobody clears it". */
  text: string;
  tone: "good" | "warn" | "bad" | "mute";
}

export interface FusedJob {
  jobId: string;
  jobTitle: string;
  daysOpen: number | null;
  applicants: number;
  reviewed: number;
  shortlisted: number;
  hired: number;
  applyToInterview: number | null;
  avgDaysToHire: number | null;
  /** Share of scored applicants clearing the rubric bar, if scores are known. */
  clearRate: number | null;
  diagnosis: Diagnosis;
}

function diagnose(
  applicants: number,
  reviewed: number,
  shortlisted: number,
  daysOpen: number | null,
  hasRubric: boolean | null,
): Diagnosis {
  // Without an approved rubric the other numbers are not wrong, they are
  // meaningless — scoring fell back to generic. Saying so beats diagnosing a
  // pipeline from numbers that measured nothing.
  if (hasRubric === false)
    return { ailment: "unusable", text: "no rubric — data unusable until approved", tone: "bad" };
  if (daysOpen !== null && daysOpen < 7)
    return { ailment: "new", text: "too new to judge", tone: "mute" };
  if (applicants === 0)
    return { ailment: "sourcing", text: "sourcing — nothing has arrived yet", tone: "bad" };
  if (applicants < 10)
    return { ailment: "sourcing", text: "sourcing — too few to choose from", tone: "warn" };
  if (reviewed === 0)
    return { ailment: "process", text: "process — nobody has reviewed them", tone: "bad" };
  if (shortlisted === 0)
    return {
      ailment: "bar",
      text: "the bar — nobody clears it; recalibrate or re-source",
      tone: "bad",
    };
  if (shortlisted / applicants < 0.05)
    return { ailment: "bar", text: "the bar — almost everyone rejected", tone: "warn" };
  if (daysOpen !== null && daysOpen > 60)
    return {
      ailment: "process",
      text: "process — open over 60 days, not converting",
      tone: "warn",
    };
  return { ailment: "healthy", text: "healthy", tone: "good" };
}

export function fuseJobTable(
  pipeline: PipelineRow[],
  timeToHire: TimeToHireRow[],
  daysOpenByJob: Record<string, number>,
  clearRateByJob: Record<string, number> = {},
  rubricByJob: Record<string, boolean> = {},
): FusedJob[] {
  const tth = new Map(timeToHire.filter((r) => r.job_id).map((r) => [r.job_id as string, r]));
  return pipeline
    .filter((p) => p.job_id)
    .map((p) => {
      const jobId = p.job_id as string;
      const applicants = p.total_applications ?? 0;
      const reviewed = p.viewed ?? 0;
      const shortlisted = p.shortlisted ?? 0;
      const daysOpen = daysOpenByJob[jobId] ?? null;
      const t = tth.get(jobId);
      return {
        jobId,
        jobTitle: p.job_title ?? "Untitled role",
        daysOpen,
        applicants,
        reviewed,
        shortlisted,
        hired: p.hired ?? 0,
        applyToInterview: applicants > 0 ? Math.round((shortlisted / applicants) * 100) : null,
        avgDaysToHire: (t?.hired_count ?? 0) > 0 ? (t?.avg_days_to_hire ?? null) : null,
        clearRate: clearRateByJob[jobId] ?? null,
        diagnosis: diagnose(
          applicants,
          reviewed,
          shortlisted,
          daysOpen,
          rubricByJob[jobId] ?? null,
        ),
      };
    })
    .sort((a, b) => b.applicants - a.applicants);
}
