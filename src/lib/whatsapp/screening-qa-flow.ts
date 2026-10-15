/**
 * WhatsApp collection of the canonical per-job screening questions
 * (`job_screening_questions`) during the guided apply flow.
 *
 * This mirrors the web-apply behavior: questions must be ANSWERED and the answers
 * must MATCH the expected answer (`fail_on_yes`) before a candidate is scored.
 *   - knockout (an answer violates fail_on_yes) -> candidate is told they don't
 *     meet a requirement, is NOT scored, and is NOT advanced into scoring.
 *   - all answered + match -> proceed to score the chosen role.
 *   - still answering -> stay in the `screening_questions` session state.
 *
 * Answers are written to `application_screening_answers` via the existing writer,
 * so the always-on canonical gate in FitScoreService.computeSingle sees them.
 */

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  evaluateScreeningAnswers,
  fetchActiveScreeningQuestions,
  type JobScreeningQuestionRow,
  type ScreeningAnswerItem,
} from "@/lib/screening/job-screening";
import { upsertApplicationScreeningAnswers } from "@/lib/screening/application-screening-answers";
import { parseYesNo, parseOptionReply } from "@/lib/prescreen/interactive";
import { screeningQuestionText, screeningUploadIntro } from "@/lib/prescreen/messages";

/** Candidate-facing option labels for a single_select question (null for yes_no). */
function optionLabelsFor(q: JobScreeningQuestionRow): string[] | null {
  return q.answer_type === "single_select" ? (q.options ?? []).map((o) => o.label) : null;
}
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { sendTemplateWithFallback } from "@/lib/whatsapp/template-send-fallback";
import { logger } from "@/lib/observability/logger";
import { withSessionCAS, type WhatsAppSession } from "./sessions";
import {
  getOrgDisplayName,
  isOrgWhatsappScreeningEnabled,
} from "@/lib/screening/org-whatsapp-screening";

/** Candidate-facing knockout copy (mirrors evaluateScreeningAnswers' knockout message). */
const KNOCKOUT_MESSAGE =
  "Based on your answers, you do not meet a minimum requirement for this role. You have not been added to the pipeline for this job. If you answered by mistake, reply RESTART to redo the questions.";

type ScreeningQaContext = Record<string, unknown> & {
  candidate_id?: string;
  screening_job_id?: string;
  screening_application_id?: string;
};

/**
 * Whether a screening kickoff for `incomingApplicationId` must be DEFERRED
 * because the session is already actively collecting answers for a DIFFERENT
 * application.
 *
 * Screening answers are stored per-application, but the session context holds a
 * single pointer to the active screening. Overwriting that pointer mid-flow
 * (e.g. a second org uploads the same candidate's CV) would record the
 * candidate's next reply against the WRONG application and orphan the first
 * flow. Keying by (phone, application) means: never clobber an in-progress
 * screening for another application. (#340)
 */
export function shouldDeferScreeningKickoff(
  sessionState: string,
  activeApplicationId: string | null | undefined,
  incomingApplicationId: string,
): boolean {
  return (
    sessionState === "screening_questions" &&
    typeof activeApplicationId === "string" &&
    activeApplicationId.length > 0 &&
    activeApplicationId !== incomingApplicationId
  );
}

async function findMostRecentApplicationId(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
  candidateId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function loadRecordedAnswers(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  applicationId: string,
): Promise<ScreeningAnswerItem[]> {
  const { data } = await supabase
    .from("application_screening_answers")
    .select("question_id, answer_yes, answer_text")
    .eq("application_id", applicationId);
  return (data ?? []).map((r) => {
    const row = r as {
      question_id: string;
      answer_yes: boolean | null;
      answer_text: string | null;
    };
    return {
      questionId: String(row.question_id),
      ...(row.answer_yes != null ? { answerYes: Boolean(row.answer_yes) } : {}),
      ...(row.answer_text != null ? { answerText: String(row.answer_text) } : {}),
    };
  });
}

function nextUnansweredQuestion(
  questions: JobScreeningQuestionRow[],
  answers: ScreeningAnswerItem[],
): { question: JobScreeningQuestionRow; index: number } | null {
  const answered = new Set(answers.map((a) => a.questionId));
  for (let i = 0; i < questions.length; i += 1) {
    if (!answered.has(questions[i].id)) return { question: questions[i], index: i };
  }
  return null;
}

/**
 * Begin (or skip) canonical screening Q&A for the chosen job.
 *
 * Returns:
 *   - "none"      -> the job has no active screening questions (caller proceeds to score)
 *   - "asking"    -> at least one question was asked; caller should NOT score now
 *                    (session moved to `screening_questions`)
 */
export async function startScreeningQuestionsForRole(params: {
  phone: string;
  candidateId: string;
  jobId: string;
  jobTitle: string;
  companyName?: string;
  candidateFirstName?: string | null;
  context: ScreeningQaContext;
}): Promise<"none" | "asking"> {
  const { phone, candidateId, jobId, jobTitle, context } = params;
  const supabase = createSupabaseAdmin();

  const questions = await fetchActiveScreeningQuestions(supabase, jobId);
  if (questions.length === 0) return "none";

  const applicationId = await findMostRecentApplicationId(supabase, jobId, candidateId);
  if (!applicationId) {
    // Defensive: no application row yet. Caller created one; treat as "none" so the
    // canonical gate (which blocks on missing answers) handles correctness downstream.
    logger.warn("WhatsApp screening Q&A: no application row found, skipping ask", {
      job_id: jobId,
      candidate_id: candidateId,
    });
    return "none";
  }

  const existing = await loadRecordedAnswers(supabase, applicationId);
  const next = nextUnansweredQuestion(questions, existing);
  if (!next) {
    // All already answered (e.g. answered on web previously) -> let caller score.
    return "none";
  }

  // Don't clobber an in-progress screening for another application. If one is
  // active, defer this kickoff — the reconciler re-kicks the (job, candidate)
  // pair once the active screening completes and the session frees up. (#340)
  let deferred = false;
  await withSessionCAS(phone, (session) => {
    const curCtx = (session.context ?? {}) as ScreeningQaContext;
    if (
      shouldDeferScreeningKickoff(
        session.session_state,
        curCtx.screening_application_id,
        applicationId,
      )
    ) {
      deferred = true;
      return null; // leave the active screening untouched
    }
    return {
      state: "screening_questions",
      context: {
        ...curCtx,
        candidate_id: candidateId,
        screening_job_id: jobId,
        screening_application_id: applicationId,
        screening_job_title: jobTitle,
      },
      extras: { qa_step: curCtx.qa_step as number | undefined },
    };
  });

  if (deferred) {
    logger.info("WhatsApp screening Q&A: kickoff deferred — another screening is in progress", {
      job_id: jobId,
      candidate_id: candidateId,
      application_id: applicationId,
    });
    return "none";
  }

  const isFirstQuestion = existing.length === 0;
  if (isFirstQuestion && params.companyName) {
    // No consent-template fallback here: outside the session window that path
    // sends a MARKETING template, which the DPDP guard blocks for unconsented
    // numbers — so screening kick-off silently died. The utility opener below
    // covers the closed-window case instead.
    await sendWhatsAppMessage(
      phone,
      screeningUploadIntro({
        companyName: params.companyName,
        jobTitle,
        totalQuestions: questions.length,
        candidateFirstName: params.candidateFirstName,
      }),
      { allowConsentFallback: false },
    );
  }

  const questionSend = await sendWhatsAppMessage(
    phone,
    screeningQuestionText(
      next.index,
      questions.length,
      next.question.question_text,
      optionLabelsFor(next.question),
    ),
    { allowConsentFallback: false },
  );

  if (!questionSend.success && questionSend.error === "session_window_closed") {
    // Candidate has an application on file, so the UTILITY class is the
    // sanctioned first touch. Any reply to it opens the 24h window, and the
    // session armed above resumes with this same question.
    const opener = await sendTemplateWithFallback({
      phone,
      templateNames: ["th_application_received"],
      bodyParams: [
        params.candidateFirstName?.trim() || "there",
        jobTitle,
        params.companyName ?? "the hiring team",
      ],
    });
    logger.info("Screening kickoff deferred behind utility opener", {
      job_id: jobId,
      candidate_id: candidateId,
      opener_sent: opener.success,
      opener_template: opener.templateName,
      opener_error: opener.error ?? null,
    });
  }
  return "asking";
}

export type ScreeningQaReplyOutcome =
  | { status: "asking" }
  | { status: "ambiguous" }
  | { status: "knockout" }
  | { status: "complete"; jobId: string; candidateId: string };

/**
 * Handle a YES/NO reply while in the `screening_questions` state.
 * Records the answer, evaluates, and returns the next action for the caller.
 * On "complete" the caller scores the chosen role; on "knockout" it must NOT score.
 */
export async function handleScreeningQuestionsReply(
  phone: string,
  text: string,
  session: WhatsAppSession,
): Promise<ScreeningQaReplyOutcome> {
  const supabase = createSupabaseAdmin();
  const context = (session.context ?? {}) as ScreeningQaContext;
  const candidateId = context.candidate_id;
  const jobId = context.screening_job_id;
  const applicationId = context.screening_application_id;

  if (!candidateId || !jobId || !applicationId) {
    await sendWhatsAppMessage(phone, "We lost your session. Please send your CV again as a PDF.");
    await withSessionCAS(phone, () => ({ state: "cv_requested", context: { ...context } }));
    return { status: "ambiguous" };
  }

  const questions = await fetchActiveScreeningQuestions(supabase, jobId);
  if (questions.length === 0) {
    // Questions removed mid-flow -> nothing to gate on; let caller proceed.
    return { status: "complete", jobId, candidateId };
  }

  // Knockout was an exitless state — a fat-fingered answer permanently rejected
  // the candidate with no way back. A RESTART keyword clears this application's
  // answers and re-asks from the top. (#341)
  if (
    ["restart", "redo", "change answers", "change my answers"].includes(text.trim().toLowerCase())
  ) {
    await supabase
      .from("application_screening_answers")
      .delete()
      .eq("application_id", applicationId);
    await sendWhatsAppMessage(
      phone,
      screeningQuestionText(
        0,
        questions.length,
        questions[0].question_text,
        optionLabelsFor(questions[0]),
      ),
    );
    return { status: "ambiguous" };
  }

  const recorded = await loadRecordedAnswers(supabase, applicationId);
  const next = nextUnansweredQuestion(questions, recorded);

  if (!next) {
    // Everything answered already; evaluate and route.
    return finalizeScreening(phone, supabase, questions, recorded, jobId, candidateId);
  }

  // Parse the reply against the current question's type.
  const labels = optionLabelsFor(next.question);
  let answerItem: ScreeningAnswerItem | null = null;
  if (labels) {
    const picked = parseOptionReply(text, labels);
    if (picked != null) answerItem = { questionId: next.question.id, answerText: picked };
  } else {
    const yn = parseYesNo(text);
    if (yn != null) answerItem = { questionId: next.question.id, answerYes: yn };
  }

  if (!answerItem) {
    await sendWhatsAppMessage(
      phone,
      screeningQuestionText(next.index, questions.length, next.question.question_text, labels),
    );
    return { status: "ambiguous" };
  }

  // Persist this answer (first-answer-wins: we only ever target an unanswered question).
  try {
    await upsertApplicationScreeningAnswers(supabase, applicationId, [answerItem]);
  } catch (err) {
    logger.warn("WhatsApp screening Q&A: failed to record answer", {
      job_id: jobId,
      candidate_id: candidateId,
      application_id: applicationId,
      error: err instanceof Error ? err.message : String(err),
    });
    await sendWhatsAppMessage(phone, "Something went wrong saving your answer. Please try again.");
    return { status: "ambiguous" };
  }

  const updated = [...recorded, answerItem];
  return finalizeScreening(phone, supabase, questions, updated, jobId, candidateId);
}

async function finalizeScreening(
  phone: string,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  questions: JobScreeningQuestionRow[],
  answers: ScreeningAnswerItem[],
  jobId: string,
  candidateId: string,
): Promise<ScreeningQaReplyOutcome> {
  const ev = evaluateScreeningAnswers(questions, answers);

  if (!ev.ok && ev.reason === "knockout") {
    await sendWhatsAppMessage(phone, KNOCKOUT_MESSAGE);
    logger.info("WhatsApp screening Q&A: candidate knocked out", {
      job_id: jobId,
      candidate_id: candidateId,
    });
    return { status: "knockout" };
  }

  if (!ev.ok) {
    // incomplete -> ask the next unanswered question.
    const next = nextUnansweredQuestion(questions, answers);
    if (next) {
      await sendWhatsAppMessage(
        phone,
        screeningQuestionText(
          next.index,
          questions.length,
          next.question.question_text,
          optionLabelsFor(next.question),
        ),
      );
      return { status: "asking" };
    }
    // Shouldn't happen (incomplete but nothing left); treat as still asking.
    return { status: "asking" };
  }

  // All answered + match -> caller proceeds to score.
  return { status: "complete", jobId, candidateId };
}

export { KNOCKOUT_MESSAGE };

/**
 * Best-effort start of canonical WhatsApp screening collection for non-interactive
 * apply channels (email intake, idibu, and any apply path that creates an application
 * but does NOT collect screening answers inline).
 *
 * Behavior:
 *   - No active job_screening_questions -> no-op (candidate is not gated by this job).
 *   - Has questions + candidate reachable by phone -> start the canonical WhatsApp
 *     Q&A so answers land in `application_screening_answers`; the always-on canonical
 *     gate in FitScoreService.computeSingle then sees them. The candidate is asked
 *     over WhatsApp even though they applied via email/board (cross-channel).
 *   - Has questions but NO phone -> log clearly that collection is impossible; the
 *     candidate stays GATED (blocked until answered) by the canonical gate.
 *
 * NEVER throws and NEVER blocks application creation. Call AFTER the application row
 * exists. Safe for recruiter/agency/company CV uploads (a held candidate is asked over
 * WhatsApp; if answers already exist it no-ops). Do NOT call from web apply or the
 * WhatsApp guided flow — those collect answers inline.
 */
export async function startCanonicalScreeningCollectionBestEffort(params: {
  admin?: ReturnType<typeof createSupabaseAdmin>;
  jobId: string;
  candidateId: string;
  applicationId?: string | null;
  organisationId?: string | null;
  phone?: string | null;
  source?: string;
}): Promise<"none" | "asking" | "no_phone"> {
  const { jobId, candidateId } = params;
  try {
    const admin = params.admin ?? createSupabaseAdmin();

    if (params.organisationId) {
      const orgWhatsapp = await isOrgWhatsappScreeningEnabled(params.organisationId, admin);
      if (!orgWhatsapp) return "none";
    }

    const questions = await fetchActiveScreeningQuestions(admin, jobId);
    if (questions.length === 0) return "none";

    // CV may already carry the prescreen answers (supplied with the upload or answered
    // on the form). If every active question is already answered, don't re-ask over
    // WhatsApp — let the caller score; the canonical gate will pass.
    const applicationId =
      params.applicationId ?? (await findMostRecentApplicationId(admin, jobId, candidateId));
    if (applicationId) {
      const recorded = await loadRecordedAnswers(admin, applicationId);
      if (recorded.length > 0 && nextUnansweredQuestion(questions, recorded) === null) {
        return "none";
      }
    }

    // Resolve the candidate phone (caller may pass it; otherwise look it up — same
    // pattern as prescreen/start-gate.ts).
    let phone = params.phone ?? null;
    let candidateFirstName: string | null = null;
    const { data: candidateRow } = await admin
      .from("candidates")
      .select("phone, full_name, name")
      .eq("id", candidateId)
      .maybeSingle();
    if (!phone) {
      phone = (candidateRow as { phone?: string | null } | null)?.phone ?? null;
    }
    const fullName =
      (candidateRow as { full_name?: string | null; name?: string | null } | null)?.full_name ??
      (candidateRow as { name?: string | null } | null)?.name ??
      null;
    candidateFirstName = fullName?.trim()?.split(/\s+/)[0] ?? null;

    if (!phone) {
      logger.warn(
        "Canonical screening collection: candidate has no phone; cannot collect, candidate stays gated",
        {
          job_id: jobId,
          candidate_id: candidateId,
          source: params.source,
        },
      );
      return "no_phone";
    }

    const { data: jobRow } = await admin
      .from("jobs")
      .select("title, organisation_id")
      .eq("id", jobId)
      .maybeSingle();
    const jobTitle = (jobRow as { title?: string } | null)?.title ?? "this role";
    const organisationId =
      params.organisationId ??
      (jobRow as { organisation_id?: string | null } | null)?.organisation_id ??
      null;
    const companyName = organisationId
      ? await getOrgDisplayName(admin, organisationId)
      : "the hiring team";

    const outcome = await startScreeningQuestionsForRole({
      phone,
      candidateId,
      jobId,
      jobTitle,
      companyName,
      candidateFirstName,
      context: { candidate_id: candidateId },
    });
    logger.info("Canonical screening collection started", {
      job_id: jobId,
      candidate_id: candidateId,
      source: params.source,
      outcome,
    });
    return outcome;
  } catch (err) {
    logger.warn("Canonical screening collection failed (non-fatal)", {
      job_id: jobId,
      candidate_id: candidateId,
      source: params.source,
      error: err instanceof Error ? err.message : String(err),
    });
    return "none";
  }
}
