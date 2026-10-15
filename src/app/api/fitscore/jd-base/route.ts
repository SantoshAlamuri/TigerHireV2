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
import {
  jdBaseGenerateSchema,
  jdBaseUpdateSchema,
  scoringWeightsSchema,
  fitThresholdsSchema,
} from "@/lib/validations/fitscore-hybrid";
import {
  FEATURE_FLAG_HYBRID_V2,
  findBestIndiaTemplate,
  generateJdBaseDocument,
  getJdBaseByJobId,
  resolveIndiaTemplateMetadata,
  upsertJdBaseFromTemplate,
  updateJdBaseDocument,
} from "@/lib/fitscore/hybrid";
import { loadJobForHybridPipeline } from "@/lib/fitscore/hybrid/api-access";
import { normalizeWeightsTo100 } from "@/lib/fitscore/hybrid/templates";
import { buildJdText } from "@/lib/fitscore/job-text";
import { ANTHROPIC_CREDIT_ERROR_MESSAGE } from "@/lib/services/anthropic";
import { countPendingJdApprovalForJob } from "@/lib/fitscore/pending-jd-approval";

function serializeJdBase(doc: Awaited<ReturnType<typeof getJdBaseByJobId>>) {
  if (!doc) return null;
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
    version: doc.version ?? 1,
    structuredJd: doc.structuredJd ?? null,
    scoringFoundation: meta.foundation,
    indiaTemplateId: meta.templateId,
    indiaTemplateCategory: meta.templateCategory,
    indiaTemplateRoleTitle: meta.templateRoleTitle,
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return jsonError("Hybrid FitScore v2 is not enabled.", 403);
    }

    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) return jsonError("jobId query parameter required", 400);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const server = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const job = await loadJobForHybridPipeline(server, admin, ctx, jobId);
    if (!job) return jsonError("Job not found or access denied", 404);

    const doc = await getJdBaseByJobId(admin, jobId);
    const pendingScoringCount = await countPendingJdApprovalForJob(admin, jobId);
    return jsonSuccess({
      jdBase: serializeJdBase(doc),
      pendingScoringCount,
      jobTitle: job.title,
      jobDescriptionText: buildJdText(job),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load JD Base document", {
      route: "GET /api/fitscore/jd-base",
    });
  }
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

    const parsedBody = await parseJsonBody(request, "POST /api/fitscore/jd-base");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = jdBaseGenerateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const server = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const job = await loadJobForHybridPipeline(server, admin, ctx, parsed.data.jobId);
    if (!job) return jsonError("Job not found or access denied", 404);

    const jdBlob = `${job.title}\n${buildJdText(job)}`;
    const match = findBestIndiaTemplate(jdBlob);
    const doc = match
      ? await upsertJdBaseFromTemplate(admin, job, match.template)
      : await generateJdBaseDocument(admin, job);
    return jsonSuccess(
      {
        jdBase: serializeJdBase(doc),
        jobTitle: job.title,
        jobDescriptionText: buildJdText(job),
      },
      201,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === ANTHROPIC_CREDIT_ERROR_MESSAGE || /credit balance|Plans & Billing/i.test(msg)) {
      return jsonError(ANTHROPIC_CREDIT_ERROR_MESSAGE, 402);
    }
    return handleApiError(err, "Failed to generate JD Base document", {
      route: "POST /api/fitscore/jd-base",
    });
  }
}

export async function PUT(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return jsonError("Hybrid FitScore v2 is not enabled.", 403);
    }

    const parsedBody = await parseJsonBody(request, "PUT /api/fitscore/jd-base");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = jdBaseUpdateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const server = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const job = await loadJobForHybridPipeline(server, admin, ctx, parsed.data.jobId);
    if (!job) {
      return jsonError("Job not found or access denied", 404);
    }

    const existing = await getJdBaseByJobId(admin, parsed.data.jobId);
    if (!existing) {
      return jsonError("JD Base document not found. POST to create it first.", 404);
    }

    let weights = undefined;
    if (parsed.data.weights) {
      // Replace stored weights with the normalized payload — never merge with the
      // existing document. normalizeWeightsTo100 drops 0-weight keys client-side, so
      // merging would resurrect dimensions the recruiter explicitly zeroed (rescaled),
      // making the approved weights differ from everything shown in the wizard.
      weights = scoringWeightsSchema.parse(normalizeWeightsTo100(parsed.data.weights));
    }

    const fitThresholds = parsed.data.fitThresholds
      ? fitThresholdsSchema.parse(parsed.data.fitThresholds)
      : undefined;

    const doc = await updateJdBaseDocument(admin, parsed.data.jobId, {
      roleTitle: parsed.data.roleTitle,
      company: parsed.data.company,
      context: parsed.data.context,
      weights,
      scoreFloor: parsed.data.scoreFloor,
      fitThresholds,
      extractionAdditions:
        parsed.data.extractionAdditions === undefined ? undefined : parsed.data.extractionAdditions,
      idealCandidateProfile:
        parsed.data.idealCandidateProfile === undefined
          ? undefined
          : parsed.data.idealCandidateProfile,
      structuredJd: parsed.data.structuredJd === undefined ? undefined : parsed.data.structuredJd,
    });

    return jsonSuccess({
      jdBase: serializeJdBase(doc),
      jobTitle: job.title,
      jobDescriptionText: buildJdText(job),
    });
  } catch (err) {
    return handleApiError(err, "Failed to update JD Base document", {
      route: "PUT /api/fitscore/jd-base",
    });
  }
}
