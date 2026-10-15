import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { z } from "zod";
import { pipelineStageTypeSchema } from "@/lib/pipeline/stage-types";

const stageSchema = z.object({
  id: z.string().uuid().optional(),
  stage_name: z.string().min(1).max(100),
  stage_order: z.number().int().min(0),
  stage_type: pipelineStageTypeSchema.optional(),
  sla_days: z.number().int().min(0).max(365).nullable().optional(),
  is_locked: z.boolean().optional(),
  notify_candidate: z.boolean().optional(),
  color: z.string().max(32).optional(),
  notify_email_body: z.string().max(8000).nullable().optional(),
  interviewer_email: z.string().email().optional().nullable(),
  interviewer_name: z.string().max(200).optional().nullable(),
});

const upsertSchema = z.object({
  stages: z.array(stageSchema).min(1).max(30),
});

const ORG_PIPELINE_DEFAULT_ALL_COLUMNS =
  "id, organisation_id, stage_name, stage_order, interviewer_email, interviewer_name, created_at, stage_type, sla_days, is_locked, notify_candidate, color, notify_email_body";

/**
 * GET /api/org/pipeline-defaults
 */
export async function GET(_request: NextRequest) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
    return jsonError("Forbidden", 403);
  }
  if (!ctx.organisationId) return jsonError("No organisation", 400);

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("org_pipeline_stage_defaults")
    .select(ORG_PIPELINE_DEFAULT_ALL_COLUMNS)
    .eq("organisation_id", ctx.organisationId)
    .order("stage_order", { ascending: true });

  if (error) {
    logger.error("Failed to fetch org pipeline defaults", { error: error.message });
    return jsonError("Failed to load defaults", 500);
  }

  return jsonSuccess({ stages: data ?? [] });
}

/**
 * POST /api/org/pipeline-defaults
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "super_admin", "leadership", "recruiter")) {
    return jsonError("Forbidden", 403);
  }
  if (!ctx.isOrgAdmin && ctx.role !== "super_admin") {
    return jsonError("Forbidden", 403);
  }
  if (!ctx.organisationId) return jsonError("No organisation", 400);

  const parsedBody = await parseJsonBody(request, "POST /api/org/pipeline-defaults");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const body = parsedBody.body;

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return handleZodError(parsed.error);

  const admin = createSupabaseAdmin();
  const results: Record<string, unknown>[] = [];
  let insertedCount = 0;

  const payloadFields = (stage: z.infer<typeof stageSchema>) => ({
    stage_name: stage.stage_name,
    stage_order: stage.stage_order,
    stage_type: stage.stage_type ?? "screening",
    sla_days: stage.sla_days ?? null,
    is_locked: stage.is_locked ?? false,
    notify_candidate: stage.notify_candidate ?? false,
    color: stage.color ?? "#6366f1",
    notify_email_body: stage.notify_email_body ?? null,
    interviewer_email: stage.interviewer_email ?? null,
    interviewer_name: stage.interviewer_name ?? null,
  });

  for (const stage of parsed.data.stages) {
    if (stage.id) {
      const { data: existing } = await admin
        .from("org_pipeline_stage_defaults")
        .select("is_locked, stage_name, stage_order")
        .eq("id", stage.id)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle();
      // Applied and FitScore Review are pinned to the top. Other system stages (Hired,
      // Rejected, Withdrawn) keep their names but must be free to shift down when a
      // stage is added above them, or nothing could ever be added.
      const pinnedOrder =
        existing?.stage_name === "Applied"
          ? 0
          : existing?.stage_name === "FitScore Review"
            ? 1
            : null;
      if (existing?.is_locked === true) {
        if (
          stage.stage_name !== existing.stage_name ||
          (pinnedOrder !== null && stage.stage_order !== pinnedOrder)
        ) {
          return jsonError("System stages cannot be reordered or renamed", 403);
        }
      }

      const patch =
        existing?.is_locked === true
          ? {
              // Only touch what was sent, so moving a stage never wipes its email or interviewer.
              ...(stage.interviewer_email !== undefined
                ? { interviewer_email: stage.interviewer_email }
                : {}),
              ...(stage.interviewer_name !== undefined
                ? { interviewer_name: stage.interviewer_name }
                : {}),
              ...(stage.notify_email_body !== undefined
                ? { notify_email_body: stage.notify_email_body }
                : {}),
              ...(pinnedOrder === null ? { stage_order: stage.stage_order } : {}),
            }
          : payloadFields(stage);

      const { data, error } = await admin
        .from("org_pipeline_stage_defaults")
        .update(patch)
        .eq("id", stage.id)
        .eq("organisation_id", ctx.organisationId)
        .select(ORG_PIPELINE_DEFAULT_ALL_COLUMNS)
        .single();

      if (error) {
        logger.error("Failed to update pipeline default", {
          error: error.message,
          stageId: stage.id,
        });
        continue;
      }
      if (data) results.push(data);
    } else {
      const { data, error } = await admin
        .from("org_pipeline_stage_defaults")
        .insert({
          organisation_id: ctx.organisationId,
          ...payloadFields(stage),
        })
        .select(ORG_PIPELINE_DEFAULT_ALL_COLUMNS)
        .single();

      if (error) {
        logger.error("Failed to insert pipeline default", { error: error.message });
        continue;
      }
      if (data) {
        results.push(data);
        insertedCount += 1;
      }
    }
  }

  return jsonSuccess({ stages: results }, insertedCount > 0 ? 201 : 200);
}

/**
 * DELETE /api/org/pipeline-defaults (legacy body: { stageId })
 */
export async function DELETE(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "super_admin", "leadership")) {
    return jsonError("Forbidden", 403);
  }
  if (!ctx.organisationId) return jsonError("No organisation", 400);

  const parsedBody = await parseJsonBody(request, "DELETE /api/org/pipeline-defaults");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const body = parsedBody.body;

  const parsed = z.object({ stageId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return handleZodError(parsed.error);

  const admin = createSupabaseAdmin();
  const { data: row } = await admin
    .from("org_pipeline_stage_defaults")
    .select("is_locked")
    .eq("id", parsed.data.stageId)
    .eq("organisation_id", ctx.organisationId)
    .maybeSingle();
  if (!row) return jsonError("Stage not found", 404);
  if (row.is_locked === true) return jsonError("System stages cannot be removed", 403);

  const { error } = await admin
    .from("org_pipeline_stage_defaults")
    .delete()
    .eq("id", parsed.data.stageId)
    .eq("organisation_id", ctx.organisationId);

  if (error) {
    logger.error("Failed to delete pipeline default", { error: error.message });
    return jsonError("Failed to delete", 500);
  }

  return jsonSuccess({ deleted: true });
}
