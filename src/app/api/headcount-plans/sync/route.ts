import { z } from "zod";
import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { enqueue } from "@/lib/jobs/queue";
import { upsertApprovedHeadcountPlan } from "@/lib/services/headcount-plan-sync";

const syncLineSchema = z
  .object({
    department: z.string().max(120).optional().nullable(),
    roleLevel: z.string().max(120).optional().nullable(),
    costCenter: z.string().max(120).optional().nullable(),
    locationCity: z.string().max(120).optional().nullable(),
    headcountLimit: z.number().int().min(1).optional(),
    approvedBudgetMin: z.number().nonnegative().optional().nullable(),
    approvedBudgetMax: z.number().nonnegative().optional().nullable(),
    currency: z.string().max(10).optional().nullable(),
  })
  .strict();

const syncSchema = z
  .object({
    planCode: z.string().trim().min(2).max(60),
    title: z.string().trim().min(2).max(200),
    fiscalYear: z.number().int().min(2020).max(2100),
    sourceSystem: z.string().trim().max(100).optional().nullable(),
    sourceRef: z.string().trim().max(120).optional().nullable(),
    lines: z.array(syncLineSchema).min(1).max(1000),
  })
  .strict();

/**
 * POST /api/headcount-plans/sync
 * Accepts a normalized plan payload from a future HRMS connector and persists approved plan data.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!hasRole(ctx, "leadership", "super_admin", "finance")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/headcount-plans/sync");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = syncSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    const payload = parsed.data;

    const queueResult = await enqueue("headcount-plan-sync", {
      organisationId: ctx.organisationId,
      actorProfileId: ctx.userId,
      planCode: payload.planCode,
      title: payload.title,
      fiscalYear: payload.fiscalYear,
      sourceSystem: payload.sourceSystem ?? null,
      sourceRef: payload.sourceRef ?? null,
      lines: payload.lines,
    });

    if (!queueResult.id) {
      const admin = createSupabaseAdmin();
      const synced = await upsertApprovedHeadcountPlan(admin, {
        organisationId: ctx.organisationId,
        actorProfileId: ctx.userId,
        planCode: payload.planCode,
        title: payload.title,
        fiscalYear: payload.fiscalYear,
        sourceSystem: payload.sourceSystem ?? null,
        sourceRef: payload.sourceRef ?? null,
        lines: payload.lines,
      });
      return jsonSuccess({ queued: false, synced });
    }

    return jsonSuccess({ queued: true, runId: queueResult.id });
  } catch (err) {
    return handleApiError(err, "Failed to sync headcount plan", {
      route: "POST /api/headcount-plans/sync",
    });
  }
}
