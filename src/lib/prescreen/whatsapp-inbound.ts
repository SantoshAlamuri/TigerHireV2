/**
 * WhatsApp inbound routing for the per-channel pre-screen gate.
 *
 * A candidate replying YES/NO to gating questions is routed here. Design invariants:
 *  - Single resolution path: the terminal pass/fail decision always goes through
 *    `resolveGateFromSignals` (the same resolver used by the scoring guard and the
 *    form/CV paths), so channels never diverge.
 *  - First-answer-wins: a question's recorded answer is never overwritten, so a
 *    "yes then no" (or repeated tap) on the same question can never flip the gate.
 *  - Terminal completion: only still-open sessions are acted on; a reply after the
 *    gate has resolved (passed/failed/timeout) is logged-not-applied.
 *  - Non-invasive: only unambiguous YES/NO (non-numeric) words are intercepted, so
 *    STATUS / role-number / handover / free text fall through to the normal handler.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { prescreenDuplicateReplyGuardMs } from "@/lib/prescreen/config";
import { dispatchPrescreenMessage } from "@/lib/prescreen/dispatch";
import {
  finalizeFailed,
  finalizePassed,
  finalizePostShortlistComplete,
} from "@/lib/prescreen/channel-router";
import { resolveGateFromSignals, type GateAnswer } from "@/lib/prescreen/gate";
import { formatQuestionPrompt, parseYesNo } from "@/lib/prescreen/interactive";
import {
  postShortlistIntro,
  screeningUploadIntro,
  prescreenQuestionText,
} from "@/lib/prescreen/messages";
import {
  getActiveWhatsappSession,
  getApprovedJdBase,
  getGatingQuestions,
  getResponses,
  recordResponse,
  setApplicationGate,
  updateSession,
} from "@/lib/prescreen/repository";
import type { PrescreenQuestionRow, PrescreenSession } from "@/lib/prescreen/types";
import { getOrgDisplayName } from "@/lib/screening/org-whatsapp-screening";
import { resolvePhoneIdentity } from "@/lib/whatsapp/resolve-phone-identity";
import { getSessionOrganisationId } from "@/lib/whatsapp/sessions";

async function lookupCandidateId(admin: SupabaseClient, phone: string): Promise<string | null> {
  // Canonical, stable resolution — replaces the old "newest created_at wins" query
  // that let a re-ingested/re-surfaced candidate hijack an active prescreen gate.
  const identity = await resolvePhoneIdentity(admin, phone);
  return identity.candidateId;
}

function toWhatsappAnswers(responses: Array<{ passed: boolean }>): GateAnswer[] {
  return responses.map((r) => ({ passed: r.passed }));
}

/**
 * Resolve the gate through the single shared resolver and finalize if terminal.
 * Returns true when the gate reached a terminal state (passed/failed).
 */
async function maybeFinalize(ctx: {
  admin: SupabaseClient;
  session: PrescreenSession;
  jdBase: { id: string; roleTitle: string };
  questions: PrescreenQuestionRow[];
  responses: Array<{ question_id: string; passed: boolean }>;
  phone: string;
}): Promise<boolean> {
  const { admin, session, jdBase, questions, responses, phone } = ctx;

  const questionIds = new Set(questions.map((q) => q.id));
  const stageResponses = responses.filter((r) => questionIds.has(r.question_id));
  const result = resolveGateFromSignals({
    whatsappAnswers: toWhatsappAnswers(stageResponses),
  });

  // Any NO short-circuits to a gate-out immediately (no further questions, no LLM cost).
  if (result.status === "failed") {
    await finalizeFailed({
      admin,
      jobId: session.job_id,
      candidateId: session.candidate_id,
      reason: result.reason,
      sessionId: session.id,
      roleTitle: jdBase.roleTitle,
      channel: session.channel,
      phone,
    });
    return true;
  }

  const answeredIds = new Set(stageResponses.map((r) => r.question_id));
  const allAnswered = questions.length > 0 && questions.every((q) => answeredIds.has(q.id));
  if (!allAnswered) return false;

  if (session.stage === "post_shortlist") {
    await finalizePostShortlistComplete({
      admin,
      sessionId: session.id,
      roleTitle: jdBase.roleTitle,
      channel: session.channel,
      phone,
    });
    return true;
  }

  await finalizePassed({
    admin,
    jobId: session.job_id,
    candidateId: session.candidate_id,
    sessionId: session.id,
    roleTitle: jdBase.roleTitle,
    channel: session.channel,
    phone,
  });
  return true;
}

/**
 * Handle a candidate's inbound WhatsApp reply against an active prescreen gate.
 * Returns true when the reply was consumed by the gate (caller should stop routing),
 * false to let the normal WhatsApp state machine handle it.
 */
export async function handlePrescreenWhatsappReply(args: {
  phone: string;
  body: string;
  candidateId?: string;
}): Promise<boolean> {
  const body = (args.body ?? "").trim();
  if (!body) return false;

  const isPureDigits = /^\d+$/.test(body);
  const answer = parseYesNo(body);

  const admin = createSupabaseAdmin();

  const candidateId = args.candidateId ?? (await lookupCandidateId(admin, args.phone));
  if (!candidateId) return false;

  const preferOrgId = await getSessionOrganisationId(args.phone);
  const session = await getActiveWhatsappSession(admin, candidateId, { preferOrgId });
  if (!session) return false; // no open gate -> normal flow (resolved gates are terminal)

  // While answering questions, only intercept unambiguous YES/NO words. Pure digits
  // (role-number selection in the scored flow) and anything ambiguous fall through to
  // the normal handler. `awaiting_consent` is exempt: any engagement counts (below).
  if (session.state !== "awaiting_consent" && (isPureDigits || answer === null)) {
    return false;
  }

  const jobId = session.job_id;
  const jdBase = await getApprovedJdBase(admin, jobId);
  if (!jdBase) {
    // Open session but JD base went away/unapproved: we still own this YES/NO so it
    // doesn't get mis-handled by the normal flow; the lifecycle timeout will resolve it.
    logger.warn("[prescreen-inbound] open session without approved JD base; deferring to timeout", {
      sessionId: session.id,
      jobId,
    });
    return true;
  }

  const questions = await getGatingQuestions(admin, jdBase.id, session.stage);
  if (questions.length === 0) {
    // Defensive: session opened but its questions were removed. Post-shortlist rounds
    // just close quietly; apply rounds pass through the resolver (passed).
    if (session.stage === "post_shortlist") {
      await updateSession(admin, session.id, {
        state: "complete",
        completed_at: new Date().toISOString(),
      });
      return true;
    }
    await finalizePassed({
      admin,
      jobId,
      candidateId,
      sessionId: session.id,
      roleTitle: jdBase.roleTitle,
      channel: session.channel,
      phone: args.phone,
    });
    return true;
  }

  // Consent gate: the candidate got the first-contact template (cold number) and this
  // reply — whatever it says — opens the 24h window, so the intro + first question can
  // go out as session text. Only an explicit NO declines; anything else starts screening.
  if (session.state === "awaiting_consent") {
    // A bare digit ("2") is ambiguous here (could be a role-number tap) — treat it as
    // engagement rather than a decline; only an explicit NO-word declines.
    const declined = answer === false && !isPureDigits;
    if (!declined) {
      // Resume at the first UNANSWERED question, not blindly at questions[0]:
      // re-nudged partial responders (renudge reopens the session as
      // awaiting_consent while their earlier answers are preserved) would
      // otherwise be shown Q1 again while the record path attributes their
      // reply to the first unanswered question — a misattribution.
      const existingResponses = await getResponses(admin, jobId, candidateId);
      const questionIdSet = new Set(questions.map((q) => q.id));
      const answeredIds = new Set(
        existingResponses.filter((r) => questionIdSet.has(r.question_id)).map((r) => r.question_id),
      );
      const resumeIndex = questions.findIndex((q) => !answeredIds.has(q.id));

      // Terminal already? (all answered, or a knockout NO on record) —
      // resolve through the shared resolver instead of prompting anything.
      if (answeredIds.size > 0) {
        const terminal = await maybeFinalize({
          admin,
          session,
          jdBase,
          questions,
          responses: existingResponses,
          phone: args.phone,
        });
        if (terminal || resumeIndex === -1) return true;
      }

      const { data: jobRow } = await admin
        .from("jobs")
        .select("organisation_id")
        .eq("id", jobId)
        .maybeSingle();
      const orgId = (jobRow as { organisation_id?: string | null } | null)?.organisation_id;
      const companyName = orgId ? await getOrgDisplayName(admin, orgId) : "the hiring team";
      const introParams = {
        companyName,
        jobTitle: jdBase.roleTitle,
        totalQuestions: questions.length,
      };
      const intro =
        session.stage === "post_shortlist"
          ? postShortlistIntro(introParams)
          : screeningUploadIntro(introParams);
      await updateSession(admin, session.id, {
        state: "awaiting_reply",
        current_question_index: resumeIndex,
        questions_sent_at: new Date().toISOString(),
      });
      await dispatchPrescreenMessage(
        { channel: session.channel, phone: args.phone },
        `${intro}\n\n${prescreenQuestionText(
          resumeIndex,
          questions.length,
          questions[resumeIndex].question_text,
        )}`,
      );
      logger.info("[prescreen-inbound] consent granted; questions sent", {
        sessionId: session.id,
        jobId,
        resumeIndex,
      });
    } else {
      // Declined screening: close the session. Apply rounds mark unanswered
      // must-haves unverified; post-shortlist rounds never touch the gate.
      // `declined_at` distinguishes this explicit opt-out from a timeout so the
      // re-nudge path never re-invites a candidate who said NO.
      const declinedAtIso = new Date().toISOString();
      await updateSession(admin, session.id, {
        state: "complete",
        completed_at: declinedAtIso,
        declined_at: declinedAtIso,
      });
      if (session.stage !== "post_shortlist") {
        await setApplicationGate(admin, {
          jobId,
          candidateId,
          gateStatus: "unverified",
          unverifiedMustHaves: questions.map((q) => q.question_text),
        });
      }
      await dispatchPrescreenMessage(
        { channel: session.channel, phone: args.phone },
        `No problem — we'll review your profile as-is for ${jdBase.roleTitle}. Reply here anytime if you change your mind.`,
      );
      logger.info("[prescreen-inbound] consent declined; gate unverified", {
        sessionId: session.id,
        jobId,
      });
    }
    return true;
  }

  // Narrow for TS: past this point the state guard above ensures a real YES/NO.
  if (answer === null) return false;

  // Rapid duplicate / double-tap guard: ignore a reply landing immediately after the
  // previously accepted answer so a single tap can't auto-fill the next unseen question.
  const sinceUpdateMs = Date.now() - Date.parse(session.updated_at);
  if (
    Number.isFinite(sinceUpdateMs) &&
    sinceUpdateMs >= 0 &&
    sinceUpdateMs < prescreenDuplicateReplyGuardMs()
  ) {
    logger.info("[prescreen-inbound] ignoring rapid duplicate reply", {
      sessionId: session.id,
      sinceUpdateMs,
    });
    return true;
  }

  // Position is driven by which questions already have a recorded answer
  // (first-answer-wins), not by trusting a single counter.
  const existing = await getResponses(admin, jobId, candidateId);
  const answeredIds = new Set(existing.map((r) => r.question_id));
  const targetIndex = questions.findIndex((q) => !answeredIds.has(q.id));

  if (targetIndex === -1) {
    // Everything already answered but session still open -> resolve now.
    await maybeFinalize({
      admin,
      session,
      jdBase,
      questions,
      responses: existing,
      phone: args.phone,
    });
    return true;
  }

  const targetQ = questions[targetIndex];

  // Record this answer for the current question. `recordResponse` upserts on
  // (candidate, job, question), and we only reach here for an UNanswered question,
  // so an answered question is never overwritten -> no flip-flop.
  await recordResponse(admin, {
    jobId,
    candidateId,
    questionId: targetQ.id,
    answer: body,
    passed: answer,
  });

  // The answer is recorded: from here on this message BELONGS to the gate. A
  // failure while finalizing or prompting the next question must not fall
  // through to the general state machine (double-handling sent Anish the
  // "send me your CV" flow mid-questionnaire on prod, 2026-07-07) — the
  // reminder sweep re-prompts if the next question never went out.
  try {
    const updated = await getResponses(admin, jobId, candidateId);

    // Terminal? (NO anywhere -> failed; all answered -> passed.) Single resolver path.
    if (
      await maybeFinalize({
        admin,
        session,
        jdBase,
        questions,
        responses: updated,
        phone: args.phone,
      })
    ) {
      return true;
    }

    // Not terminal: advance to the next unanswered question and prompt it.
    const nextAnswered = new Set(updated.map((r) => r.question_id));
    const nextIndex = questions.findIndex((q) => !nextAnswered.has(q.id));
    await updateSession(admin, session.id, {
      state: "awaiting_reply",
      current_question_index: nextIndex >= 0 ? nextIndex : questions.length,
    });
    const prompt = formatQuestionPrompt(questions, nextIndex);
    if (prompt) {
      await dispatchPrescreenMessage({ channel: session.channel, phone: args.phone }, prompt);
    }
  } catch (err) {
    logger.warn("[prescreen-inbound] post-record step failed; answer kept, reply consumed", {
      sessionId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return true;
}
/**
 * When the general WhatsApp state machine is about to send an "unclear input"
 * fallback, prefer re-prompting an open prescreen questionnaire instead —
 * otherwise CV-intake chatter derails candidates mid-round (prod, Anish,
 * 2026-07-07/08). Returns true when a re-prompt was sent (caller should skip
 * its fallback reply).
 */
export async function repromptOpenPrescreenQuestion(phone: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdmin();
    const candidateId = await lookupCandidateId(admin, phone);
    if (!candidateId) return false;
    const preferOrgId = await getSessionOrganisationId(phone);
    const session = await getActiveWhatsappSession(admin, candidateId, { preferOrgId });
    if (!session) return false;

    const jdBase = await getApprovedJdBase(admin, session.job_id);
    if (!jdBase) return false;
    const questions = await getGatingQuestions(admin, jdBase.id, session.stage);
    if (questions.length === 0) return false;

    if (session.state === "awaiting_consent") {
      await dispatchPrescreenMessage(
        { channel: session.channel, phone },
        `Quick one before anything else — you were shortlisted for ${jdBase.roleTitle}. Reply YES to answer ${questions.length} short screening questions, or NO to opt out.`,
      );
      return true;
    }

    const answered = await getResponses(admin, session.job_id, candidateId);
    const answeredIds = new Set(answered.map((r) => r.question_id));
    const nextIndex = questions.findIndex((q) => !answeredIds.has(q.id));
    if (nextIndex < 0) return false;
    const prompt = formatQuestionPrompt(questions, nextIndex);
    if (!prompt) return false;
    await dispatchPrescreenMessage({ channel: session.channel, phone }, prompt);
    return true;
  } catch (err) {
    logger.warn("[prescreen-inbound] reprompt check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
