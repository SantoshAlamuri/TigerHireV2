import { NextRequest } from "next/server";
import { handleApiError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuditLog } from "@/lib/repositories/integrations.repository";
import { requireSettingsAdmin } from "@/lib/settings/server";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "read_audit" });
    if (auth.error) return auth.error;

    const limitParam = Number(request.nextUrl.searchParams.get("limit"));
    const before = request.nextUrl.searchParams.get("before") ?? undefined;
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;

    const admin = createSupabaseAdmin();
    const entries = await getAuditLog(admin, auth.context.organisationId, { limit, before });

    return jsonSuccess({ entries });
  } catch (err) {
    return handleApiError(err, "Failed to fetch audit log", {
      route: "GET /api/settings/audit",
    });
  }
}
