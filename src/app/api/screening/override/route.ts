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
import { screeningOverrideSchema } from "@/lib/validations/screening";
import { triggerScreeningAfterFitScore } from "@/lib/screening/trigger";
import { isTerminalScreeningStatus } from "@/lib/screening/state-machine";
import { validateOrigin } from "@/lib/security/csrf";
import { assertJobAccess } from "@/lib/job-access";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "recruiter", "leadership", "super_admin")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody<unknown>(request, "POST /api/screening/override");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = screeningOverrideSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: current, error: currentError } = await admin
      .from("screening_jobs")
      .select("id, organisation_id, candidate_id, req_id, mode, status")
      .eq("id", parsed.data.job_id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonError("Screening job not found", 404);

    const reqId = (current as { req_id?: string }).req_id;
    if (reqId) {
      const { job } = await assertJobAccess(supabase, ctx, reqId);
      if (!job) return jsonError("Forbidden", 403);
    } else if (ctx.role !== "super_admin" && current.organisation_id !== ctx.organisationId) {
      return jsonError("Forbidden", 403);
    }
    if (!isTerminalScreeningStatus(current.status)) {
      const { error: cancelError } = await admin
        .from("screening_jobs")
        .update({
          status: "cancelled",
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);
      if (cancelError) throw cancelError;
    }

    const next = await triggerScreeningAfterFitScore(admin, {
      jobId: current.req_id,
      candidateId: current.candidate_id,
      forcedMode: parsed.data.new_mode,
      triggeredBy: "recruiter_manual",
      recruiterId: ctx.userId,
    });
    if (!next) return jsonError("Failed to create override screening job", 400);

    await admin
      .from("screening_jobs")
      .update({
        overridden_from_mode: current.mode,
      })
      .eq("id", next.id);

    return jsonSuccess({
      previousJobId: current.id,
      job: next,
      reason: parsed.data.reason ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to override screening mode", {
      route: "POST /api/screening/override",
    });
  }
}
