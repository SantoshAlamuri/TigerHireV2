import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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

const bodySchema = z.object({
  pipeline_candidate_id: z.string().uuid(),
  // Nullable so a wrong date can be cleared, which un-dues the day-90 bonus
  // rather than leaving it anchored to a date the recruiter knows is wrong.
  joined_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
});

/**
 * POST /api/pipeline/joining-date — record when a hire actually started.
 *
 * This is the anchor for day-90 referral payouts. It is separate from
 * `hired_at`, which a database trigger sets the moment a recruiter marks the
 * hire — often weeks before the person walks in, and sometimes for someone who
 * never does. Ninety days of retention has to count from the real first day.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/pipeline/joining-date");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const admin = createSupabaseAdmin();
    const { data: row, error: rowErr } = await admin
      .from("pipeline_candidates")
      .select("id, job_id, status")
      .eq("id", parsed.data.pipeline_candidate_id)
      .maybeSingle();
    if (rowErr) return jsonError("Failed to load pipeline entry.", 500);
    if (!row) return jsonError("Pipeline entry not found", 404);

    if (!hasRole(ctx, "super_admin")) {
      if (!ctx.organisationId) return jsonError("Forbidden", 403);
      const { data: job } = await admin
        .from("jobs")
        .select("id")
        .eq("id", row.job_id)
        .eq("organisation_id", ctx.organisationId)
        .maybeSingle();
      if (!job) return jsonError("Forbidden", 403);
    }

    if (row.status !== "hired") {
      return jsonError("A joining date can only be recorded for a hired candidate.", 400);
    }

    const { error: updErr } = await admin
      .from("pipeline_candidates")
      .update({ joined_at: parsed.data.joined_at })
      .eq("id", row.id);
    if (updErr) return jsonError("Failed to save joining date.", 500);

    await admin.from("audit_log").insert({
      organisation_id: ctx.organisationId ?? null,
      actor_user_id: ctx.userId,
      event_type: "pipeline.joining_date.set",
      resource_type: "pipeline_candidates",
      resource_id: row.id,
      metadata: { joined_at: parsed.data.joined_at, job_id: row.job_id },
    });

    return jsonSuccess({ pipeline_candidate_id: row.id, joined_at: parsed.data.joined_at });
  } catch (err) {
    return handleApiError(err, "Failed to save joining date", {
      route: "POST /api/pipeline/joining-date",
    });
  }
}
