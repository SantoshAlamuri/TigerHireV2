import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getJdBaseByJobId, updateJdBaseDocument } from "@/lib/fitscore/hybrid";
import {
  fitThresholdsSchema,
  jdBaseUpdateSchema,
  scoringWeightsSchema,
} from "@/lib/validations/fitscore-hybrid";
import { normalizeWeightsTo100 } from "@/lib/fitscore/hybrid/templates";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_HYBRID_V2 } from "@/lib/fitscore/hybrid/constants";
import { requireTryoutAuth } from "@/lib/tryout/auth";
import { loadTryoutJob } from "@/lib/tryout/jd-base";
import { serializeTryoutJdBase } from "@/lib/tryout/serialize";
import {
  tryoutCsrfGuard,
  tryoutError,
  tryoutJson,
  tryoutPreflight,
} from "@/lib/tryout/route-helpers";

export async function OPTIONS(request: NextRequest) {
  return tryoutPreflight(request) ?? tryoutJson(request, {}, 204);
}

export async function PUT(request: NextRequest) {
  const preflight = tryoutPreflight(request);
  if (preflight) return preflight;
  const csrf = tryoutCsrfGuard(request);
  if (csrf) return csrf;

  try {
    const { ctx, error } = await requireTryoutAuth(request);
    if (error || !ctx) return error!;

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return tryoutError(request, "Hybrid FitScore v2 is not enabled for the tryout org.", 403);
    }

    const body = await request.json().catch(() => null);
    const parsed = jdBaseUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((e) => e.message).join("; ");
      return tryoutError(request, messages, 422);
    }

    const admin = createSupabaseAdmin();
    const job = await loadTryoutJob(admin, parsed.data.jobId, ctx.organisationId!);
    if (!job) return tryoutError(request, "Job not found", 404);

    const existing = await getJdBaseByJobId(admin, parsed.data.jobId);
    if (!existing) return tryoutError(request, "JD Base not found. Generate one first.", 404);

    let weights = undefined;
    if (parsed.data.weights) {
      weights = scoringWeightsSchema.parse(
        normalizeWeightsTo100({ ...existing.weights, ...parsed.data.weights }),
      );
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
    });

    return tryoutJson(request, serializeTryoutJdBase(doc, job));
  } catch (err) {
    return tryoutError(
      request,
      err instanceof Error ? err.message : "Failed to update JD Base",
      502,
    );
  }
}
