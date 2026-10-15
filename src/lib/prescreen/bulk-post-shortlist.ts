import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { routePrescreenAfterApplication } from "@/lib/prescreen/channel-router";
import { isShortlistStageName } from "@/lib/prescreen/post-shortlist-trigger";
import { resetIncompletePrescreenSession } from "@/lib/prescreen/reset-session";
import { getApprovedJdBase, getGatingQuestions, getSession } from "@/lib/prescreen/repository";
import type { PrescreenSessionState } from "@/lib/prescreen/types";

export type PostShortlistCandidate = {
  candidateId: string;
  applicationId: string | null;
  fullName: string;
  phone: string | null;
  /** candidates.do_not_call — candidate texted STOP; never contact again. */
  doNotCall: boolean;
  sessionState: string | null;
  sessionQuestionsSentAt: string | null;
  /** prescreen_sessions.declined_at — candidate explicitly said NO at consent; never re-invite. */
  sessionDeclinedAt: string | null;
  /** Recorded answers for the current post-shortlist question set. */
  postShortlistAnswerCount: number;
  /** True when any recorded post-shortlist answer is a knockout NO (failed, not timed out). */
  postShortlistKnockout: boolean;
};

export type PostShortlistSendPreview = {
  shortlistedTotal: number;
  withPhone: number;
  withoutPhone: number;
  /** Candidates who answered every post-shortlist question. */
  screeningComplete: number;
  /** @deprecated Use screeningComplete — kept for API compat. */
  alreadyComplete: number;
  /** Invited but not finished (includes timed-out sessions). */
  staleIncomplete: number;
  awaitingConsent: number;
  inProgress: number;
  /** Session closed without finishing and without a knockout NO. */
  timedOut: number;
  /** Answered NO to a knockout question — failed screening, not timed out. */
  knockedOut: number;
  eligibleToSend: number;
  postShortlistQuestionCount: number;
};

export type PostShortlistSendResult = PostShortlistSendPreview & {
  dryRun: boolean;
  sent: number;
  skipped: number;
  failed: number;
  reset: number;
};

async function loadPostShortlistAnswerCounts(
  admin: SupabaseClient,
  jobId: string,
  candidateIds: string[],
  questionIds: string[],
): Promise<Map<string, { count: number; knockout: boolean }>> {
  if (candidateIds.length === 0 || questionIds.length === 0) return new Map();
  const { data, error } = await admin
    .from("prescreen_responses")
    .select("candidate_id, question_id, passed")
    .eq("job_id", jobId)
    .in("candidate_id", candidateIds)
    .in("question_id", questionIds);
  if (error) throw error;

  const questionIdSet = new Set(questionIds);
  const counts = new Map<string, { count: number; knockout: boolean }>();
  for (const row of data ?? []) {
    const qid = row.question_id as string;
    if (!questionIdSet.has(qid)) continue;
    const cid = row.candidate_id as string;
    const entry = counts.get(cid) ?? { count: 0, knockout: false };
    entry.count += 1;
    // Mirrors fetch-job-screening-review: any passed=false answer is a knockout NO.
    if ((row as { passed?: boolean | null }).passed === false) entry.knockout = true;
    counts.set(cid, entry);
  }
  return counts;
}

export async function loadShortlistedCandidates(
  admin: SupabaseClient,
  jobId: string,
  postQuestionIds: string[] = [],
): Promise<PostShortlistCandidate[]> {
  const { data: stages, error: stageErr } = await admin
    .from("pipeline_stages")
    .select("id, stage_name")
    .eq("job_id", jobId);
  if (stageErr) throw stageErr;

  const shortlistStageIds = (stages ?? [])
    .filter((s) => isShortlistStageName(String(s.stage_name ?? "")))
    .map((s) => s.id as string);
  if (shortlistStageIds.length === 0) return [];

  const { data: rows, error } = await admin
    .from("pipeline_candidates")
    .select("candidate_id, candidates(id, full_name, name, phone, do_not_call)")
    .eq("job_id", jobId)
    .in("stage_id", shortlistStageIds);
  if (error) throw error;

  type CandidateJoinRow = {
    id: string;
    full_name: string | null;
    name: string | null;
    phone: string | null;
    do_not_call: boolean | null;
  };
  const byCandidate = new Map<string, PostShortlistCandidate>();
  for (const row of rows ?? []) {
    const r = row as {
      candidate_id: string;
      candidates: CandidateJoinRow | CandidateJoinRow[] | null;
    };
    const candidate = Array.isArray(r.candidates) ? r.candidates[0] : r.candidates;
    const cid = r.candidate_id;
    if (!byCandidate.has(cid)) {
      byCandidate.set(cid, {
        candidateId: cid,
        applicationId: null,
        fullName: candidate?.full_name ?? candidate?.name ?? cid,
        phone: candidate?.phone ?? null,
        doNotCall: Boolean(candidate?.do_not_call),
        sessionState: null,
        sessionQuestionsSentAt: null,
        sessionDeclinedAt: null,
        postShortlistAnswerCount: 0,
        postShortlistKnockout: false,
      });
    }
  }

  const candidateIds = [...byCandidate.keys()];
  if (candidateIds.length === 0) return [];

  const { data: apps, error: appErr } = await admin
    .from("applications")
    .select("id, candidate_id")
    .eq("job_id", jobId)
    .in("candidate_id", candidateIds);
  if (appErr) throw appErr;
  for (const app of apps ?? []) {
    const hit = byCandidate.get(app.candidate_id as string);
    if (hit && !hit.applicationId) {
      hit.applicationId = app.id as string;
    }
  }

  const { data: sessions, error: sessionErr } = await admin
    .from("prescreen_sessions")
    .select("candidate_id, state, questions_sent_at, declined_at")
    .eq("job_id", jobId)
    .eq("stage", "post_shortlist")
    .in("candidate_id", candidateIds);
  if (sessionErr) throw sessionErr;

  for (const s of sessions ?? []) {
    const hit = byCandidate.get(s.candidate_id as string);
    if (hit) {
      hit.sessionState = String(s.state ?? "");
      hit.sessionQuestionsSentAt = (s.questions_sent_at as string | null) ?? null;
      hit.sessionDeclinedAt = (s.declined_at as string | null) ?? null;
    }
  }

  if (postQuestionIds.length > 0) {
    const answerCounts = await loadPostShortlistAnswerCounts(
      admin,
      jobId,
      candidateIds,
      postQuestionIds,
    );
    for (const [cid, entry] of answerCounts) {
      const hit = byCandidate.get(cid);
      if (hit) {
        hit.postShortlistAnswerCount = entry.count;
        hit.postShortlistKnockout = entry.knockout;
      }
    }
  }

  return [...byCandidate.values()];
}

function isScreeningComplete(candidate: PostShortlistCandidate, questionCount: number): boolean {
  return questionCount > 0 && candidate.postShortlistAnswerCount >= questionCount;
}

/**
 * An open session only counts as a stale invite once the candidate has had a
 * real chance to reply. Freshly (re-)invited candidates are live conversations
 * and must be neither surfaced as stale nor reset by forceResend.
 */
const STALE_INVITE_HOURS = 24;

function isStaleIncompleteSession(c: PostShortlistCandidate, questionCount: number): boolean {
  if (isScreeningComplete(c, questionCount)) return false;
  if (!c.sessionState || c.sessionState === "complete") return false;
  if (!c.sessionQuestionsSentAt) return true;
  return Date.now() - new Date(c.sessionQuestionsSentAt).getTime() > STALE_INVITE_HOURS * 3_600_000;
}

function classifyCandidates(
  candidates: PostShortlistCandidate[],
  questionCount: number,
  forceResend: boolean,
  resendSessionStates?: PrescreenSessionState[],
): {
  preview: PostShortlistSendPreview;
  toSend: PostShortlistCandidate[];
  staleIncomplete: PostShortlistCandidate[];
} {
  // Opted-out (STOP) candidates are never contactable: treated like missing
  // phones so no bucket downstream can select them for a send.
  const withPhone = candidates.filter((c) => c.phone?.trim() && !c.doNotCall);
  const withoutPhone = candidates.filter((c) => !c.phone?.trim() || c.doNotCall);
  const screeningComplete = withPhone.filter((c) => isScreeningComplete(c, questionCount));
  const notFullyScreened = withPhone.filter((c) => !isScreeningComplete(c, questionCount));
  const staleIncomplete = notFullyScreened.filter((c) =>
    isStaleIncompleteSession(c, questionCount),
  );
  const staleToResend = resendSessionStates?.length
    ? staleIncomplete.filter((c) =>
        resendSessionStates.includes(c.sessionState as PrescreenSessionState),
      )
    : staleIncomplete;
  const noSession = notFullyScreened.filter((c) => !c.sessionState);

  const awaitingConsent = withPhone.filter((c) => c.sessionState === "awaiting_consent").length;
  const inProgress = withPhone.filter(
    (c) => c.sessionState === "awaiting_reply" || c.sessionState === "reminded",
  ).length;
  // A knockout NO ends the session early ("complete" without all questions
  // answered) — those candidates failed screening and must not read as timed out.
  const timedOut = withPhone.filter(
    (c) =>
      c.sessionState === "complete" &&
      !isScreeningComplete(c, questionCount) &&
      !c.postShortlistKnockout,
  ).length;
  const knockedOut = withPhone.filter((c) => c.postShortlistKnockout).length;

  const toSend = forceResend ? [...noSession, ...staleToResend] : noSession;

  const preview: PostShortlistSendPreview = {
    shortlistedTotal: candidates.length,
    withPhone: withPhone.length,
    withoutPhone: withoutPhone.length,
    screeningComplete: screeningComplete.length,
    alreadyComplete: screeningComplete.length,
    staleIncomplete: staleToResend.length,
    awaitingConsent,
    inProgress,
    timedOut,
    knockedOut,
    eligibleToSend: toSend.length,
    postShortlistQuestionCount: questionCount,
  };

  return { preview, toSend, staleIncomplete: staleToResend };
}

/** Preview how many shortlisted candidates can receive post-shortlist WhatsApp. */
export async function previewPostShortlistSend(
  admin: SupabaseClient,
  jobId: string,
  forceResend = false,
  resendSessionStates?: PrescreenSessionState[],
): Promise<PostShortlistSendPreview> {
  const jdBase = await getApprovedJdBase(admin, jobId);
  const postQuestions = jdBase ? await getGatingQuestions(admin, jdBase.id, "post_shortlist") : [];
  const postQuestionIds = postQuestions.map((q) => q.id);

  const candidates = await loadShortlistedCandidates(admin, jobId, postQuestionIds);
  const { preview } = classifyCandidates(
    candidates,
    postQuestions.length,
    forceResend,
    resendSessionStates,
  );
  return preview;
}

/**
 * Send post-shortlist WhatsApp invites to shortlisted pipeline candidates.
 * With `forceResend`, clears incomplete sessions first (fixes stale failed invites).
 */
export async function sendPostShortlistToShortlisted(params: {
  admin: SupabaseClient;
  jobId: string;
  organisationId: string;
  dryRun?: boolean;
  forceResend?: boolean;
  /** When forceResend is set, only resend to candidates in these session states (e.g. awaiting_consent). */
  resendSessionStates?: PrescreenSessionState[];
  candidateIds?: string[];
}): Promise<PostShortlistSendResult> {
  const { admin, jobId, organisationId } = params;
  const dryRun = params.dryRun ?? false;
  const forceResend = params.forceResend ?? false;
  const resendSessionStates = params.resendSessionStates;

  const jdBase = await getApprovedJdBase(admin, jobId);
  if (!jdBase) {
    throw new Error("Approve the Ideal Profile (JD base) before sending post-shortlist screening.");
  }

  const postQuestions = await getGatingQuestions(admin, jdBase.id, "post_shortlist");
  if (postQuestions.length === 0) {
    throw new Error(
      "Add post-shortlist questions on the Plan page (After shortlist tab) before sending.",
    );
  }

  const postQuestionIds = postQuestions.map((q) => q.id);
  let candidates = await loadShortlistedCandidates(admin, jobId, postQuestionIds);
  if (params.candidateIds?.length) {
    const allow = new Set(params.candidateIds);
    candidates = candidates.filter((c) => allow.has(c.candidateId));
  }

  const { preview, toSend, staleIncomplete } = classifyCandidates(
    candidates,
    postQuestions.length,
    forceResend,
    resendSessionStates,
  );

  const result: PostShortlistSendResult = {
    ...preview,
    dryRun,
    sent: 0,
    skipped: 0,
    failed: 0,
    reset: 0,
  };

  if (dryRun) return result;

  // Candidates with recorded answers are engaged; the destructive reset
  // (delete session + responses) must never touch them. They resume via the
  // answer-preserving re-nudge path instead.
  const { data: answeredRows, error: answeredErr } = await admin
    .from("prescreen_responses")
    .select("candidate_id")
    .eq("job_id", jobId)
    .in(
      "question_id",
      postQuestions.map((q) => q.id),
    );
  if (answeredErr) throw answeredErr;
  const answeredCandidateIds = new Set((answeredRows ?? []).map((r) => r.candidate_id as string));

  if (forceResend) {
    for (const c of staleIncomplete) {
      if (answeredCandidateIds.has(c.candidateId)) continue;
      const reset = await resetIncompletePrescreenSession(admin, {
        jobId,
        candidateId: c.candidateId,
        stage: "post_shortlist",
      });
      if (reset) result.reset += 1;
    }
  }

  for (const c of toSend) {
    const phone = c.phone?.trim();
    if (!phone) {
      result.skipped += 1;
      continue;
    }
    if (c.sessionState && answeredCandidateIds.has(c.candidateId)) {
      result.skipped += 1;
      logger.info("[post-shortlist] skipping candidate with recorded answers", {
        jobId,
        candidateId: c.candidateId,
      });
      continue;
    }

    if (isScreeningComplete(c, postQuestions.length)) {
      result.skipped += 1;
      continue;
    }

    const existing = await getSession(admin, jobId, c.candidateId, "post_shortlist");
    if (existing) {
      await resetIncompletePrescreenSession(admin, {
        jobId,
        candidateId: c.candidateId,
        stage: "post_shortlist",
      });
    }

    const firstName = c.fullName.trim().split(/\s+/)[0] || null;
    try {
      const outcome = await routePrescreenAfterApplication({
        admin,
        jobId,
        candidateId: c.candidateId,
        applicationId: c.applicationId,
        organisationId,
        channel: "whatsapp",
        phone,
        options: {
          stage: "post_shortlist",
          setGatePending: false,
          candidateFirstName: firstName,
        },
      });
      if (outcome.started) {
        result.sent += 1;
      } else {
        result.skipped += 1;
        logger.warn("[post-shortlist] bulk send skipped candidate", {
          jobId,
          candidateId: c.candidateId,
          reason: outcome.reason,
        });
      }
    } catch (err) {
      result.failed += 1;
      logger.warn("[post-shortlist] bulk send failed for candidate", {
        jobId,
        candidateId: c.candidateId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const notAttempted = candidates.length - toSend.length;
  result.skipped += notAttempted;

  logger.info("[post-shortlist] bulk send finished", {
    jobId,
    ...result,
  });

  return result;
}
