import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateOrigin } from "@/lib/security/csrf";
import { copyJobSetup } from "@/lib/jobs/copy-job";

const ALLOWED_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * POST /api/jobs/[id]/copy
 * Duplicate a job's setup into a new DRAFT job in the same org (JD Base, pipeline stages,
 * screening questions). Candidates/applications are not copied. Returns the new job id.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ALLOWED_ROLES)) return jsonError("Forbidden", 403);

    const { id: sourceJobId } = await params;

    // RLS-gated read: confirms the caller may access this job (their org) before we copy it.
    const supabase = await createSupabaseServerClient();
    const { data: src, error } = await supabase
      .from("jobs")
      .select("id, organisation_id")
      .eq("id", sourceJobId)
      .single();
    if (error || !src) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const { jobId } = await copyJobSetup(admin, {
      sourceJobId,
      organisationId: src.organisation_id as string,
      createdBy: ctx!.userId,
    });

    return jsonSuccess({ jobId }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to copy job", { route: "POST /api/jobs/[id]/copy" });
  }
}
