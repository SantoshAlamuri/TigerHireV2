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
import { jdBaseGenerateSchema } from "@/lib/validations/fitscore-hybrid";
import { FEATURE_FLAG_HYBRID_V2, getJdBaseByJobId, approveJdBase } from "@/lib/fitscore/hybrid";
import { loadJobForHybridPipeline } from "@/lib/fitscore/hybrid/api-access";
import { enqueue } from "@/lib/jobs/queue";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return jsonError("Hybrid FitScore v2 is not enabled.", 403);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/fitscore/jd-base/approve");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = jdBaseGenerateSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const server = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const job = await loadJobForHybridPipeline(server, admin, ctx, parsed.data.jobId);
    if (!job) return jsonError("Job not found or access denied", 404);

    const existing = await getJdBaseByJobId(admin, parsed.data.jobId);
    if (!existing) {
      return jsonError("No JD Base document exists for this job. Generate one first.", 404);
    }

    const doc = existing.approvedBy
      ? existing
      : await approveJdBase(admin, parsed.data.jobId, ctx.userId!, ctx.organisationId);

    // Reconcile (full-job rescore) runs in the background: inline it made this request
    // time out on jobs with hundreds of candidates, so the wizard showed a failure even
    // though approval had committed — and the retry triggered a duplicate full rescore.
    // The version-scoped event id lets Inngest dedupe retries of the same approval.
    const { id: reconcileEventId } = await enqueue(
      "jd-base-approval-reconcile",
      { jobId: parsed.data.jobId, approvedByUserId: ctx.userId ?? null },
      { id: `jd-base-approval-reconcile:${parsed.data.jobId}:${doc.version ?? 1}` },
    );

    return jsonSuccess({
      jdBase: {
        id: doc.id,
        jobId: doc.jobId,
        roleTitle: doc.roleTitle,
        weights: doc.weights,
        approvedBy: doc.approvedBy,
        approvedAt: doc.approvedAt,
      },
      reconciliation: { queued: true, eventId: reconcileEventId ?? null },
      message: existing.approvedBy
        ? "JD Base already approved. Candidate re-scoring runs in the background."
        : "JD Base approved. Existing candidates will be re-scored in the background.",
    });
  } catch (err) {
    return handleApiError(err, "Failed to approve JD Base document", {
      route: "POST /api/fitscore/jd-base/approve",
    });
  }
}
