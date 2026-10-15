import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { isEnabled } from "@/lib/feature-flags";
import { jdBaseFromTemplateSchema } from "@/lib/validations/fitscore-hybrid";
import {
  FEATURE_FLAG_HYBRID_V2,
  getIndiaJdTemplateById,
  getJdBaseByJobId,
  resolveIndiaTemplateMetadata,
  upsertJdBaseFromTemplate,
} from "@/lib/fitscore/hybrid";
import { loadJobForHybridPipeline } from "@/lib/fitscore/hybrid/api-access";

function serializeJdBase(doc: NonNullable<Awaited<ReturnType<typeof getJdBaseByJobId>>>) {
  const meta = resolveIndiaTemplateMetadata(doc.extractionAdditions);
  return {
    id: doc.id,
    jobId: doc.jobId,
    roleTitle: doc.roleTitle,
    company: doc.company,
    context: doc.context,
    weights: doc.weights,
    scoreFloor: doc.scoreFloor,
    fitThresholds: doc.fitThresholds,
    extractionAdditions: doc.extractionAdditions ?? null,
    idealCandidateProfile: doc.idealCandidateProfile ?? null,
    approvedBy: doc.approvedBy ?? null,
    approvedAt: doc.approvedAt ?? null,
    scoringFoundation: meta.foundation,
    indiaTemplateId: meta.templateId,
    indiaTemplateCategory: meta.templateCategory,
    indiaTemplateRoleTitle: meta.templateRoleTitle,
  };
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return jsonError("Hybrid FitScore v2 is not enabled.", 403);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/fitscore/jd-base/from-template");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = jdBaseFromTemplateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const server = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const job = await loadJobForHybridPipeline(server, admin, ctx, parsed.data.jobId);
    if (!job) return jsonError("Job not found or access denied", 404);

    const template = getIndiaJdTemplateById(parsed.data.templateId);
    if (!template) {
      return jsonError("Unknown template id.", 400);
    }

    const doc = await upsertJdBaseFromTemplate(admin, job, template);
    return jsonSuccess({ jdBase: serializeJdBase(doc) });
  } catch (err) {
    return handleApiError(err, "Failed to apply JD template", {
      route: "POST /api/fitscore/jd-base/from-template",
    });
  }
}
