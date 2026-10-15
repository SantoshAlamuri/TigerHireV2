import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { listCustomerUsageMeters } from "@/lib/billing/customer-usage-meters";

/**
 * GET /api/admin/billing/usage-meters
 * Canonical meter definitions for usage-based customer billing (reference for ops + future Stripe).
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    return jsonSuccess({ meters: [...listCustomerUsageMeters()] });
  } catch (err) {
    return handleApiError(err, "Failed to list usage meters", {
      route: "GET /api/admin/billing/usage-meters",
    });
  }
}
