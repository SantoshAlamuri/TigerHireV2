import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { CvStorageBucket } from "@/lib/supabase/resolve-cv-storage";
import { toBrowserFacingStorageUrl } from "@/lib/supabase/storage-public-url";

/**
 * Create a browser-facing signed URL for a CV object.
 * Uses the service-role client because agency/public-apply CVs are stored under
 * `candidate-cvs/cvs/...` where storage RLS keys off candidate UUID folders only.
 * Callers must enforce access via assertCanAccessCandidateResumes first.
 */
export async function createCvStorageSignedUrl(
  bucket: CvStorageBucket,
  path: string,
  expirySec: number,
): Promise<{ url: string; expiresAt: string } | null> {
  const admin = createSupabaseAdmin();
  const { data: signed, error } = await admin.storage.from(bucket).createSignedUrl(path, expirySec);

  if (error || !signed?.signedUrl) {
    logger.warn("cv-signed-url: createSignedUrl failed", {
      bucket,
      path: path.slice(0, 80),
      error: error?.message ?? "no signedUrl",
    });
    return null;
  }

  const url = toBrowserFacingStorageUrl(signed.signedUrl);
  if (!url) return null;

  return {
    url,
    expiresAt: new Date(Date.now() + expirySec * 1000).toISOString(),
  };
}
