export const maxDuration = 300;

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { logger } from "@/lib/observability/logger";
import { invalidateFitScoreCache } from "@/lib/redis/fitscore-cache";
import { validateOrigin } from "@/lib/security/csrf";
import { isJdBaseApproved, JD_BASE_NOT_APPROVED_MESSAGE } from "@/lib/fitscore/pending-jd-approval";

/** Max pairs to rescore per request to avoid timeout; caller can paginate by passing offset. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * POST /api/agency/rescore-candidates
 *
 * Re-runs FitScore for all pipeline candidates (job–candidate pairs) for the
 * agency's client jobs. Does not re-parse CVs; uses existing candidate data.
 * Invalidates Redis FitScore cache before each compute so reruns always use
 * the current formula (e.g. signal+blend). Use after scoring model/prompt
 * or formula changes.
 *
 * Body: JSON { limit?: number; offset?: number }
 * Returns: { processed, succeeded, failed, totalPairs, errors }
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "agency", "super_admin")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation linked", 400);

    const parsedBody = await parseJsonBody<{ limit?: number; offset?: number }>(
      request,
      "POST /api/agency/rescore-candidates",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.body;

    const limit = Math.min(Math.max(1, Number(body.limit) || DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Math.max(0, Number(body.offset) || 0);

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();

    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ctx.organisationId);
    const clientOrgIds = (links ?? []).map(
      (l: { client_organisation_id: string }) => l.client_organisation_id,
    );
    if (clientOrgIds.length === 0) {
      return jsonSuccess({
        processed: 0,
        succeeded: 0,
        failed: 0,
        totalPairs: 0,
        errors: [],
        message: "No client organisations.",
      });
    }

    const { data: jobs } = await admin
      .from("jobs")
      .select(
        "id, title, description, location, status, compensation_min, compensation_max, organisation_id, skills_required",
      )
      .in("organisation_id", clientOrgIds);
    const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0) {
      return jsonSuccess({
        processed: 0,
        succeeded: 0,
        failed: 0,
        totalPairs: 0,
        errors: [],
        message: "No jobs for your clients.",
      });
    }

    for (const jobId of jobIds) {
      if (!(await isJdBaseApproved(admin, jobId))) {
        return jsonError(JD_BASE_NOT_APPROVED_MESSAGE, 428);
      }
    }

    const jobMap = new Map((jobs ?? []).map((j: Record<string, unknown>) => [j.id as string, j]));

    const { data: pipelineRows } = await admin
      .from("pipeline_candidates")
      .select("job_id, candidate_id")
      .in("job_id", jobIds)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    const pairs = pipelineRows ?? [];
    const { count: totalPairsCount } = await admin
      .from("pipeline_candidates")
      .select("job_id", { count: "exact", head: true })
      .in("job_id", jobIds);

    if (pairs.length === 0) {
      return jsonSuccess({
        processed: 0,
        succeeded: 0,
        failed: 0,
        totalPairs: Number(totalPairsCount ?? 0),
        errors: [],
        message: "No pipeline candidates to rescore in this range.",
      });
    }

    const candidateIds = [...new Set(pairs.map((p: { candidate_id: string }) => p.candidate_id))];
    const { data: candidates } = await admin
      .from("candidates")
      .select(
        "id, name, full_name, email, phone, skills, experience_years, location, cv_raw_text, current_role, current_company, seniority_level, updated_at, resume_url, cv_url",
      )
      .in("id", candidateIds);

    const candidateMap = new Map(
      (candidates ?? []).map((c: Record<string, unknown>) => [c.id as string, c]),
    );

    let succeeded = 0;
    const errors: string[] = [];

    for (const row of pairs) {
      const jobId = row.job_id as string;
      const candidateId = row.candidate_id as string;
      const job = jobMap.get(jobId);
      const candidate = candidateMap.get(candidateId);

      if (!job || !candidate) {
        errors.push(`Missing job or candidate: ${jobId}/${candidateId}`);
        continue;
      }

      try {
        await invalidateFitScoreCache(candidateId, jobId);
        await FitScoreService.computeSingle(admin, jobId, candidateId, {
          saveToDb: true,
          onUnapprovedJdBase: "throw",
          source: "rescore",
          force: true,
        });
        succeeded++;
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message?: unknown }).message)
              : JSON.stringify(e);
        logger.warn("Rescore: fit score failed", {
          job_id: jobId,
          candidate_id: candidateId,
          error: msg,
        });
        errors.push(`${jobId}/${candidateId}: ${msg}`);
      }
    }

    const failed = pairs.length - succeeded;

    return jsonSuccess({
      processed: pairs.length,
      succeeded,
      failed,
      totalPairs: Number(totalPairsCount ?? 0),
      errors: errors.slice(0, 20),
      message:
        failed > 0
          ? `Rescored ${succeeded} of ${pairs.length} in this batch; ${failed} failed.`
          : `Rescored ${succeeded} candidate–job pair(s).`,
    });
  } catch (err) {
    return handleApiError(err, "Failed to rescore candidates", {
      route: "POST /api/agency/rescore-candidates",
    });
  }
}
