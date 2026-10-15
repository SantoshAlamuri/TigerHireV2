import { NextRequest } from "next/server";
import { createCvStorageSignedUrl } from "@/lib/supabase/cv-signed-url";
import { resolveCvStorageObject } from "@/lib/supabase/resolve-cv-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import {
  assertCanAccessCandidateResumes,
  ForbiddenError,
  NotFoundError,
} from "@/lib/security/candidate-resume-access";
import { logger } from "@/lib/observability/logger";
import { writeAccessAuditEvent } from "@/lib/security/access-audit";

const SIGNED_URL_EXPIRY_SEC = 900; // 15 min for on-demand View

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (
      !hasRole(
        ctx,
        "candidate_pro",
        "candidate_free",
        "super_admin",
        "leadership",
        "recruiter",
        "agency",
        "hiring_manager",
      )
    ) {
      return jsonError("Forbidden", 403);
    }

    const { id: candidateId, versionId } = await params;
    const supabase = await createSupabaseServerClient();

    await assertCanAccessCandidateResumes(supabase, ctx, candidateId);

    const { data: row, error } = await supabase
      .from("resume_versions")
      .select("id, file_url, storage_path")
      .eq("id", versionId)
      .eq("candidate_id", candidateId)
      .single();

    if (error || !row) {
      return jsonError("CV version not found", 404);
    }

    let resolved = resolveCvStorageObject({
      fileUrl: (row as { file_url: string }).file_url,
      storagePath: (row as { storage_path?: string | null }).storage_path,
    });

    if (!resolved) {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("resume_url, cv_url")
        .eq("id", candidateId)
        .single();

      const legacyUrl =
        (typeof candidate?.resume_url === "string" && candidate.resume_url.trim()) ||
        (typeof candidate?.cv_url === "string" && candidate.cv_url.trim()) ||
        "";
      if (legacyUrl) {
        resolved = resolveCvStorageObject({ fileUrl: legacyUrl });
      }
    }

    if (!resolved) {
      logger.warn("Signed URL: no path for version", { versionId });
      return jsonError("Cannot generate link for this version", 400);
    }

    const { bucket, path } = resolved;
    const signed = await createCvStorageSignedUrl(bucket, path, SIGNED_URL_EXPIRY_SEC);

    if (!signed) {
      return jsonError("Failed to generate link", 500);
    }

    const { url, expiresAt } = signed;
    await writeAccessAuditEvent({
      userId: ctx.userId,
      candidateId,
      action: "download_cv",
      ipAddress: _request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: _request.headers.get("user-agent"),
      metadata: {
        route: "GET /api/candidates/[id]/resumes/[versionId]/signed-url",
        version_id: versionId,
      },
    });

    return jsonSuccess({ url, expiresAt, expiresIn: SIGNED_URL_EXPIRY_SEC });
  } catch (err) {
    if (err instanceof NotFoundError) return jsonError(err.message, 404);
    if (err instanceof ForbiddenError) return jsonError(err.message, 403);
    return handleApiError(err, "Failed to get resume link", {
      route: "GET /api/candidates/[id]/resumes/[versionId]/signed-url",
    });
  }
}
