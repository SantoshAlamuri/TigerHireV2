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
import { checkRateLimit } from "@/lib/security/rate-limit";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";

const AGGREGATE_STATUS = z.enum(["upcoming", "pending_feedback", "completed", "cancelled"]);

const querySchema = z.object({
  from: z
    .string()
    .trim()
    .optional()
    .refine((s) => !s || !Number.isNaN(Date.parse(s)), "Invalid from date"),
  to: z
    .string()
    .trim()
    .optional()
    .refine((s) => !s || !Number.isNaN(Date.parse(s)), "Invalid to date"),
  job_id: z.array(z.string().uuid()).optional(),
  interviewer_user_id: z.array(z.string().uuid()).optional(),
  interviewer_email: z.array(z.string().trim().min(3).max(320)).optional(),
  status: z.array(AGGREGATE_STATUS).optional(),
});

function firstJoined<T extends Record<string, unknown>>(
  value: T | T[] | null | undefined,
): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function deriveAggregateStatus(args: {
  now: Date;
  startAt: Date;
  endAt: Date;
  interviewOutcome: string | null;
  feedbackCount: number;
}): z.infer<typeof AGGREGATE_STATUS> {
  const oc = (args.interviewOutcome ?? "").toLowerCase();
  if (oc === "no_show") return "cancelled";
  if (args.feedbackCount > 0 || (oc && oc !== "no_show")) return "completed";
  if (args.endAt.getTime() < args.now.getTime() && !args.interviewOutcome) {
    return "pending_feedback";
  }
  return "upcoming";
}

/**
 * GET /api/interviews/aggregate
 * Org-wide booked interview slots for leadership / recruiter / hiring_manager (Brief 1.5 Phase 3).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (hasRole(ctx, "interviewer")) {
      return jsonError("Use /api/interviewer/interviews for interviewer queue", 403);
    }
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const rl = await checkRateLimit({
      key: `interviews-aggregate:${ctx.userId}`,
      limit: 60,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Too many requests", 429);

    if (!ctx.organisationId && !hasRole(ctx, "super_admin")) {
      return jsonError("No organisation context", 400);
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      job_id: url.searchParams.getAll("job_id").length
        ? url.searchParams.getAll("job_id")
        : undefined,
      interviewer_user_id: url.searchParams.getAll("interviewer_user_id").length
        ? url.searchParams.getAll("interviewer_user_id")
        : undefined,
      interviewer_email: url.searchParams.getAll("interviewer_email").length
        ? url.searchParams.getAll("interviewer_email")
        : undefined,
      status: url.searchParams.getAll("status").length
        ? url.searchParams.getAll("status")
        : undefined,
    });
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const orgId = ctx.organisationId;
    if (!orgId) {
      return jsonError("Select an organisation context for this report", 400);
    }
    const now = new Date();
    const fromDate = parsed.data.from ? new Date(parsed.data.from) : now;
    const toDate = parsed.data.to
      ? new Date(parsed.data.to)
      : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    let hmJobIds: string[] | null = null;
    if (hasRole(ctx, "hiring_manager")) {
      hmJobIds = await listHiringManagerJobIds(supabase, orgId, ctx.userId);
      if (hmJobIds.length === 0) {
        return jsonSuccess({
          interviews: [],
          meta: { from: fromDate.toISOString(), to: toDate.toISOString() },
        });
      }
    }

    let q = supabase
      .from("interview_availability_slots")
      .select(
        `id, start_at, end_at, timezone, job_id, pipeline_candidate_id,
         jobs!inner(id, title, organisation_id, hiring_manager_id),
         pipeline_candidates!inner(
           id, interview_scheduled_at, interview_outcome, status,
           candidates(name, full_name, email),
           pipeline_stages(stage_name, interviewer_email, interviewer_name, interviewer_user_id),
           feedback_responses(id)
         )`,
      )
      .eq("status", "booked")
      .eq("jobs.organisation_id", orgId)
      .not("pipeline_candidate_id", "is", null)
      .gte("start_at", fromDate.toISOString())
      .lte("start_at", toDate.toISOString())
      .order("start_at", { ascending: true })
      .limit(100);

    if (hmJobIds) {
      q = q.in("job_id", hmJobIds);
    }
    if (parsed.data.job_id?.length) {
      q = q.in("job_id", parsed.data.job_id);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    const statusFilter = parsed.data.status?.length ? new Set(parsed.data.status) : null;
    const interviewerUserFilter = parsed.data.interviewer_user_id?.length
      ? new Set(parsed.data.interviewer_user_id)
      : null;
    const interviewerEmailFilter = parsed.data.interviewer_email?.length
      ? new Set(parsed.data.interviewer_email.map((e) => e.toLowerCase()))
      : null;

    const interviews = (rows ?? [])
      .map((raw) => {
        const slot = raw as {
          id: string;
          start_at: string;
          end_at: string;
          timezone: string;
          job_id: string;
          pipeline_candidate_id: string;
          jobs: unknown;
          pipeline_candidates: unknown;
        };
        const job = firstJoined(slot.jobs as Record<string, unknown>);
        const pc = firstJoined(slot.pipeline_candidates as Record<string, unknown>);
        if (!job || !pc) return null;

        const candidate = firstJoined(
          pc.candidates as Record<string, unknown> | Record<string, unknown>[] | null,
        );
        const stage = firstJoined(
          pc.pipeline_stages as Record<string, unknown> | Record<string, unknown>[] | null,
        );
        const feedback = (pc.feedback_responses ?? []) as unknown[];
        const feedbackCount = Array.isArray(feedback) ? feedback.length : 0;

        const interviewerUserId = (stage?.interviewer_user_id as string | null) ?? null;
        const interviewerEmail = ((stage?.interviewer_email as string | null) ?? "")
          .trim()
          .toLowerCase();
        const interviewerName = (stage?.interviewer_name as string | null) ?? null;

        if (interviewerUserFilter && interviewerUserId) {
          if (!interviewerUserFilter.has(interviewerUserId)) return null;
        } else if (interviewerUserFilter && !interviewerUserId) {
          return null;
        }

        if (interviewerEmailFilter?.size) {
          if (!interviewerEmail || !interviewerEmailFilter.has(interviewerEmail)) return null;
        }

        const startAt = new Date(slot.start_at);
        const endAt = new Date(slot.end_at);
        const aggregateStatus = deriveAggregateStatus({
          now,
          startAt,
          endAt,
          interviewOutcome: (pc.interview_outcome as string | null) ?? null,
          feedbackCount,
        });

        if (statusFilter && !statusFilter.has(aggregateStatus)) return null;

        const candidateName =
          (candidate?.full_name as string | null) ??
          (candidate?.name as string | null) ??
          "Candidate";
        const candidateEmail = (candidate?.email as string | null) ?? null;

        return {
          slotId: slot.id,
          pipelineCandidateId: pc.id as string,
          jobId: slot.job_id,
          jobTitle: (job.title as string | null) ?? "Role",
          candidateName,
          candidateEmail,
          scheduledStart: slot.start_at,
          scheduledEnd: slot.end_at,
          timezone: slot.timezone,
          stageName: (stage?.stage_name as string | null) ?? "Interview",
          interviewerEmail: stage?.interviewer_email ?? null,
          interviewerName,
          interviewerUserId,
          feedbackSubmitted: feedbackCount > 0,
          aggregateStatus,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    return jsonSuccess({
      interviews,
      meta: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        cappedAt: 100,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch aggregate interviews", {
      route: "GET /api/interviews/aggregate",
    });
  }
}
