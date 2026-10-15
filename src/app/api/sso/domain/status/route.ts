import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  handleApiError,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (ctx.role !== "leadership" || !ctx.organisationId) return jsonSuccess({ mapping: null });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("company_sso_mappings")
      .select("id, primary_domain, domain_verified_at, domain_verification_token")
      .eq("company_id", ctx.organisationId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return jsonError("Failed to load domain status", 500);
    return jsonSuccess({
      mapping: data
        ? {
            id: data.id,
            primary_domain: data.primary_domain,
            domain_verified_at: data.domain_verified_at,
            has_verification_token: Boolean(data.domain_verification_token),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load domain status", {
      route: "GET /api/sso/domain/status",
    });
  }
}
