import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/**
 * When a job is closed, invalidate all shareable tokens for that job.
 * Idempotent: safe to run multiple times.
 */
export async function expireReferralLinksForJob(jobId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("referral_links")
    .update({ expires_at: nowIso })
    .eq("job_id", jobId);

  if (error) {
    logger.warn("expireReferralLinksForJob: update failed", { jobId, message: error.message });
  }
}
