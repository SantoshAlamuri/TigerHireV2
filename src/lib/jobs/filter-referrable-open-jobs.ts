/** Job row fields used to hide internal-only (IJP) roles from employee referral pickers. */
export type JobReferralVisibilityRow = {
  list_on_public_job_board?: boolean | null;
  list_for_internal_referrals?: boolean | null;
};

/** Matches /api/refer/jobs/open — internal-only IJP roles are not shareable via referral links. */
export function isReferrableOpenJob(row: JobReferralVisibilityRow): boolean {
  const pub = row.list_on_public_job_board !== false;
  const intr = row.list_for_internal_referrals !== false;
  return !(intr && !pub);
}

export function filterReferrableOpenJobs<T extends JobReferralVisibilityRow>(rows: T[]): T[] {
  return rows.filter(isReferrableOpenJob);
}
