import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  getTenantScopedClient,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { ForbiddenError } from "@/lib/tenancy/tenant-scoped-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership", "recruiter", "agency", "super_admin"))
      return jsonError("Forbidden", 403);
    const { id } = await params;
    const db = await getTenantScopedClient(ctx);
    if (!(await db.assertJobAccess(id))) return jsonError("Job not found", 404);
    const supabase = await createSupabaseServerClient();
    const statuses = ["applied", "shortlisted", "rejected", "hired"] as const;
    const base = () =>
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("job_id", id);
    const results = await Promise.all([
      base(),
      ...statuses.map((status) => base().eq("status", status)),
      // Count parent applications with at least one answer; do not count answer rows.
      supabase
        .from("applications")
        .select("id, application_screening_answers!inner(id)", { count: "exact", head: true })
        .eq("job_id", id),
    ]);
    for (const result of results) {
      if (result.error) throw result.error;
      if (result.count == null) throw new Error("Application count unavailable");
    }
    const [total, applied, shortlisted, rejected, hired, screened] = results.map((r) => r.count!);
    return jsonSuccess({ total, applied, shortlisted, rejected, hired, screened });
  } catch (error) {
    if (error instanceof ForbiddenError) return jsonError("Forbidden", 403);
    return handleApiError(error, "Failed to load application counts", {
      route: "GET /api/jobs/[id]/application-summary",
    });
  }
}
