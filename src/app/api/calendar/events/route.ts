import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  handleApiError,
  handleZodError,
  hasRole,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import { listOrgCalendarEvents } from "@/lib/calendar/org-calendar-events";
import { listJobSchedulingSummaries } from "@/lib/calendar/org-calendar-scheduling-summary";
import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  job_id: z.string().uuid().optional(),
  interviewer_user_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    if (!isPlanDocumentNavActive()) {
      return jsonError("Calendar is not enabled", 404);
    }

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const parsed = querySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      job_id: request.nextUrl.searchParams.get("job_id") ?? undefined,
      interviewer_user_id: request.nextUrl.searchParams.get("interviewer_user_id") ?? undefined,
    });
    if (!parsed.success) return handleZodError(parsed.error);

    const now = new Date();
    const from = parsed.data.from ? new Date(parsed.data.from) : now;
    const to = parsed.data.to
      ? new Date(parsed.data.to)
      : new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);

    const supabase = await createSupabaseServerClient();
    const [events, schedulingSummaries] = await Promise.all([
      listOrgCalendarEvents(supabase, {
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        role: ctx.role,
        from,
        to,
        jobId: parsed.data.job_id ?? null,
        interviewerUserId: parsed.data.interviewer_user_id ?? null,
      }),
      listJobSchedulingSummaries(supabase, {
        organisationId: ctx.organisationId,
        userId: ctx.userId,
        role: ctx.role,
        from,
        to,
        jobId: parsed.data.job_id ?? null,
      }),
    ]);

    return jsonSuccess({
      events,
      schedulingSummaries,
      meta: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (err) {
    return handleApiError(err, "Failed to load calendar events", {
      route: "GET /api/calendar/events",
    });
  }
}
