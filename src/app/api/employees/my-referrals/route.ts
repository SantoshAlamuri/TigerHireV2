import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth, hasRole, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { EmployeeService } from "@/lib/services/EmployeeService";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "employee")) return jsonError("Forbidden", 403);

    const supabase = await createSupabaseServerClient();
    const referrals = await EmployeeService.getMyReferrals(supabase, ctx.userId);

    return jsonSuccess({ referrals });
  } catch {
    return jsonError("Failed to fetch referrals", 500);
  }
}
