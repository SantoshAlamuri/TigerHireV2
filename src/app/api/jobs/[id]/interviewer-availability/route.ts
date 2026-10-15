import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import {
  collectJobInterviewerUserIds,
  listJobInterviewerAvailability,
  listOrganisationDeclaredAvailability,
} from "@/lib/interviews/interviewer-availability";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

const querySchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
});

/**
 * GET /api/jobs/[id]/interviewer-availability
 * Declared availability for interviewers assigned on this job's pipeline.
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

    const parsedQuery = querySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
    });
    if (!parsedQuery.success) return handleZodError(parsedQuery.error);

    const from = parsedQuery.data.from ? new Date(parsedQuery.data.from) : new Date();
    const to = parsedQuery.data.to
      ? new Date(parsedQuery.data.to)
      : new Date(from.getTime() + 28 * 24 * 60 * 60 * 1000);

    const admin = createSupabaseAdmin();
    const organisationId = job.organisation_id as string;
    const assignedInterviewerUserIds = await collectJobInterviewerUserIds(admin, jobId);

    let windows = assignedInterviewerUserIds.length
      ? await listJobInterviewerAvailability(admin, {
          jobId,
          organisationId,
          interviewerUserIds: assignedInterviewerUserIds,
          from,
          to,
        })
      : [];

    let scope: "job_assigned" | "organisation" = "job_assigned";
    if (windows.length === 0) {
      windows = await listOrganisationDeclaredAvailability(admin, {
        organisationId,
        from,
        to,
      });
      scope = "organisation";
    }

    return jsonSuccess({
      windows,
      interviewer_user_ids:
        scope === "job_assigned"
          ? assignedInterviewerUserIds
          : [...new Set(windows.map((w) => w.user_id))],
      has_declared_availability: windows.length > 0,
      scope,
      assigned_interviewer_count: assignedInterviewerUserIds.length,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load interviewer availability", {
      route: "GET /api/jobs/[id]/interviewer-availability",
    });
  }
}
