import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth, hasRole, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { EmployeeService } from "@/lib/services/EmployeeService";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "employee")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No company associated", 400);

    const supabase = await createSupabaseServerClient();
    const positions = await EmployeeService.getOpenPositions(supabase, ctx.organisationId);

    return jsonSuccess({ positions });
  } catch {
    return jsonError("Failed to fetch open positions", 500);
  }
}
