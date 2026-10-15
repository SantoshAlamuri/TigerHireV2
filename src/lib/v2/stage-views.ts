/**
 * Pipeline tiles on the Job Dashboard, and the lists behind them.
 *
 * The dashboard count and the list you land on are derived from the same
 * definition, so they cannot drift apart — a recruiter clicking "Applied 5"
 * must find exactly five people.
 */
export interface StageView {
  slug: string;
  title: string;
  /** applications.status filter; null means "everything for this job". */
  status: string | null;
  /**
   * Screened is not a status — it is "this person answered the recruiter's
   * questions". No status column records that, so the list is narrowed by the
   * presence of screening answers instead of by a status the schema lacks.
   */
  requiresScreeningAnswers?: boolean;
  emptyLine: string;
}

export const STAGE_VIEWS: readonly StageView[] = [
  {
    slug: "applied",
    title: "Applied",
    status: null,
    emptyLine: "No applications yet — share the apply link or add candidates.",
  },
  {
    slug: "screened",
    title: "Screened",
    status: null,
    requiresScreeningAnswers: true,
    emptyLine: "Nobody has answered screening yet — questions go out over WhatsApp on upload.",
  },
  {
    slug: "review",
    title: "New — to review",
    status: "applied",
    emptyLine: "Nothing waiting. New applications land here as they are scored.",
  },
  {
    slug: "shortlisted",
    title: "Shortlisted",
    status: "shortlisted",
    emptyLine: "Nobody shortlisted yet — advance someone from review.",
  },
  {
    slug: "hired",
    title: "Hired",
    status: "hired",
    emptyLine: "No hires on this job yet.",
  },
] as const;

export function resolveStageView(slug: string): StageView | null {
  return STAGE_VIEWS.find((v) => v.slug === slug) ?? null;
}

export function stageQuery(
  slug: string,
  jobId: string,
): { jobId: string; limit: number; status?: string } | null {
  const view = resolveStageView(slug);
  if (!view) return null;
  return view.status ? { jobId, limit: 100, status: view.status } : { jobId, limit: 100 };
}
