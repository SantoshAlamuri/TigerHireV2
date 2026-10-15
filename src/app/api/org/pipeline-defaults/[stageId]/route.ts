import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";

const orgPipelineDefaultParamsSchema = z.object({
  stageId: z.string().uuid(),
});

type Ctx = { params: Promise<{ stageId: string }> };

/**
 * DELETE /api/org/pipeline-defaults/[stageId]
 */
export async function DELETE(_request: NextRequest, context: Ctx) {
  const csrf = validateOrigin(_request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "super_admin", "leadership")) {
    return jsonError("Forbidden", 403);
  }
  if (!ctx.organisationId) return jsonError("No organisation", 400);

  const paramsParsed = orgPipelineDefaultParamsSchema.safeParse(await context.params);
  if (!paramsParsed.success) return jsonError("Invalid stage id", 400);
  const { stageId } = paramsParsed.data;
  const admin = createSupabaseAdmin();

  const { data: row, error: fetchErr } = await admin
    .from("org_pipeline_stage_defaults")
    .select("id, is_locked")
    .eq("id", stageId)
    .eq("organisation_id", ctx.organisationId)
    .maybeSingle();

  if (fetchErr || !row) return jsonError("Stage not found", 404);
  if (row.is_locked === true) {
    return jsonError("System stages cannot be removed", 403);
  }

  const { error } = await admin
    .from("org_pipeline_stage_defaults")
    .delete()
    .eq("id", stageId)
    .eq("organisation_id", ctx.organisationId);

  if (error) {
    logger.error("Failed to delete org pipeline default", { error: error.message });
    return jsonError("Failed to delete", 500);
  }

  return jsonSuccess({ deleted: true });
}
