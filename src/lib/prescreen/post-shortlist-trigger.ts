import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { getApprovedJdBase, getGatingQuestions, getSession } from "@/lib/prescreen/repository";

/** Pipeline stage names that count as "shortlisted" for the post-shortlist round. */
export function isShortlistStageName(stageName: string | null | undefined): boolean {
  return /shortlist/i.test(stageName ?? "");
}

/**
 * Start the post-shortlist WhatsApp question round when a candidate is moved into a
 * Shortlisted pipeline stage. Runs at most once per (job, candidate) — the stage-scoped
 * session row is the idempotency record. Fire-and-forget safe: never throws.
 *
 * Both entry paths converge here: it doesn't matter whether the candidate originally
 * applied through the public flow or was uploaded by a recruiter — being shortlisted
 * is the trigger, and answers land in the same Screening review table.
 */
export async function maybeStartPostShortlistScreening(args: {
  jobId: string;
  candidateId: string;
  organisationId: string;
  stageName: string | null | undefined;
}): Promise<void> {
  try {
    if (!isShortlistStageName(args.stageName)) return;

    const admin = createSupabaseAdmin();

    // Once per job+candidate: an existing post-shortlist session (any state) means
    // the round already started or finished.
    const existing = await getSession(admin, args.jobId, args.candidateId, "post_shortlist");
    if (existing?.state === "complete") return;
    if (existing) {
      // Answer guard (mirrors bulk-post-shortlist): resetIncompletePrescreenSession
      // DELETES the session AND its recorded responses. A candidate dragged between
      // shortlist-named stages mid-round would lose every answer and be restarted
      // from question 1. If they have ANY recorded post-shortlist answer, keep the
      // open session — the inbound handler resumes at the first unanswered question
      // and the reminder/re-nudge paths re-engage them. Only truly-unstarted
      // sessions (zero answers) are reset for a fresh invite.
      const jdBase = await getApprovedJdBase(admin, args.jobId);
      const questions = jdBase ? await getGatingQuestions(admin, jdBase.id, "post_shortlist") : [];
      if (questions.length > 0) {
        const { data: answered } = await admin
          .from("prescreen_responses")
          .select("question_id")
          .eq("job_id", args.jobId)
          .eq("candidate_id", args.candidateId)
          .in(
            "question_id",
            questions.map((q) => q.id),
          )
          .limit(1);
        if ((answered ?? []).length > 0) {
          logger.info("[post-shortlist] skipped reset: candidate has recorded answers", {
            jobId: args.jobId,
            candidateId: args.candidateId,
          });
          return;
        }
      }
      const { resetIncompletePrescreenSession } = await import("@/lib/prescreen/reset-session");
      await resetIncompletePrescreenSession(admin, {
        jobId: args.jobId,
        candidateId: args.candidateId,
        stage: "post_shortlist",
      });
    }

    const { data: candidate } = await admin
      .from("candidates")
      .select("phone, name, full_name")
      .eq("id", args.candidateId)
      .maybeSingle();
    const phone = (candidate?.phone as string | null)?.trim() ?? null;
    if (!phone) {
      logger.info("[post-shortlist] skipped: candidate has no phone", {
        jobId: args.jobId,
        candidateId: args.candidateId,
      });
      return;
    }

    const fullName = ((candidate?.full_name ?? candidate?.name) as string | null) ?? "";
    const firstName = fullName.trim().split(/\s+/)[0] || null;

    const { routePrescreenAfterApplication } = await import("@/lib/prescreen/channel-router");
    const outcome = await routePrescreenAfterApplication({
      admin,
      jobId: args.jobId,
      candidateId: args.candidateId,
      organisationId: args.organisationId,
      channel: "whatsapp",
      phone,
      options: {
        stage: "post_shortlist",
        setGatePending: false,
        candidateFirstName: firstName,
        inviteTemplateName: "th_shortlisted",
      },
    });

    logger.info("[post-shortlist] screening trigger evaluated", {
      jobId: args.jobId,
      candidateId: args.candidateId,
      started: outcome.started,
      reason: outcome.started ? undefined : outcome.reason,
    });
  } catch (err) {
    logger.warn("[post-shortlist] trigger failed (non-fatal)", {
      jobId: args.jobId,
      candidateId: args.candidateId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
