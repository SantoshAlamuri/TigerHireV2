import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { batchAuthEmailsByUserIds } from "@/lib/interviews/batch-auth-emails";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/jobs/[id]/interviewer-profile-options?q=
 * Active org profiles for interviewer picker (feature-flagged server-side).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, full_name, role, avatar_url")
      .eq("organisation_id", job.organisation_id)
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) return jsonError("Failed to load profiles", 500);

    const ids = (profiles ?? []).map((p) => p.id as string);
    const emails = await batchAuthEmailsByUserIds(admin, ids);
    const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";

    let list = (profiles ?? []).map((p) => ({
      id: p.id as string,
      full_name: (p.full_name as string | null) ?? null,
      role: p.role as string,
      avatar_url: (p.avatar_url as string | null) ?? null,
      email: emails.get(p.id as string) ?? "",
    }));

    if (q) {
      list = list.filter((row) => {
        const blob = `${row.full_name ?? ""} ${row.email} ${row.role}`.toLowerCase();
        return blob.includes(q);
      });
    }

    return jsonSuccess({ profiles: list });
  } catch (err) {
    return handleApiError(err, "Failed to load interviewer profiles", {
      route: "GET /api/jobs/[id]/interviewer-profile-options",
    });
  }
}
