import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueue } from "@/lib/jobs/queue";
import { logger } from "@/lib/observability/logger";
import { sendTemplateMessage } from "@/lib/services/whatsapp";
import { canSendWhatsApp } from "@/lib/whatsapp/outbound-policy";
import { isPrescreenGateEnabled } from "@/lib/prescreen/flag";
import { dispatchPrescreenMessage } from "@/lib/prescreen/dispatch";
import {
  postShortlistIntro,
  prescreenFailed,
  prescreenPassed,
  prescreenQuestionText,
  prescreenTimeoutAck,
  screeningUploadIntro,
} from "@/lib/prescreen/messages";
import {
  ensureSession,
  getApprovedJdBase,
  getGatingQuestions,
  setApplicationGate,
  updateSession,
} from "@/lib/prescreen/repository";
import { schedulePrescreenLifecycle } from "@/lib/prescreen/schedule-lifecycle";
import { saveGatedFitScore } from "@/lib/prescreen/save-gated";
import type {
  PrescreenChannel,
  PrescreenSessionState,
  PrescreenStage,
} from "@/lib/prescreen/types";
import { getOrgDisplayName } from "@/lib/screening/org-whatsapp-screening";

/** Meta UTILITY template for post-shortlist first contact (explicit YES/NO consent). */
export type PostShortlistInviteTemplateName =
  | "th_shortlist_screening"
  | "th_shortlisted"
  | "th_application_received";

export function resolvePostShortlistInviteTemplate(
  override?: PostShortlistInviteTemplateName,
): PostShortlistInviteTemplateName {
  if (override) return override;
  const envName = process.env.WHATSAPP_POST_SHORTLIST_INVITE_TEMPLATE?.trim();
  if (
    envName === "th_shortlisted" ||
    envName === "th_application_received" ||
    envName === "th_shortlist_screening"
  ) {
    return envName;
  }
  return "th_shortlist_screening";
}

export type RouteOutcome =
  | { started: true; sessionId: string; questionCount: number; mode?: "session" | "invite" }
  | { started: false; reason: "flag_off" | "no_questions" | "no_jd_base" | "invite_send_failed" };

export type RoutePrescreenOptions = {
  /** When false, send WhatsApp only (pilot/backfill) without blocking scoring. Default true. */
  setGatePending?: boolean;
  candidateFirstName?: string | null;
  /**
   * Meta UTILITY template used for first contact on cold numbers (no open 24h window).
   * Must take exactly 3 body params: [first name, role title, company name].
   * Meta suppresses MARKETING-category templates to cold numbers (error 131049),
   * so only genuine UTILITY templates (e.g. th_application_received, th_shortlist_screening)
   * actually get delivered. Default: th_application_received (apply) or th_shortlist_screening.
   */
  inviteTemplateName?: PostShortlistInviteTemplateName;
  /**
   * Which question set to run. "apply" (default) is the knockout pre-screen and can
   * gate the candidate out; "post_shortlist" asks every question, records answers,
   * and never touches gate_status or FitScore.
   */
  stage?: PrescreenStage;
};

/**
 * Start the per-channel prescreen gate after an application arrives.
 * No-op (returns started:false) when org screening mode is off, no approved JD base, or no gating questions.
 */
export async function routePrescreenAfterApplication(params: {
  admin: SupabaseClient;
  jobId: string;
  candidateId: string;
  applicationId?: string | null;
  organisationId?: string | null;
  channel: PrescreenChannel;
  phone?: string | null;
  options?: RoutePrescreenOptions;
}): Promise<RouteOutcome> {
  const { admin, jobId, candidateId, channel } = params;
  const stage = params.options?.stage ?? "apply";
  // Post-shortlist rounds never block scoring — the candidate is already scored.
  const setGatePending = stage === "apply" && params.options?.setGatePending !== false;
  const scheduleLifecycle = setGatePending || stage === "post_shortlist";

  if (!(await isPrescreenGateEnabled(params.organisationId))) {
    return { started: false, reason: "flag_off" };
  }

  const jdBase = await getApprovedJdBase(admin, jobId);
  if (!jdBase) return { started: false, reason: "no_jd_base" };

  const questions = await getGatingQuestions(admin, jdBase.id, stage);
  if (questions.length === 0) return { started: false, reason: "no_questions" };

  if (setGatePending) {
    await setApplicationGate(admin, { jobId, candidateId, gateStatus: "pending" });
  }

  const session = await ensureSession(admin, {
    jobId,
    candidateId,
    applicationId: params.applicationId ?? null,
    channel,
    stage,
  });

  const companyName = params.organisationId
    ? await getOrgDisplayName(admin, params.organisationId)
    : "the hiring team";

  // Cold WhatsApp numbers (no open 24h session window) can't receive free-form
  // session text. Send the approved `th_screening_invite` template first; the
  // inbound handler sends the actual questions once the candidate replies YES.
  const isPhoneChannel = (channel === "whatsapp" || channel === "board") && Boolean(params.phone);
  if (isPhoneChannel) {
    const sessionPolicy = await canSendWhatsApp({
      phone: params.phone as string,
      purpose: "session_text",
    });
    if (!sessionPolicy.allowed) {
      const defaultInvite =
        stage === "post_shortlist"
          ? resolvePostShortlistInviteTemplate()
          : "th_application_received";
      const invite = await sendTemplateMessage({
        phoneNumber: params.phone as string,
        templateName:
          stage === "post_shortlist"
            ? resolvePostShortlistInviteTemplate(params.options?.inviteTemplateName)
            : (params.options?.inviteTemplateName ?? defaultInvite),
        languageCode: "en",
        bodyParams: [
          params.options?.candidateFirstName?.trim() || "there",
          jdBase.roleTitle,
          companyName,
        ],
        applicationId: params.applicationId ?? undefined,
      });
      if (!invite.success) {
        logger.warn("[prescreen] screening invite template send failed", {
          jobId,
          candidateId,
          error: invite.error,
        });
        return { started: false, reason: "invite_send_failed" };
      }
      const inviteSentAtIso = new Date().toISOString();
      await updateSession(admin, session.id, {
        state: "awaiting_consent",
        current_question_index: 0,
        questions_sent_at: inviteSentAtIso,
      });
      if (scheduleLifecycle) {
        await schedulePrescreenLifecycle({
          sessionId: session.id,
          jobId,
          candidateId,
          organisationId: params.organisationId ?? null,
          jdBaseDocumentId: jdBase.id,
          channel,
          phone: params.phone ?? null,
          questionsSentAtIso: inviteSentAtIso,
        });
      }
      logger.info("[prescreen] screening invite sent (awaiting consent)", {
        jobId,
        candidateId,
        questionCount: questions.length,
      });
      return {
        started: true,
        sessionId: session.id,
        questionCount: questions.length,
        mode: "invite",
      };
    }
  }

  const nowIso = new Date().toISOString();
  await updateSession(admin, session.id, {
    state: "awaiting_reply",
    current_question_index: 0,
    questions_sent_at: nowIso,
  });

  const intro =
    stage === "post_shortlist"
      ? postShortlistIntro({
          companyName,
          jobTitle: jdBase.roleTitle,
          totalQuestions: questions.length,
          candidateFirstName: params.options?.candidateFirstName,
        })
      : screeningUploadIntro({
          companyName,
          jobTitle: jdBase.roleTitle,
          totalQuestions: questions.length,
          candidateFirstName: params.options?.candidateFirstName,
        });

  await dispatchPrescreenMessage(
    { channel, phone: params.phone },
    `${intro}\n\n${prescreenQuestionText(0, questions.length, questions[0].question_text)}`,
  );

  if (scheduleLifecycle) {
    await schedulePrescreenLifecycle({
      sessionId: session.id,
      jobId,
      candidateId,
      organisationId: params.organisationId ?? null,
      jdBaseDocumentId: jdBase.id,
      channel,
      phone: params.phone ?? null,
      questionsSentAtIso: nowIso,
    });
  }

  logger.info("[prescreen] gate started", {
    jobId,
    candidateId,
    channel,
    questionCount: questions.length,
    setGatePending,
    scheduleLifecycle,
  });

  return { started: true, sessionId: session.id, questionCount: questions.length };
}

/** Post-shortlist round finished with every gating answer YES (no gate change). */
export async function finalizePostShortlistComplete(params: {
  admin: SupabaseClient;
  sessionId: string;
  roleTitle?: string;
  channel: PrescreenChannel;
  phone?: string | null;
}): Promise<void> {
  await updateSession(params.admin, params.sessionId, {
    state: "complete",
    completed_at: new Date().toISOString(),
  });
  const { postShortlistComplete } = await import("@/lib/prescreen/messages");
  await dispatchPrescreenMessage(
    { channel: params.channel, phone: params.phone },
    postShortlistComplete(params.roleTitle ?? "this role"),
  );
}

/** Candidate passed every gating question -> allow scoring. */
export async function finalizePassed(params: {
  admin: SupabaseClient;
  jobId: string;
  candidateId: string;
  sessionId?: string | null;
  roleTitle?: string;
  channel: PrescreenChannel;
  phone?: string | null;
}): Promise<void> {
  const { admin, jobId, candidateId } = params;
  await setApplicationGate(admin, { jobId, candidateId, gateStatus: "passed" });
  if (params.sessionId) {
    await updateSession(admin, params.sessionId, {
      state: "complete",
      completed_at: new Date().toISOString(),
    });
  }
  await dispatchPrescreenMessage(
    { channel: params.channel, phone: params.phone },
    prescreenPassed(params.roleTitle ?? "this role"),
  );
  await enqueue(
    "fit-score-single",
    { jobId, candidateId },
    { id: `prescreen-pass-score:${jobId}:${candidateId}` },
  );
}

/** Candidate answered No to a must-have -> gate out without LLM scoring. */
export async function finalizeFailed(params: {
  admin: SupabaseClient;
  jobId: string;
  candidateId: string;
  reason: string;
  sessionId?: string | null;
  roleTitle?: string;
  channel: PrescreenChannel;
  phone?: string | null;
}): Promise<void> {
  const { admin, jobId, candidateId } = params;
  await setApplicationGate(admin, { jobId, candidateId, gateStatus: "failed" });
  if (params.sessionId) {
    await updateSession(admin, params.sessionId, {
      state: "complete",
      completed_at: new Date().toISOString(),
    });
  }
  await saveGatedFitScore(admin, {
    job_id: jobId,
    candidate_id: candidateId,
    reason: params.reason,
  });
  await dispatchPrescreenMessage(
    { channel: params.channel, phone: params.phone },
    prescreenFailed(params.roleTitle ?? "this role"),
  );
}

/** Timeout (or sweep): score anyway, mark unanswered must-haves unverified. */
export async function finalizeTimeout(params: {
  admin: SupabaseClient;
  jobId: string;
  candidateId: string;
  jdBaseDocumentId: string;
  sessionId?: string | null;
  roleTitle?: string;
  channel: PrescreenChannel;
  phone?: string | null;
}): Promise<void> {
  const { admin, jobId, candidateId, jdBaseDocumentId } = params;

  const questions = await getGatingQuestions(admin, jdBaseDocumentId);
  const { data: responses } = await admin
    .from("prescreen_responses")
    .select("question_id, passed")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId);
  const passedQ = new Set((responses ?? []).filter((r) => r.passed).map((r) => r.question_id));

  const unansweredReqIds = questions
    .filter((q) => !passedQ.has(q.id) && q.requirement_id)
    .map((q) => q.requirement_id as string);

  let unverified: string[] = questions
    .filter((q) => !passedQ.has(q.id))
    .map((q) => q.question_text);
  if (unansweredReqIds.length > 0) {
    const { data: reqs } = await admin
      .from("jd_requirements")
      .select("id, text")
      .in("id", unansweredReqIds);
    if (reqs?.length) unverified = reqs.map((r) => r.text as string);
  }

  await setApplicationGate(admin, {
    jobId,
    candidateId,
    gateStatus: "unverified",
    unverifiedMustHaves: unverified,
  });
  if (params.sessionId) {
    await updateSession(admin, params.sessionId, {
      state: "complete",
      completed_at: new Date().toISOString(),
    });
  }
  await dispatchPrescreenMessage(
    { channel: params.channel, phone: params.phone },
    prescreenTimeoutAck(params.roleTitle ?? "this role"),
  );
  await enqueue(
    "fit-score-single",
    { jobId, candidateId },
    { id: `prescreen-timeout-score:${jobId}:${candidateId}` },
  );
}
