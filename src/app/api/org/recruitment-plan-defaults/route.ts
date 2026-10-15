import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  handleZodError,
  hasRole,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
} from "@/lib/api-helpers";
import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";
import {
  builtinDefaultPlanStages,
  getOrgDefaultRecruitmentPlanStages,
  orgDefaultPlanStagesSchema,
  saveOrgDefaultRecruitmentPlanStages,
} from "@/lib/recruitment-plan/org-default-plan-stages";
import { validateOrigin } from "@/lib/security/csrf";

const putSchema = z.object({ stages: orgDefaultPlanStagesSchema });

export async function GET() {
  if (!isPlanDocumentNavActive()) return jsonError("Not enabled", 404);

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "hiring_manager")) {
    return jsonError("Forbidden", 403);
  }
  if (!ctx.organisationId) return jsonError("No organisation", 400);

  const admin = createSupabaseAdmin();
  const saved = await getOrgDefaultRecruitmentPlanStages(admin, ctx.organisationId);
  return jsonSuccess({ stages: saved ?? builtinDefaultPlanStages(), isCustom: Boolean(saved) });
}

export async function PUT(request: NextRequest) {
  if (!isPlanDocumentNavActive()) return jsonError("Not enabled", 404);

  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!ctx.isOrgAdmin && ctx.role !== "super_admin") return jsonError("Forbidden", 403);
  if (!ctx.organisationId) return jsonError("No organisation", 400);

  const parsedBody = await parseJsonBody(request, "PUT /api/org/recruitment-plan-defaults");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const parsed = putSchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

  const admin = createSupabaseAdmin();
  const { ok, error } = await saveOrgDefaultRecruitmentPlanStages(
    admin,
    ctx.organisationId,
    parsed.data.stages,
  );
  if (!ok || error) return jsonError(error?.message ?? "Failed to save", 500);

  return jsonSuccess({ stages: parsed.data.stages });
}
