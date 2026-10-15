import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { publicAppOrigin } from "@/lib/referrers/referral-link-mint";
import { EmployeeReferralBoardService } from "@/lib/services/EmployeeReferralBoardService";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "employee")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No company associated", 400);

    const admin = createSupabaseAdmin();
    const board = await EmployeeReferralBoardService.getBoard(
      admin,
      ctx.userId,
      ctx.organisationId,
      publicAppOrigin(request),
    );

    return jsonSuccess(board);
  } catch (err) {
    return handleApiError(err, "Failed to load referral board", {
      route: "GET /api/employees/referral-board",
    });
  }
}
