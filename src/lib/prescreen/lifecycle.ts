import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { prescreenReminderHours, prescreenTimeoutHours } from "@/lib/prescreen/config";
import { dispatchPrescreenMessage } from "@/lib/prescreen/dispatch";
import { finalizeTimeout } from "@/lib/prescreen/channel-router";
import {
  postShortlistConsentReminder,
  postShortlistQuestionReminder,
  postShortlistTimeoutAck,
  prescreenConsentReminder,
  prescreenReminder,
} from "@/lib/prescreen/messages";
import {
  getApprovedJdBase,
  getGatingQuestions,
  getSessionById,
  updateSession,
} from "@/lib/prescreen/repository";
import { getOrgDisplayName } from "@/lib/screening/org-whatsapp-screening";
import { sendTemplateMessage } from "@/lib/services/whatsapp";
import type { PrescreenChannel } from "@/lib/prescreen/types";

export type PrescreenLifecyclePayload = {
  sessionId: string;
  jobId: string;
  candidateId: string;
  organisationId?: string | null;
  jdBaseDocumentId: string;
  channel: PrescreenChannel;
  phone?: string | null;
  questionsSentAtIso: string;
};

function addHoursIso(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

export function reminderDueAt(questionsSentAtIso: string): string {
  return addHoursIso(questionsSentAtIso, prescreenReminderHours());
}

export function timeoutDueAt(questionsSentAtIso: string): string {
  return addHoursIso(questionsSentAtIso, prescreenTimeoutHours());
}

/**
 * A lifecycle event belongs to the round that scheduled it. When a session is
 * re-invited (re-nudge, resend), questions_sent_at moves forward and any timer
 * from the previous round must no-op instead of reminding/timing-out the new
 * round. Compare as timestamps: the same instant can serialize differently.
 */
function isStaleLifecycleEvent(
  session: { questions_sent_at: string | null },
  payload: PrescreenLifecyclePayload,
): boolean {
  if (!session.questions_sent_at || !payload.questionsSentAtIso) return false;
  return (
    new Date(session.questions_sent_at).getTime() !== new Date(payload.questionsSentAtIso).getTime()
  );
}

async function resolveRoleTitle(admin: ReturnType<typeof createSupabaseAdmin>, jobId: string) {
  const jdBase = await getApprovedJdBase(admin, jobId);
  return jdBase?.roleTitle ?? "this role";
}

/**
 * Free-form reminders only deliver inside Meta's 24h reply window. When that
 * send fails (cold number, throttling), fall back to the approved stage
 * template so the nudge still reaches the candidate's phone.
 */
async function sendReminderTemplateFallback(
  admin: ReturnType<typeof createSupabaseAdmin>,
  payload: PrescreenLifecyclePayload,
  stage: string,
  roleTitle: string,
): Promise<boolean> {
  const phone = payload.phone?.trim();
  if (!phone) return false;

  const { data: candidate } = await admin
    .from("candidates")
    .select("full_name, name")
    .eq("id", payload.candidateId)
    .maybeSingle();
  const fullName = ((candidate?.full_name ?? candidate?.name ?? "") as string).trim();
  const firstName = fullName.split(/\s+/)[0] || "there";
  const companyName = payload.organisationId
    ? await getOrgDisplayName(admin, payload.organisationId)
    : "the hiring team";

  const res = await sendTemplateMessage({
    phoneNumber: phone,
    templateName: stage === "post_shortlist" ? "th_shortlisted" : "th_application_received",
    languageCode: "en",
    bodyParams: [firstName, roleTitle, companyName],
  });
  return res.success;
}

/** Send a single reminder if the candidate hasn't completed the gate. */
export async function processPrescreenReminder(
  payload: PrescreenLifecyclePayload,
): Promise<{ sent: boolean }> {
  const admin = createSupabaseAdmin();
  const session = await getSessionById(admin, payload.sessionId);
  if (!session || session.state === "complete") return { sent: false };
  if (session.reminder_sent_at) return { sent: false };
  if (isStaleLifecycleEvent(session, payload)) {
    logger.info("[prescreen] skipping stale reminder from a previous round", {
      sessionId: session.id,
      scheduledFor: payload.questionsSentAtIso,
      currentRound: session.questions_sent_at,
    });
    return { sent: false };
  }

  const roleTitle = await resolveRoleTitle(admin, payload.jobId);
  // awaiting_consent means no question has been sent yet — the reminder must
  // ask for consent (not "reply to the previous question") on BOTH stages.
  let body: string;
  if (session.state === "awaiting_consent") {
    if (session.stage === "post_shortlist") {
      // The consent reminder quotes the question count — use the real one.
      const questions = await getGatingQuestions(admin, payload.jdBaseDocumentId, "post_shortlist");
      body = postShortlistConsentReminder(roleTitle, questions.length);
    } else {
      body = prescreenConsentReminder(roleTitle);
    }
  } else {
    body =
      session.stage === "post_shortlist"
        ? postShortlistQuestionReminder(roleTitle)
        : prescreenReminder(roleTitle);
  }

  const delivered = await dispatchPrescreenMessage(
    { channel: payload.channel, phone: payload.phone },
    body,
  );
  if (!delivered) {
    const templateSent = await sendReminderTemplateFallback(
      admin,
      payload,
      session.stage,
      roleTitle,
    );
    if (!templateSent) {
      // Leave state and reminder_sent_at untouched so the cron sweep
      // (reminder_sent_at IS NULL) retries on its next run instead of
      // recording a reminder that never reached the candidate.
      logger.warn("[prescreen] reminder dispatch failed; will retry on next sweep", {
        sessionId: session.id,
        stage: session.stage,
        priorState: session.state,
        channel: payload.channel,
      });
      return { sent: false };
    }
    // Template invites ask the candidate to reply to continue, so route the
    // reply through the consent branch (which resumes at the first
    // unanswered question) rather than treating it as a question answer.
    await updateSession(admin, session.id, {
      state: "awaiting_consent",
      reminder_sent_at: new Date().toISOString(),
    });
    logger.info("[prescreen] reminder sent via template fallback", {
      sessionId: session.id,
      stage: session.stage,
      priorState: session.state,
    });
    return { sent: true };
  }
  // Preserve awaiting_consent: flipping it to "reminded" made the candidate's
  // eventual YES land in the answer-recording path (recorded against the first
  // unanswered question) instead of the consent branch.
  await updateSession(admin, session.id, {
    state: session.state === "awaiting_consent" ? "awaiting_consent" : "reminded",
    reminder_sent_at: new Date().toISOString(),
  });
  logger.info("[prescreen] reminder sent", {
    sessionId: session.id,
    stage: session.stage,
    priorState: session.state,
  });
  return { sent: true };
}

/** Force-resolve the gate as unverified if still open at timeout. */
export async function processPrescreenTimeout(
  payload: PrescreenLifecyclePayload,
): Promise<{ resolved: boolean }> {
  const admin = createSupabaseAdmin();
  const session = await getSessionById(admin, payload.sessionId);
  if (!session || session.state === "complete") return { resolved: false };
  if (isStaleLifecycleEvent(session, payload)) {
    logger.info("[prescreen] skipping stale timeout from a previous round", {
      sessionId: session.id,
      scheduledFor: payload.questionsSentAtIso,
      currentRound: session.questions_sent_at,
    });
    return { resolved: false };
  }

  if (session.stage === "post_shortlist") {
    const roleTitle = await resolveRoleTitle(admin, payload.jobId);
    await updateSession(admin, session.id, {
      state: "complete",
      completed_at: new Date().toISOString(),
    });
    await dispatchPrescreenMessage(
      { channel: payload.channel, phone: payload.phone },
      postShortlistTimeoutAck(roleTitle),
    );
    logger.info("[prescreen] post-shortlist timed out (no gate change)", {
      sessionId: session.id,
    });
    return { resolved: true };
  }

  await finalizeTimeout({
    admin,
    jobId: payload.jobId,
    candidateId: payload.candidateId,
    jdBaseDocumentId: payload.jdBaseDocumentId,
    sessionId: session.id,
    channel: payload.channel,
    phone: payload.phone,
  });
  logger.info("[prescreen] gate timed out -> unverified", { sessionId: session.id });
  return { resolved: true };
}
