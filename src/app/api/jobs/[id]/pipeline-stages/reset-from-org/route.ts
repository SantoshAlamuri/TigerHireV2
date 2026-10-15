import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resetJobPipelineStagesFromOrg } from "@/lib/pipeline/reset-job-stages-from-org";
import { logger } from "@/lib/observability/logger";
import {
  enrichPipelineStagesWithInterviewers,
  type PipelineStageRowBase,
} from "@/lib/pipeline/enrich-pipeline-stages-response";
import { fetchStagesWithCompat } from "@/lib/pipeline/fetch-stages-with-compat";

const ROLES = ["super_admin", "leadership", "recruiter", "agency", "hiring_manager"] as const;

const resetFromOrgParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * POST /api/jobs/[id]/pipeline-stages/reset-from-org
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ROLES)) return jsonError("Forbidden", 403);

    const paramsParsed = resetFromOrgParamsSchema.safeParse(await params);
    if (!paramsParsed.success) return jsonError("Invalid job id", 400);
    const { id: jobId } = paramsParsed.data;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const organisationId = job.organisation_id as string;
    const admin = createSupabaseAdmin();
    await resetJobPipelineStagesFromOrg(admin, organisationId, jobId);

    const { rows: stages, error } = await fetchStagesWithCompat(admin, jobId);

    if (error) {
      logger.error("reset-from-org: refetch failed", { error: error.message });
      return jsonError("Failed to load stages", 500);
    }

    const enriched = await enrichPipelineStagesWithInterviewers(
      admin,
      (stages ?? []) as PipelineStageRowBase[],
    );

    return jsonSuccess({ stages: enriched });
  } catch (err) {
    return handleApiError(err, "Failed to reset pipeline stages", {
      route: "POST /api/jobs/[id]/pipeline-stages/reset-from-org",
    });
  }
}
