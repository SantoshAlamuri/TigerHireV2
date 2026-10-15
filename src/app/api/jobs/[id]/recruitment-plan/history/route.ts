import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { getRecruitmentPlanByJobId, listPlanHistory } from "@/lib/recruitment-plan";
import { planHistoryQuerySchema } from "@/lib/recruitment-plan/schemas";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/jobs/[id]/recruitment-plan/history
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const url = new URL(request.url);
  const parsed = planHistoryQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return handleZodError(parsed.error);

  const admin = createSupabaseAdmin();
  const { plan } = await getRecruitmentPlanByJobId(admin, jobId);
  if (!plan) return jsonSuccess({ history: [] });

  const { history, error } = await listPlanHistory(admin, plan.id, parsed.data);
  if (error) return jsonError("Failed to load plan history", 500);
  return jsonSuccess({ history });
}
