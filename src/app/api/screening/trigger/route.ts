import { NextRequest } from "next/server";
import {
  getAuthContext,
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
  hasRole,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { screeningTriggerSchema } from "@/lib/validations/screening";
import { triggerScreeningAfterFitScore } from "@/lib/screening/trigger";
import { validateOrigin } from "@/lib/security/csrf";
import { assertJobAccess } from "@/lib/job-access";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "recruiter", "leadership", "super_admin")) {
      return jsonError("Forbidden", 403);
    }
    const parsedBody = await parseJsonBody<unknown>(request, "POST /api/screening/trigger");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = screeningTriggerSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { job } = await assertJobAccess(supabase, ctx, parsed.data.req_id);
    if (!job) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const screeningJob = await triggerScreeningAfterFitScore(admin, {
      jobId: parsed.data.req_id,
      candidateId: parsed.data.candidate_id,
      forcedMode: parsed.data.mode,
      triggeredBy: parsed.data.triggered_by,
      recruiterId: parsed.data.recruiter_id ?? ctx.userId,
    });
    if (!screeningJob) return jsonError("Could not create screening job", 400);
    return jsonSuccess({ job: screeningJob });
  } catch (error) {
    return handleApiError(error, "Failed to trigger screening", {
      route: "POST /api/screening/trigger",
    });
  }
}
