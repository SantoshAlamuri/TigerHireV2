import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/applications/stats
 * Returns application analytics for the authenticated candidate.
 * - total, by-status counts
 * - average FitScore across applications
 * - most recent activity
 */
export async function GET(_request: NextRequest) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  try {
    const supabase = await createSupabaseServerClient();

    const { data: apps, error } = await supabase
      .from("applications")
      .select("id, status, created_at, viewed_at, fit_score_id")
      .eq("candidate_id", ctx.userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to fetch application stats", {
        error: error.message,
        userId: ctx.userId,
      });
      return jsonError("Failed to load stats", 500);
    }

    const rows = apps ?? [];
    const total = rows.length;
    const byStatus: Record<string, number> = {};
    let viewedCount = 0;

    for (const app of rows) {
      byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
      if (app.viewed_at) viewedCount++;
    }

    // Fetch average FitScore for this candidate's scored applications
    const { data: scoreData } = await supabase
      .from("fit_scores")
      .select("overall_score")
      .eq("candidate_id", ctx.userId)
      .or("is_test_run.eq.false,is_test_run.is.null");

    const scores = (scoreData ?? [])
      .map((s: { overall_score: number | null }) => s.overall_score)
      .filter((s: number | null): s is number => s != null);

    const avgFitScore =
      scores.length > 0
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : null;

    const highestScore = scores.length > 0 ? Math.max(...scores) : null;

    // Response rate = how many applications got viewed
    const responseRate = total > 0 ? Math.round((viewedCount / total) * 100) : 0;

    return jsonSuccess({
      total,
      byStatus,
      viewedCount,
      responseRate,
      avgFitScore,
      highestScore,
      totalScored: scores.length,
      lastAppliedAt: rows[0]?.created_at ?? null,
    });
  } catch (err) {
    logger.error("Application stats error", { error: String(err), userId: ctx.userId });
    return jsonError("Failed to load stats", 500);
  }
}
