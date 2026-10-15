import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import {
  getAnthropicCostWithoutJobAttribution,
  getCostByJob,
  getRangeFromDays,
} from "@/lib/costs/query";

/**
 * Per-job platform cost rollup. Super-admin only. Returns top jobs by USD
 * spend in the requested window, joined with jobs.title for display.
 *
 *   GET /api/admin/costs/by-job?rangeDays=30&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const range = getRangeFromDays(request.nextUrl.searchParams.get("rangeDays"), 30);
    const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const [jobs, unattributedAnthropic] = await Promise.all([
      getCostByJob(range, limit),
      getAnthropicCostWithoutJobAttribution(range),
    ]);

    return jsonSuccess({
      range,
      jobs,
      totalJobs: jobs.length,
      totalUsd: Number(jobs.reduce((sum, j) => sum + j.totalUsd, 0).toFixed(6)),
      unattributedAnthropic,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch per-job costs", {
      route: "GET /api/admin/costs/by-job",
    });
  }
}
