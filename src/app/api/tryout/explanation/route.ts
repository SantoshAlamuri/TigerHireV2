export const maxDuration = 120;

import { NextRequest } from "next/server";
import { z } from "zod";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_HYBRID_V2 } from "@/lib/fitscore/hybrid/constants";
import { requireTryoutAuth } from "@/lib/tryout/auth";
import { generateTryoutExplanation } from "@/lib/tryout/explanation";
import {
  tryoutCsrfGuard,
  tryoutError,
  tryoutJson,
  tryoutPreflight,
} from "@/lib/tryout/route-helpers";

const explanationSchema = z.object({
  jobId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

export async function OPTIONS(request: NextRequest) {
  return tryoutPreflight(request) ?? tryoutJson(request, {}, 204);
}

export async function POST(request: NextRequest) {
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
    const parsed = explanationSchema.safeParse(body);
    if (!parsed.success) {
      return tryoutError(request, "jobId and candidateId (UUIDs) are required", 422);
    }

    const result = await generateTryoutExplanation(parsed.data);
    return tryoutJson(request, result);
  } catch (err) {
    return tryoutError(
      request,
      err instanceof Error ? err.message : "Failed to generate explanation",
      502,
    );
  }
}
