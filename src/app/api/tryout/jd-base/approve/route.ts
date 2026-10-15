import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { approveJdBase, getJdBaseByJobId } from "@/lib/fitscore/hybrid";
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

const approveSchema = z.object({
  jobId: z.string().uuid(),
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
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      return tryoutError(request, "jobId (UUID) is required", 422);
    }

    const admin = createSupabaseAdmin();
    const job = await loadTryoutJob(admin, parsed.data.jobId, ctx.organisationId!);
    if (!job) return tryoutError(request, "Job not found", 404);

    const existing = await getJdBaseByJobId(admin, parsed.data.jobId);
    if (!existing) return tryoutError(request, "JD Base not found. Generate one first.", 404);

    // Pass the tryout org so org-scoped feature flags (e.g. structured JD) resolve
    // correctly, mirroring POST /api/fitscore/jd-base/approve.
    const doc = existing.approvedBy
      ? existing
      : await approveJdBase(admin, parsed.data.jobId, ctx.userId, ctx.organisationId);

    return tryoutJson(request, {
      ...serializeTryoutJdBase(doc, job),
      message: existing.approvedBy ? "JD Base already approved." : "JD Base approved.",
    });
  } catch (err) {
    return tryoutError(
      request,
      err instanceof Error ? err.message : "Failed to approve JD Base",
      502,
    );
  }
}
