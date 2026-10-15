import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { getCostSummary, getRangeFromDays } from "@/lib/costs/query";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const range = getRangeFromDays(request.nextUrl.searchParams.get("rangeDays"), 30);
    const summary = await getCostSummary(range);

    return jsonSuccess({
      range,
      summary,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch cost summary", {
      route: "GET /api/admin/costs/summary",
    });
  }
}
