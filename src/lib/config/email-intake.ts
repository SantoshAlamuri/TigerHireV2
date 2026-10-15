/**
 * Per-job CV email-intake address.
 *
 * Recruiters point external boards (e.g. Naukri's "email applications" response
 * address) or forward candidate CVs to `jobs+<jobId>@in.tigerhire.io`. The job
 * UUID embedded after the `+` is the routing key: the Resend Inbound webhook →
 * POST /api/intake/email parses it (ADDRESS_JOB_PATTERN) to attach the CV to the
 * right job. Keep this domain in sync with the MX-configured intake domain.
 */
export const EMAIL_INTAKE_DOMAIN = "in.tigerhire.io";

/** The intake address for a given job. Returns null for a missing/blank id. */
export function buildJobIntakeAddress(jobId: string | null | undefined): string | null {
  const id = jobId?.trim();
  if (!id) return null;
  return `jobs+${id}@${EMAIL_INTAKE_DOMAIN}`;
}
