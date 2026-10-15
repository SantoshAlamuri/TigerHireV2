/**
 * What each seat can see and change.
 *
 * Seats are hats, not headcount: in a one-person HR company the same login is
 * recruiter and head of talent, and the rail simply shows the union. What
 * varies is never which URLs exist — it is what you control.
 *
 * The rule applied throughout: show a seat what it controls, and let it edit
 * only that. A recruiter should see whether WhatsApp is up, because a dead
 * channel silently stops their screening; rotating the key is not their job.
 */
export type Seat = "recruiter" | "leadership" | "super_admin" | "hiring_manager" | "agency";

export interface Capabilities {
  viewJobs: boolean;
  editJobSetup: boolean;
  reviewApplications: boolean;
  viewAllCandidates: boolean;
  viewOwnSubmissions: boolean;
  submitCandidates: boolean;
  submitFeedback: boolean;
  viewAnalytics: boolean;
  viewIntegrations: boolean;
  editIntegrations: boolean;
  /**
   * The portfolio and the sign-off queue: every job, its blocker, its owner,
   * and the rubrics waiting on a signature. This is the Head of Talent hat —
   * in a one-person HR company the same login wears it alongside recruiter,
   * which is why it is a capability and not a role.
   */
  viewPortfolio: boolean;
  approveRubrics: boolean;
}

const NONE: Capabilities = {
  viewJobs: false,
  editJobSetup: false,
  reviewApplications: false,
  viewAllCandidates: false,
  viewOwnSubmissions: false,
  submitCandidates: false,
  submitFeedback: false,
  viewAnalytics: false,
  viewIntegrations: false,
  editIntegrations: false,
  viewPortfolio: false,
  approveRubrics: false,
};

const RECRUITER: Capabilities = {
  ...NONE,
  viewJobs: true,
  editJobSetup: true,
  reviewApplications: true,
  viewAllCandidates: true,
  submitCandidates: true,
  submitFeedback: true,
  viewAnalytics: true,
  viewIntegrations: true,
  // Org-level credentials belong to whoever owns the account, not the desk.
  editIntegrations: false,
  // A recruiter reads the portfolio — it is their own work rolled up — but
  // signing off on the bar they built is not a review, it is a rubber stamp.
  viewPortfolio: true,
  approveRubrics: false,
};

const TABLE: Record<Seat, Capabilities> = {
  recruiter: RECRUITER,
  leadership: { ...RECRUITER, editIntegrations: true, approveRubrics: true },
  super_admin: { ...RECRUITER, editIntegrations: true, approveRubrics: true },
  hiring_manager: {
    ...NONE,
    viewJobs: true,
    submitFeedback: true,
  },
  agency: {
    ...NONE,
    viewJobs: true,
    submitCandidates: true,
    viewOwnSubmissions: true,
  },
};

export function capabilitiesFor(seat: Seat | string | null | undefined): Capabilities {
  if (!seat || !(seat in TABLE)) return NONE;
  return TABLE[seat as Seat];
}

/**
 * There is no `navFor` here any more, and that is the point.
 *
 * It built a second navigation rail for /recruit/v2 — its own Jobs, Candidates
 * and Analytics links, rendered one row below the top nav's Jobs, Candidates
 * and Analytics tabs. Two navs on one screen, three of six links duplicated,
 * and no highlighted tab telling you which one you were reading.
 *
 * The rail is deleted. Portfolio, Governance and Hiring setup — the only
 * destinations it alone carried — are entries in `lib/navigation/registry.ts`,
 * and their `visibleTo` predicates call `capabilitiesFor` below. So this table
 * still decides who is offered what; it just no longer draws its own nav to do
 * it.
 */
export type EditableArea = "jobSetup" | "integrations";

export function canEdit(seat: Seat | string | null | undefined, area: EditableArea): boolean {
  const c = capabilitiesFor(seat);
  return area === "jobSetup" ? c.editJobSetup : c.editIntegrations;
}
