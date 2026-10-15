import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { getCostTrend, getRangeFromDays } from "@/lib/costs/query";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const range = getRangeFromDays(request.nextUrl.searchParams.get("rangeDays"), 30);
    const trend = await getCostTrend(range);

    return jsonSuccess({
      range,
      trend,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch cost trend", {
      route: "GET /api/admin/costs/trend",
    });
  }
}
