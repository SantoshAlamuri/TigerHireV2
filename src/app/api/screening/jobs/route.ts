import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  handleApiError,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const querySchema = z.object({
  candidateId: z.string().uuid(),
  reqId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId && ctx.role !== "super_admin") return jsonError("Forbidden", 403);

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(params);
    if (!parsed.success)
      return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 422);

    const admin = createSupabaseAdmin();
    let query = admin
      .from("screening_jobs")
      .select("*")
      .eq("candidate_id", parsed.data.candidateId)
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit);

    if (ctx.role !== "super_admin") {
      if (ctx.role === "agency") {
        const { data: links, error: linksError } = await supabase
          .from("agency_clients")
          .select("client_organisation_id")
          .eq("agency_organisation_id", ctx.organisationId);
        if (linksError) throw linksError;
        const orgIds = [
          ctx.organisationId,
          ...(links ?? []).map((r: { client_organisation_id: string }) => r.client_organisation_id),
        ];
        query = query.in("organisation_id", [...new Set(orgIds)]);
      } else {
        query = query.eq("organisation_id", ctx.organisationId);
      }
    }
    if (parsed.data.reqId) {
      query = query.eq("req_id", parsed.data.reqId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return jsonSuccess({ jobs: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch screening jobs", {
      route: "GET /api/screening/jobs",
    });
  }
}
