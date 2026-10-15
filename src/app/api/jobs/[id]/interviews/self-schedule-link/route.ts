import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { publicAppOrigin } from "@/lib/referrers/referral-link-mint";
import { createSelfScheduleLink } from "@/lib/interviews/create-self-schedule-link";
import { sendSelfScheduleLinkEmail } from "@/lib/interviews/send-self-schedule-link-email";

const ROLES = ["super_admin", "leadership", "recruiter", "agency", "hiring_manager"] as const;

const bodySchema = z
  .object({
    /** Omit for a job-wide link: the first person to book wins; they pick their pipeline row on the public page. */
    pipeline_candidate_id: z.string().uuid().optional(),
    expiresInHours: z.number().int().min(1).max(336).optional(),
    /** When true with `pipeline_candidate_id`, emails the candidate the scheduling link. */
    sendEmail: z.boolean().optional(),
  })
  .strict();

/**
 * POST /api/jobs/[id]/interviews/self-schedule-link
 * Creates a public (no-login) self-schedule URL. With `pipeline_candidate_id`, the link is for that
 * row only; without it, the link is job-wide (first successful booking consumes the link).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const parsed = await parseJsonBody(request, "POST self-schedule-link");
    if (parsed.errorResponse) return parsed.errorResponse;
    const body = bodySchema.safeParse(parsed.body);
    if (!body.success) {
      return jsonError(body.error.issues.map((i) => i.message).join("; "), 422);
    }

    const admin = createSupabaseAdmin();
    const pcId = body.data.pipeline_candidate_id;
    if (body.data.sendEmail && !pcId) {
      return jsonError("sendEmail requires pipeline_candidate_id (one candidate per link)", 422);
    }

    if (pcId) {
      const { data: pc, error: pcErr } = await admin
        .from("pipeline_candidates")
        .select("id, job_id")
        .eq("id", pcId)
        .eq("job_id", jobId)
        .single();

      if (pcErr || !pc) {
        return jsonError("Pipeline candidate not found for this job", 404);
      }
    }

    let link: Awaited<ReturnType<typeof createSelfScheduleLink>>;
    try {
      link = await createSelfScheduleLink({
        admin,
        jobId,
        pipelineCandidateId: pcId ?? null,
        expiresInHours: body.data.expiresInHours,
        createdBy: ctx.userId,
        baseUrl: publicAppOrigin(request),
      });
    } catch (e) {
      logger.error("self-schedule-link insert failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      return jsonError("Could not create schedule link", 500);
    }

    let emailDelivery: { sent: boolean; reason?: string } | undefined;
    if (body.data.sendEmail && pcId) {
      emailDelivery = await sendSelfScheduleLinkEmail({
        admin,
        jobId,
        pipelineCandidateId: pcId,
        scheduleUrl: link.url,
        expiresAt: link.expiresAt,
      });
      if (!emailDelivery.sent) {
        return jsonSuccess({
          url: link.url,
          expiresAt: link.expiresAt,
          candidateSpecific: link.candidateSpecific,
          emailSent: false,
          emailError: emailDelivery.reason ?? "Email not sent",
        });
      }
    }

    return jsonSuccess({
      url: link.url,
      expiresAt: link.expiresAt,
      candidateSpecific: link.candidateSpecific,
      ...(emailDelivery
        ? {
            emailSent: emailDelivery.sent,
            ...(emailDelivery.reason ? { emailNotice: emailDelivery.reason } : {}),
          }
        : {}),
    });
  } catch (e) {
    return handleApiError(e, "Failed to create self-schedule link", {
      route: "POST /api/jobs/[id]/interviews/self-schedule-link",
    });
  }
}
