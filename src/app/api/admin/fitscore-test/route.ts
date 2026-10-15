import { NextRequest } from "next/server";
import { z } from "zod";
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
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { FitScoreService } from "@/lib/services/FitScoreService";
import type { HybridScoreResult } from "@/lib/fitscore/hybrid/types";
import { JD_BASE_NOT_APPROVED_MESSAGE } from "@/lib/fitscore/pending-jd-approval";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { validateOrigin } from "@/lib/security/csrf";

const fitscoreTestSchema = z.object({
  candidate_id: z.string().uuid(),
  job_id: z.string().uuid(),
  runs: z.number().int().min(1).max(5).default(5),
  model_version: z.enum(["v1", "v2", "both"]).default("v1"),
});

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/admin/fitscore-test");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = fitscoreTestSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { candidate_id, job_id, runs, model_version } = parsed.data;

    const admin = createSupabaseAdmin();

    // Verify candidate and job exist
    const [{ data: candidate }, { data: job }] = await Promise.all([
      admin.from("candidates").select("id").eq("id", candidate_id).single(),
      admin.from("jobs").select("id").eq("id", job_id).single(),
    ]);

    if (!candidate) return jsonError("Candidate not found", 404);
    if (!job) return jsonError("Job not found", 404);

    // Note: model_version "both" is not yet supported (requires refactoring to pass version through function chain)
    // Currently, the endpoint uses whatever USE_HYBRID_STAGE2 env var is set
    // To test both versions, call the endpoint twice with different env settings

    const { env } = await import("@/lib/config/env");
    const currentModelVersion = env.useHybridStage2 ? "v2" : "v1";

    // Handle "both" case - return error for now (can be enhanced later)
    if (model_version === "both") {
      return jsonError(
        'model_version "both" is not yet supported. Call the endpoint twice with different USE_HYBRID_STAGE2 env settings to test both versions.',
        400,
      );
    }

    // If user requested a specific version that doesn't match current env, warn them
    if (model_version !== currentModelVersion) {
      logger.warn("FitScore test: requested model version doesn't match env", {
        requested: model_version,
        actual: currentModelVersion,
        candidate_id,
        job_id,
      });
    }

    const scores: number[] = [];
    const gradesPerRun: Array<{
      run: number;
      score: number;
      criteria_breakdown: unknown;
      key_strengths: string[];
      key_gaps: string[];
    }> = [];

    try {
      // Run multiple iterations
      for (let run = 1; run <= runs; run++) {
        logger.info("FitScore test run", {
          candidate_id,
          job_id,
          model_version: currentModelVersion,
          run,
          total_runs: runs,
        });

        const scoreResult = (await FitScoreService.computeSingle(admin, job_id, candidate_id, {
          force: true,
          saveToDb: true,
          isTestRun: true,
          onUnapprovedJdBase: "throw",
          source: "investigation",
        })) as Record<string, any>;

        const runScore = "score" in scoreResult ? scoreResult.score : scoreResult.fitScore;
        const criteriaBreakdown =
          "criteria_breakdown" in scoreResult
            ? scoreResult.criteria_breakdown
            : scoreResult.breakdown;
        const keyStrengths =
          "key_strengths" in scoreResult
            ? scoreResult.key_strengths
            : scoreResult.extraction.green_flags;
        const keyGaps =
          "key_gaps" in scoreResult
            ? scoreResult.key_gaps
            : [
                ...scoreResult.extraction.red_flags.map((flag: { flag: string }) => flag.flag),
                ...(scoreResult.extraction.ideal_gaps ?? []),
              ];

        scores.push(runScore);
        gradesPerRun.push({
          run,
          score: runScore,
          criteria_breakdown: criteriaBreakdown,
          key_strengths: keyStrengths,
          key_gaps: keyGaps,
        });
      }

      // Calculate variance and consistency
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      const variance = maxScore - minScore;
      const consistent = variance <= 5;

      const results = {
        candidate_id,
        job_id,
        model_version: currentModelVersion,
        scores,
        grades_per_run: gradesPerRun,
        variance,
        consistent,
      };

      return jsonSuccess(results);
    } catch (err) {
      if (err instanceof Error && err.message === "jd_base_not_approved") {
        return jsonError(JD_BASE_NOT_APPROVED_MESSAGE, 428);
      }
      reportError(err, {
        route: "POST /api/admin/fitscore-test",
        candidate_id,
        job_id,
      });
      logger.error("FitScore test failed", {
        error: err instanceof Error ? err.message : String(err),
        candidate_id,
        job_id,
      });
      return jsonError("FitScore test failed", 500);
    }
  } catch (err) {
    return handleApiError(err, "Failed to run FitScore test", {
      route: "POST /api/admin/fitscore-test",
    });
  }
}
