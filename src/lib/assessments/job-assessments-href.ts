/** Job-scoped assessments workspace (Brief 12 plan-first). */
export function buildJobAssessmentsHref(
  jobId: string,
  opts?: { applicationId?: string | null; stageId?: string | null },
): string {
  const params = new URLSearchParams();
  if (opts?.applicationId) params.set("applicationId", opts.applicationId);
  if (opts?.stageId) params.set("stageId", opts.stageId);
  const qs = params.toString();
  return `/recruit/jobs/${encodeURIComponent(jobId)}/assessments${qs ? `?${qs}` : ""}`;
}
