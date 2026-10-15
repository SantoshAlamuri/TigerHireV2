import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { getCostByProvider, getRangeFromDays } from "@/lib/costs/query";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const range = getRangeFromDays(request.nextUrl.searchParams.get("rangeDays"), 30);
    const providers = await getCostByProvider(range);

    return jsonSuccess({
      range,
      providers,
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch provider costs", {
      route: "GET /api/admin/costs/by-provider",
    });
  }
}
