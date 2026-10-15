import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { z } from "zod";

const setDefaultResumeBodySchema = z.object({}).strict();
const deleteResumeVersionBodySchema = z.object({}).strict();
const RESUME_VERSION_SELECT_COLUMNS = `
  id, candidate_id, file_url, file_name, file_size, storage_path, is_default, label, uploaded_by, created_at
`;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (
      !hasRole(ctx, "candidate_pro", "candidate_free", "super_admin", "recruiter", "leadership")
    ) {
      return jsonError("Forbidden", 403);
    }
    const body = await request.json().catch(() => ({}));
    const bodyParsed = setDefaultResumeBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const { id: candidateId, versionId } = await params;
    const supabase = await createSupabaseServerClient();

    await assertCanAccessCandidateResumes(supabase, ctx, candidateId);

    const admin = createSupabaseAdmin();
    const { data: versionIdResult, error: rpcError } = await admin.rpc("switch_default_resume", {
      p_candidate_id: candidateId,
      p_version_id: versionId,
    });

    if (rpcError || !versionIdResult) {
      logger.error("Failed to set default resume", {
        error: rpcError ? String(rpcError) : "no row updated",
      });
      return jsonError("CV version not found", 404);
    }

    const { data: version } = await supabase
      .from("resume_versions")
      .select(RESUME_VERSION_SELECT_COLUMNS)
      .eq("id", versionIdResult)
      .single();

    return jsonSuccess({
      version: version ?? { id: versionIdResult, is_default: true },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return jsonError(err.message, 404);
    if (err instanceof ForbiddenError) return jsonError(err.message, 403);
    return handleApiError(err, "Failed to set default resume", {
      route: "PATCH /api/candidates/[id]/resumes/[versionId]",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (
      !hasRole(ctx, "candidate_pro", "candidate_free", "super_admin", "recruiter", "leadership")
    ) {
      return jsonError("Forbidden", 403);
    }
    const body = await request.json().catch(() => ({}));
    const bodyParsed = deleteResumeVersionBodySchema.safeParse(body);
    if (!bodyParsed.success) return jsonError("Invalid request body", 400);

    const { id: candidateId, versionId } = await params;
    const supabase = await createSupabaseServerClient();

    await assertCanAccessCandidateResumes(supabase, ctx, candidateId);

    const { data: existing } = await supabase
      .from("resume_versions")
      .select("id, is_default")
      .eq("id", versionId)
      .eq("candidate_id", candidateId)
      .single();

    if (!existing) return jsonError("Resume version not found", 404);
    if (existing.is_default) {
      return jsonError("Cannot delete the default CV. Set another as default first.", 400);
    }

    const { error } = await supabase
      .from("resume_versions")
      .delete()
      .eq("id", versionId)
      .eq("candidate_id", candidateId);

    if (error) {
      logger.error("Failed to delete resume version", { error: String(error) });
      return jsonError("Failed to delete CV version", 500);
    }

    return jsonSuccess({ deleted: true });
  } catch (err) {
    if (err instanceof NotFoundError) return jsonError(err.message, 404);
    if (err instanceof ForbiddenError) return jsonError(err.message, 403);
    return handleApiError(err, "Failed to delete resume version", {
      route: "DELETE /api/candidates/[id]/resumes/[versionId]",
    });
  }
}
