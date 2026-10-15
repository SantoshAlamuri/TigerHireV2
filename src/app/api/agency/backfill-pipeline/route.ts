import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { cacheDel } from "@/lib/redis/cache";
import { myPipelineKey } from "@/lib/redis/keys";

/**
 * POST /api/agency/backfill-pipeline
 * Adds candidates to pipeline_candidates when they have fit_scores for a client job
 * but no pipeline row yet (e.g. uploaded before we added pipeline insertion).
 * Idempotent: only inserts missing rows.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "agency")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();

    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ctx.organisationId);
    const clientIds = (links ?? []).map(
      (r: { client_organisation_id: string }) => r.client_organisation_id,
    );
    // Include agency's own org so backfill adds pipeline rows for own-org jobs too
    const organisationIds = [...new Set([ctx.organisationId, ...clientIds])] as string[];

    const { data: jobs } = await admin
      .from("jobs")
      .select("id")
      .in("organisation_id", organisationIds)
      .eq("status", "open");
    const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0) {
      return jsonSuccess({
        added: 0,
        message: "No open jobs for your organisation or clients.",
      });
    }

    const { data: scores } = await admin
      .from("fit_scores")
      .select("job_id, candidate_id")
      .in("job_id", jobIds)
      .or("is_test_run.eq.false,is_test_run.is.null");
    if (!scores?.length) {
      return jsonSuccess({
        added: 0,
        message: "No fit scores found; nothing to backfill.",
      });
    }

    let added = 0;
    for (const row of scores) {
      const jobId = row.job_id as string;
      const candidateId = row.candidate_id as string;
      const { data: existing } = await admin
        .from("pipeline_candidates")
        .select("id")
        .eq("job_id", jobId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (existing) continue;

      const { data: firstStage } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("job_id", jobId)
        .order("stage_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      const { error: insErr } = await admin.from("pipeline_candidates").insert({
        job_id: jobId,
        candidate_id: candidateId,
        stage_id: firstStage?.id ?? null,
        status: "in_progress",
        agency_stage: "interest_received",
      });

      if (insErr) {
        // Unique constraint violation: another request inserted the row (TOCTOU). Idempotent.
        const code = (insErr as { code?: string }).code;
        if (code === "23505") continue;
        throw insErr;
      }
      added++;
    }

    if (added > 0) {
      await cacheDel(myPipelineKey(ctx.userId));
    }

    return jsonSuccess({
      added,
      message:
        added > 0
          ? `Added ${added} candidate(s) to the pipeline. Refresh the Pipeline page.`
          : "No new pipeline rows needed.",
    });
  } catch (err) {
    return handleApiError(err, "Backfill failed", {
      route: "POST /api/agency/backfill-pipeline",
    });
  }
}
