import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/admin/analytics — platform-wide analytics for admin dashboard
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const supabase = await createSupabaseServerClient();

    const [
      candidatesResult,
      companiesResult,
      jobsResult,
      scoresResult,
      usersResult,
      waitlistResult,
      unlocksResult,
      agentRunsResult,
    ] = await Promise.all([
      supabase.from("candidates").select("id", { count: "exact", head: true }),
      supabase
        .from("organisations")
        .select("id", { count: "exact", head: true })
        .eq("type", "company"),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase
        .from("fit_scores")
        .select("id", { count: "exact", head: true })
        .or("is_test_run.eq.false,is_test_run.is.null"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("waitlist").select("id", { count: "exact", head: true }),
      supabase.from("candidate_unlocks").select("id", { count: "exact", head: true }),
      supabase.from("agent_logs").select("id", { count: "exact", head: true }),
    ]);

    // Recent agent runs
    const { data: recentAgentRuns } = await supabase
      .from("agent_logs")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    // Users by role — push the GROUP BY into Postgres (PostgREST aggregate) so we
    // don't pull every profile row into memory just to count them.
    const roleCounts: Record<string, number> = {};
    const { data: roleAgg, error: roleAggError } = await supabase
      .from("profiles")
      .select("role, count:id.count()");

    if (roleAggError) {
      // Fallback: PostgREST aggregate not enabled (e.g. db-aggregates off). Pull a
      // bounded slice of role values and count in JS rather than the whole table.
      const { data: roleBreakdown } = await supabase.from("profiles").select("role").limit(10_000);
      roleBreakdown?.forEach((p) => {
        roleCounts[p.role] = (roleCounts[p.role] ?? 0) + 1;
      });
    } else {
      for (const row of (roleAgg ?? []) as Array<{ role: string; count: number }>) {
        if (row.role == null) continue;
        roleCounts[row.role] = (roleCounts[row.role] ?? 0) + Number(row.count ?? 0);
      }
    }

    // This month's stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: newUsersThisMonth } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString());

    const { count: newScoresThisMonth } = await supabase
      .from("fit_scores")
      .select("id", { count: "exact", head: true })
      .or("is_test_run.eq.false,is_test_run.is.null")
      .gte("created_at", startOfMonth.toISOString());

    // Bound the learning-feedback scan: most-recent rows only, hard cap so this
    // can't grow into an unbounded full-table read as outcomes accumulate.
    const LEARNING_ROWS_LIMIT = 5_000;
    const { data: learningRows } = await supabase
      .from("hiring_outcomes")
      .select("accuracy_signal, fit_score_value, outcome, created_at, jobs(role_function)")
      .not("accuracy_signal", "is", null)
      .order("created_at", { ascending: false })
      .limit(LEARNING_ROWS_LIMIT);

    const feedbackRows = (learningRows ?? []) as Array<{
      accuracy_signal: "accurate" | "too_low" | "too_high" | null;
      fit_score_value: number | null;
      outcome: "hired" | "rejected" | "withdrawn" | null;
      created_at: string | null;
      jobs?: { role_function?: string | null } | { role_function?: string | null }[] | null;
    }>;

    const roleFamilySummary = new Map<
      string,
      { total: number; accurate: number; too_low: number; too_high: number }
    >();
    let hiredScoreSum = 0;
    let hiredCount = 0;
    let rejectedScoreSum = 0;
    let rejectedCount = 0;

    for (const row of feedbackRows) {
      const jobs = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
      const roleFamily = jobs?.role_function?.trim() || "Unknown";
      const signal = row.accuracy_signal;
      if (!signal) continue;

      const bucket = roleFamilySummary.get(roleFamily) ?? {
        total: 0,
        accurate: 0,
        too_low: 0,
        too_high: 0,
      };
      bucket.total += 1;
      if (signal === "accurate") bucket.accurate += 1;
      if (signal === "too_low") bucket.too_low += 1;
      if (signal === "too_high") bucket.too_high += 1;
      roleFamilySummary.set(roleFamily, bucket);

      if (typeof row.fit_score_value === "number" && Number.isFinite(row.fit_score_value)) {
        if (row.outcome === "hired") {
          hiredScoreSum += row.fit_score_value;
          hiredCount += 1;
        } else if (row.outcome === "rejected") {
          rejectedScoreSum += row.fit_score_value;
          rejectedCount += 1;
        }
      }
    }

    const roleFamilyBreakdown = Array.from(roleFamilySummary.entries())
      .map(([roleFamily, bucket]) => ({
        roleFamily,
        total: bucket.total,
        accuratePct: bucket.total > 0 ? Math.round((bucket.accurate / bucket.total) * 100) : 0,
        tooLowPct: bucket.total > 0 ? Math.round((bucket.too_low / bucket.total) * 100) : 0,
        tooHighPct: bucket.total > 0 ? Math.round((bucket.too_high / bucket.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return jsonSuccess({
      totals: {
        candidates: candidatesResult.count ?? 0,
        companies: companiesResult.count ?? 0,
        activeJobs: jobsResult.count ?? 0,
        fitScores: scoresResult.count ?? 0,
        users: usersResult.count ?? 0,
        waitlist: waitlistResult.count ?? 0,
        unlocks: unlocksResult.count ?? 0,
        agentRuns: agentRunsResult.count ?? 0,
      },
      thisMonth: {
        newUsers: newUsersThisMonth ?? 0,
        newScores: newScoresThisMonth ?? 0,
      },
      roleCounts,
      learningFeedback: {
        totalSubmitted: feedbackRows.length,
        roleFamilyBreakdown,
        avgFitScoreHired: hiredCount > 0 ? Number((hiredScoreSum / hiredCount).toFixed(1)) : null,
        avgFitScoreRejected:
          rejectedCount > 0 ? Number((rejectedScoreSum / rejectedCount).toFixed(1)) : null,
      },
      recentAgentRuns: recentAgentRuns ?? [],
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch analytics", {
      route: "GET /api/admin/analytics",
    });
  }
}
