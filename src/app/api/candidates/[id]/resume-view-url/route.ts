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

const SIGNED_URL_EXPIRY_SEC = 900; // 15 min on-demand view

/** Fresh signed URL for the candidate's default/latest resume or legacy cv_url/resume_url. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id: candidateId } = await params;
    const supabase = await createSupabaseServerClient();

    await assertCanAccessCandidateResumes(supabase, ctx, candidateId);

    const { data: versions, error: versionsError } = await supabase
      .from("resume_versions")
      .select("id, file_url, storage_path, is_default, created_at")
      .eq("candidate_id", candidateId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (versionsError) {
      logger.error("resume-view-url: versions query failed", { error: String(versionsError) });
      return jsonError("Failed to resolve CV", 500);
    }

    let resolved = null as ReturnType<typeof resolveCvStorageObject>;
    let versionId: string | null = null;

    const version = versions?.[0] as
      | { id: string; file_url: string; storage_path?: string | null }
      | undefined;
    if (version) {
      versionId = version.id;
      resolved = resolveCvStorageObject({
        fileUrl: version.file_url,
        storagePath: version.storage_path,
      });
    }

    if (!resolved) {
      const { data: candidate, error: candidateError } = await supabase
        .from("candidates")
        .select("resume_url, cv_url")
        .eq("id", candidateId)
        .single();

      if (candidateError || !candidate) {
        return jsonError("Candidate not found", 404);
      }

      const legacyUrl =
        (typeof candidate.resume_url === "string" && candidate.resume_url.trim()) ||
        (typeof candidate.cv_url === "string" && candidate.cv_url.trim()) ||
        "";
      if (!legacyUrl) {
        return jsonError("No CV on file for this candidate", 404);
      }
      resolved = resolveCvStorageObject({ fileUrl: legacyUrl });
    }

    if (!resolved) {
      logger.warn("resume-view-url: could not resolve storage object", {
        candidateId,
        versionId,
      });
      return jsonError("Cannot generate link for this CV", 400);
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
        route: "GET /api/candidates/[id]/resume-view-url",
        version_id: versionId,
        bucket,
      },
    });

    return jsonSuccess({ url, expiresAt, expiresIn: SIGNED_URL_EXPIRY_SEC });
  } catch (err) {
    if (err instanceof NotFoundError) return jsonError(err.message, 404);
    if (err instanceof ForbiddenError) return jsonError(err.message, 403);
    return handleApiError(err, "Failed to get resume link", {
      route: "GET /api/candidates/[id]/resume-view-url",
    });
  }
}
