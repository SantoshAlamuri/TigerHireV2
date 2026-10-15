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

/**
 * GET /api/fitscore/rubrics — every scoring rubric in the caller's org.
 *
 * The rubric library and the governance sign-off queue both need "all rubrics,
 * with their approval state". Per-job fetching would be one request per job,
 * and the screen that needs it most is the one a Head of Talent opens across
 * twelve roles at once. One query instead.
 *
 * Scoped by organisation on the jobs join, not by RLS alone: this reads through
 * the admin client to avoid a dozen policy round-trips, so the tenant boundary
 * has to be explicit and in the query.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    // Agencies are deliberately absent: a partner has no business reading the
    // client's scoring bar, only whether their own submission cleared it.
    if (!hasRole(ctx, "recruiter", "leadership", "hiring_manager", "super_admin")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("jd_base_documents")
      .select(
        "id, job_id, role_title, weights, fit_thresholds, score_floor, version, approved_by, approved_at, updated_at, jobs!inner(id, title, status, organisation_id)",
      )
      .eq("jobs.organisation_id", ctx.organisationId)
      .order("approved_at", { ascending: false, nullsFirst: false });

    if (error) return jsonError("Failed to load rubrics", 500);

    type Row = {
      id: string;
      job_id: string;
      role_title: string | null;
      weights: Record<string, number> | null;
      fit_thresholds: Record<string, number> | null;
      score_floor: number | null;
      version: number | null;
      approved_by: string | null;
      approved_at: string | null;
      updated_at: string | null;
      jobs?: { id: string; title: string | null; status: string | null } | null;
    };

    const rows = (data ?? []) as unknown as Row[];

    // Approver names, resolved in one lookup rather than per row. An approval
    // with no name attached is not an approval anyone can be asked about.
    const approverIds = [...new Set(rows.map((r) => r.approved_by).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (approverIds.length > 0) {
      // `profiles.name` does not exist — the column is `full_name`. PostgREST
      // rejected the whole select, so this map was always empty and every
      // approver rendered nameless: exactly the state the comment above calls
      // useless.
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", approverIds);
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
        if (p.full_name) names.set(p.id, p.full_name);
      }
    }

    return jsonSuccess({
      rubrics: rows.map((r) => ({
        id: r.id,
        jobId: r.job_id,
        jobTitle: r.jobs?.title ?? r.role_title ?? "Untitled job",
        jobStatus: r.jobs?.status ?? null,
        roleTitle: r.role_title,
        weights: r.weights ?? null,
        fitThresholds: r.fit_thresholds ?? null,
        scoreFloor: r.score_floor ?? null,
        version: r.version ?? 1,
        approvedBy: r.approved_by,
        approverName: r.approved_by ? (names.get(r.approved_by) ?? null) : null,
        approvedAt: r.approved_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load rubrics", { route: "GET /api/fitscore/rubrics" });
  }
}
