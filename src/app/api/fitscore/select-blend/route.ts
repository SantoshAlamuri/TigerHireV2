/**
 * POST /api/fitscore/select-blend
 * Recruiter selects which score to use (primary 20/80 or shadow 40/60).
 * Logs selection for calibration; when shadow is selected, displayed score becomes shadow_score.
 */

import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
  apiLogContext,
  reportError,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertJobAccess } from "@/lib/job-access";
import { selectBlendSchema } from "@/lib/validations/organisations";
import { validateOrigin } from "@/lib/security/csrf";
import { fitLabelForScore } from "@/lib/fitscore/hybrid/engine";
import { DEFAULT_FIT_THRESHOLDS } from "@/lib/fitscore/hybrid/constants";
import { fitThresholdsSchema } from "@/lib/validations/fitscore-hybrid";
import type { FitThresholds } from "@/lib/fitscore/hybrid/types";

/**
 * Same thresholds the scorer used: prefer the frozen rubric snapshot captured at persist time,
 * fall back to the platform defaults for legacy rows without a snapshot.
 */
function thresholdsFromRow(row: Record<string, unknown>): FitThresholds {
  const snapshot = row.rubric_snapshot as { fit_thresholds?: unknown } | null | undefined;
  const parsed = fitThresholdsSchema.safeParse(snapshot?.fit_thresholds);
  return (parsed.success ? parsed.data : DEFAULT_FIT_THRESHOLDS) as FitThresholds;
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/fitscore/select-blend");
    if (errorResponse) return errorResponse;

    const parsed = selectBlendSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    const { candidate_id, job_id, selection } = parsed.data;

    const admin = createSupabaseAdmin();

    const { data: row, error: fetchError } = await admin
      .from("fit_scores")
      .select(
        "id, overall_score, primary_score, shadow_score, signal_score, grade_based_score, rubric_snapshot, job_id, jobs(organisation_id)",
      )
      .eq("job_id", job_id)
      .eq("candidate_id", candidate_id)
      .is("superseded_at", null)
      .or("is_test_run.eq.false,is_test_run.is.null")
      .maybeSingle();

    if (fetchError) return jsonError("Failed to load fit score", 500);
    if (!row) return jsonError("Fit score not found", 404);

    const supabase = await createSupabaseServerClient();
    const { job: jobAccess } = await assertJobAccess(supabase, ctx, job_id);
    if (!jobAccess) return jsonError("Forbidden", 403);

    const primaryScore =
      (row.primary_score as number | null) ??
      (row.signal_score != null && row.grade_based_score != null
        ? Math.round((row.signal_score as number) * 0.2 + (row.grade_based_score as number) * 0.8)
        : (row.overall_score as number));
    const newDisplayScore =
      selection === "shadow" && row.shadow_score != null
        ? (row.shadow_score as number)
        : primaryScore;

    // Recompute the band chip from the newly selected score so it can't go stale.
    const newBand = fitLabelForScore(newDisplayScore, thresholdsFromRow(row));

    const { error: updateError } = await admin
      .from("fit_scores")
      .update({
        recruiter_selected: selection,
        overall_score: newDisplayScore,
        band: newBand,
      })
      .eq("id", row.id as string);

    if (updateError) {
      reportError(updateError, apiLogContext("POST /api/fitscore/select-blend", ctx));
      return jsonError("Failed to save selection", 500);
    }

    return jsonSuccess({
      success: true,
      selection,
      displayed_score: newDisplayScore,
      band: newBand,
    });
  } catch (err) {
    return handleApiError(err, "Select blend failed", {
      route: "POST /api/fitscore/select-blend",
    });
  }
}
