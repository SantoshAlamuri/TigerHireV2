import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCandidateAccessScope } from "@/lib/security/candidate-scope";
import { getAccessibleCandidateIdsForOrgs } from "@/lib/repositories/CandidateRepository";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";

/**
 * GET /api/compliance/dsr
 * Data Subject Request view: candidates see their own requests; super admins see all.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    const admin = createSupabaseAdmin();
    const limit = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 50), 1),
      200,
    );
    const offset = Math.max(Number(request.nextUrl.searchParams.get("offset") ?? 0), 0);

    if (hasRole(ctx, "candidate_free", "candidate_pro")) {
      const { data: candidate } = await admin
        .from("candidates")
        .select("id")
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (!candidate) return jsonSuccess({ requests: [], total: 0 });
      const { data, count, error } = await admin
        .from("erasure_requests")
        .select(
          "id, candidate_id, phone, requested_via, status, rejection_reason, completed_at, created_at",
          {
            count: "exact",
          },
        )
        .eq("candidate_id", candidate.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) return jsonError("Failed to load DSR requests", 500);
      return jsonSuccess({ requests: data ?? [], total: count ?? 0 });
    }

    if (hasRole(ctx, "leadership", "recruiter", "hiring_manager")) {
      if (!ctx.organisationId) return jsonError("No organisation context", 400);
      // Candidates are reachable through the org's funnel (unlock / fit score /
      // application), never through a candidates.organisation_id column — that
      // column does not exist, so the previous query 500'd this route for every
      // company seat. Use the same resolvers as the candidate list rather than
      // re-deriving the rule here; see lib/security/candidate-scope.
      let candidateIds: string[];
      if (hasRole(ctx, "hiring_manager")) {
        const hmJobIds = await listHiringManagerJobIds(admin, ctx.organisationId, ctx.userId);
        if (hmJobIds.length === 0) return jsonSuccess({ requests: [], total: 0 });
        const { data: appRows, error: appErr } = await admin
          .from("applications")
          .select("candidate_id")
          .in("job_id", hmJobIds);
        if (appErr) {
          return handleApiError(appErr, "Failed to resolve organisation candidates", {
            route: "GET /api/compliance/dsr",
          });
        }
        candidateIds = [
          ...new Set((appRows ?? []).map((r) => (r as { candidate_id: string }).candidate_id)),
        ].filter(Boolean);
      } else {
        const { organisationIds } = await resolveCandidateAccessScope(admin, ctx);
        candidateIds = await getAccessibleCandidateIdsForOrgs(admin, organisationIds);
      }
      if (candidateIds.length === 0) return jsonSuccess({ requests: [], total: 0 });
      const { data, count, error } = await admin
        .from("erasure_requests")
        .select(
          "id, candidate_id, phone, requested_via, status, rejection_reason, completed_at, created_at",
          {
            count: "exact",
          },
        )
        .in("candidate_id", candidateIds)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) return jsonError("Failed to load DSR requests", 500);
      return jsonSuccess({ requests: data ?? [], total: count ?? 0 });
    }

    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);
    const { data, count, error } = await admin
      .from("erasure_requests")
      .select(
        "id, candidate_id, phone, requested_via, status, rejection_reason, completed_at, created_at",
        {
          count: "exact",
        },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return jsonError("Failed to load DSR requests", 500);
    return jsonSuccess({ requests: data ?? [], total: count ?? 0 });
  } catch (err) {
    return handleApiError(err, "Failed to fetch DSR requests", {
      route: "GET /api/compliance/dsr",
    });
  }
}
