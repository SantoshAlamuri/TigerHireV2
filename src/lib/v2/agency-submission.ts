/**
 * One agency submission, as its agency is allowed to see it.
 *
 * Bounded transparency: enough truth that the partner never needs to email
 * "any update?", and hard walls around competitive information. The boundary is
 * stated on the page rather than discovered through an awkward call, and it is
 * enforced here rather than by remembering not to render a field.
 *
 * What is never returned, at any status: the candidate's score, how they
 * compare to anyone else, internal notes, and any trace of other agencies'
 * submissions. A close reason is returned only at category level — "compensation
 * fit", never "asked ₹40L against a ₹28–34L band", which would leak the band.
 */
export interface SubmissionInput {
  status: string;
  submittedAt: string | null;
  screeningAnsweredAt: string | null;
  scoredAt: string | null;
  interviewAt: string | null;
  rejectionReason: string | null;
}

export type StepState = "done" | "current" | "pending";

export interface SubmissionStep {
  label: string;
  detail: string;
  state: StepState;
}

/** Ownership runs 30 days from a clean submission. */
export const OWNERSHIP_DAYS = 30;

export function ownershipUntil(submittedAt: string | null): string | null {
  if (!submittedAt) return null;
  const t = Date.parse(submittedAt);
  if (Number.isNaN(t)) return null;
  return new Date(t + OWNERSHIP_DAYS * 86_400_000).toISOString();
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * The timeline, where a missing timestamp means "not yet" rather than "never".
 *
 * A step whose predecessor is done but which has not happened is the CURRENT
 * step — that is the one the agency can act on, and marking it merely pending
 * would hide the fact that a candidate is sitting unanswered on WhatsApp.
 */
export function submissionSteps(input: SubmissionInput): SubmissionStep[] {
  const closed = input.status === "rejected";
  const marks: Array<{ label: string; at: string | null; pendingDetail: string }> = [
    {
      label: "Submitted",
      at: input.submittedAt,
      pendingDetail: "not yet received",
    },
    {
      label: "Screening answered",
      at: input.screeningAnsweredAt,
      pendingDetail: "waiting on the candidate — yours to chase",
    },
    {
      label: "Scored & queued",
      at: input.scoredAt,
      pendingDetail: "held until screening is answered",
    },
    {
      label: "Interview",
      at: input.interviewAt,
      pendingDetail: "not scheduled",
    },
  ];

  const steps: SubmissionStep[] = [];
  let currentTaken = false;
  for (const m of marks) {
    if (m.at) {
      steps.push({ label: m.label, detail: shortDate(m.at) ?? "done", state: "done" });
      continue;
    }
    if (!currentTaken && !closed) {
      currentTaken = true;
      steps.push({ label: m.label, detail: m.pendingDetail, state: "current" });
      continue;
    }
    steps.push({ label: m.label, detail: m.pendingDetail, state: "pending" });
  }

  if (closed) {
    steps.push({
      label: "Closed",
      // Category only. The detail behind it is the client's business.
      detail: input.rejectionReason
        ? `reason: ${input.rejectionReason}`
        : "closed without a recorded reason",
      state: "done",
    });
  }
  return steps;
}

export interface VisibilityRule {
  allowed: boolean;
  text: string;
  when: string;
}

/** Printed on the page, so the boundary is known rather than discovered. */
export const VISIBILITY: VisibilityRule[] = [
  { allowed: true, text: "Their status, stage and timing", when: "always" },
  { allowed: true, text: "Close reasons, at category level", when: "always" },
  {
    allowed: false,
    text: "Their score, how they compare, internal notes, other agencies' submissions",
    when: "never",
  },
];
