import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { syncAllPlatformCosts } from "@/lib/costs/sync";
import { validateOrigin } from "@/lib/security/csrf";

function parseWindow(searchParams: URLSearchParams): { from: Date; to: Date } {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate >= toDate) {
    const fallbackTo = new Date();
    return { from: new Date(fallbackTo.getTime() - 24 * 60 * 60 * 1000), to: fallbackTo };
  }
  return { from: fromDate, to: toDate };
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const window = parseWindow(request.nextUrl.searchParams);
    const results = await syncAllPlatformCosts(window);
    return jsonSuccess({
      synced: true,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      results,
    });
  } catch (err) {
    return handleApiError(err, "Failed to sync platform costs", {
      route: "POST /api/admin/costs/sync",
    });
  }
}
