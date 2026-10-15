import { NextRequest } from "next/server";
import {
  getAuthContext,
  handleApiError,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("screening_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("Not found", 404);
    if (ctx.role !== "super_admin") {
      if (!ctx.organisationId) return jsonError("Forbidden", 403);
      if (ctx.role === "agency") {
        const { data: links, error: linksError } = await supabase
          .from("agency_clients")
          .select("client_organisation_id")
          .eq("agency_organisation_id", ctx.organisationId);
        if (linksError) throw linksError;
        const orgIds = new Set([
          ctx.organisationId,
          ...(links ?? []).map((r: { client_organisation_id: string }) => r.client_organisation_id),
        ]);
        if (!orgIds.has(data.organisation_id)) {
          return jsonError("Forbidden", 403);
        }
      } else if (data.organisation_id !== ctx.organisationId) {
        return jsonError("Forbidden", 403);
      }
    }
    return jsonSuccess({ job: data });
  } catch (error) {
    return handleApiError(error, "Failed to fetch screening job", {
      route: "GET /api/screening/jobs/[id]",
    });
  }
}
