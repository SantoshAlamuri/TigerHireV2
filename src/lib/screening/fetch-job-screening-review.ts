import type { SupabaseClient } from "@supabase/supabase-js";
import type { GateStatus, PrescreenStage } from "@/lib/prescreen/types";
import { classifyPostShortlistDrift, type PostShortlistDrift } from "@/lib/prescreen/drift";
import { getApprovedJdBase, getGatingQuestions } from "@/lib/prescreen/repository";
import { isShortlistStageName } from "@/lib/prescreen/post-shortlist-trigger";
import { passedScreeningAnswer } from "@/lib/screening/fetch-application-screening-display";

export type ScreeningReviewPhase = PrescreenStage | "web_apply";

export type ScreeningReviewQuestion = {
  id: string;
  source: "prescreen" | "canonical";
  /** When this question is asked in the lifecycle. */
  phase: ScreeningReviewPhase;
  text: string;
  sortOrder: number;
};

export type ScreeningReviewAnswer = {
  value: string;
  passed: boolean | null;
};

export type ScreeningReviewRow = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  /** applications.status (may lag behind pipeline stage). */
  applicationStatus: string;
  /** pipeline_stages.stage_name for the candidate's current shortlist stage. */
  pipelineStageName: string;
  gateStatus: GateStatus | null;
  /** Open WhatsApp session state per prescreen stage (null = no session). */
  prescreenSessionByStage: Partial<Record<PrescreenStage, string>>;
  /** Open post-shortlist session past a machine deadline (reminder/close cron missed it). */
  postShortlistDrift: PostShortlistDrift | null;
  /** Answers recorded for post-shortlist questions only. */
  postShortlistAnswerCount: number;
  postShortlistQuestionCount: number;
  /** True when any post-shortlist answer is NO (knockout). */
  postShortlistFailed: boolean;
  fitScore: number | null;
  fitBand: string | null;
  scoringMethod: string | null;
  answers: Record<string, ScreeningReviewAnswer>;
};

export type JobScreeningReviewPayload = {
  /** A JD base exists but is awaiting (re-)approval — questions are hidden until approved. */
  jdApprovalPending: boolean;
  questions: ScreeningReviewQuestion[];
  rows: ScreeningReviewRow[];
};

function firstRelation<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function truncateQuestion(text: string, max = 220): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

const PHASE_SORT: Record<ScreeningReviewPhase, number> = {
  apply: 0,
  web_apply: 50,
  post_shortlist: 100,
};

/**
 * Shortlisted-pipeline screening review: FitScore + post-shortlist WhatsApp answers.
 * Only candidates in a pipeline stage whose name matches shortlist (e.g. "Shortlisted").
 */
export async function fetchJobScreeningReview(
  admin: SupabaseClient,
  jobId: string,
): Promise<JobScreeningReviewPayload> {
  const questions: ScreeningReviewQuestion[] = [];

  const jdBase = await getApprovedJdBase(admin, jobId);
  let jdApprovalPending = false;
  if (!jdBase) {
    const { count, error: docErr } = await admin
      .from("jd_base_documents")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);
    if (docErr) throw docErr;
    jdApprovalPending = (count ?? 0) > 0;
  }
  if (jdBase) {
    const [applyQs, postShortlistQs] = await Promise.all([
      getGatingQuestions(admin, jdBase.id, "apply"),
      getGatingQuestions(admin, jdBase.id, "post_shortlist"),
    ]);
    applyQs.forEach((q, index) => {
      questions.push({
        id: q.id,
        source: "prescreen",
        phase: "apply",
        text: truncateQuestion(q.question_text),
        sortOrder: PHASE_SORT.apply + index,
      });
    });
    postShortlistQs.forEach((q, index) => {
      questions.push({
        id: q.id,
        source: "prescreen",
        phase: "post_shortlist",
        text: truncateQuestion(q.question_text),
        sortOrder: PHASE_SORT.post_shortlist + index,
      });
    });
  }

  const { data: canonicalQs, error: canonicalErr } = await admin
    .from("job_screening_questions")
    .select("id, question_text, fail_on_yes, sort_order")
    .eq("job_id", jobId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (canonicalErr) throw canonicalErr;

  for (const q of canonicalQs ?? []) {
    questions.push({
      id: q.id as string,
      source: "canonical",
      phase: "web_apply",
      text: truncateQuestion(String(q.question_text ?? "")),
      sortOrder: PHASE_SORT.web_apply + Number(q.sort_order ?? 0),
    });
  }

  questions.sort((a, b) => a.sortOrder - b.sortOrder);

  const postShortlistQuestionIds = questions
    .filter((q) => q.phase === "post_shortlist")
    .map((q) => q.id);
  const postShortlistQuestionCount = postShortlistQuestionIds.length;

  const { data: pipelineStages, error: stageErr } = await admin
    .from("pipeline_stages")
    .select("id, stage_name")
    .eq("job_id", jobId);
  if (stageErr) throw stageErr;

  const shortlistStages = (pipelineStages ?? []).filter((s) =>
    isShortlistStageName(String(s.stage_name ?? "")),
  );
  const shortlistStageIds = shortlistStages.map((s) => s.id as string);
  const stageNameById = new Map(
    shortlistStages.map((s) => [s.id as string, String(s.stage_name ?? "Shortlisted")]),
  );

  if (shortlistStageIds.length === 0) {
    return { jdApprovalPending, questions, rows: [] };
  }

  const { data: pipelineRows, error: pcErr } = await admin
    .from("pipeline_candidates")
    .select("candidate_id, stage_id, candidates(id, name, full_name)")
    .eq("job_id", jobId)
    .in("stage_id", shortlistStageIds);
  if (pcErr) throw pcErr;

  const shortlisted = pipelineRows ?? [];
  if (shortlisted.length === 0) {
    return { jdApprovalPending, questions, rows: [] };
  }

  const candidateIds = [...new Set(shortlisted.map((r) => r.candidate_id as string))];

  const { data: applications, error: appErr } = await admin
    .from("applications")
    .select("id, candidate_id, status, gate_status, candidates(id, name)")
    .eq("job_id", jobId)
    .in("candidate_id", candidateIds)
    .order("created_at", { ascending: false });
  if (appErr) throw appErr;

  const appByCandidate = new Map<string, (typeof applications)[number]>();
  for (const app of applications ?? []) {
    const cid = app.candidate_id as string;
    if (!appByCandidate.has(cid)) appByCandidate.set(cid, app);
  }

  const applicationIds = [...appByCandidate.values()].map((a) => a.id as string);

  const sessionByCandidateStage = new Map<string, Partial<Record<PrescreenStage, string>>>();
  const driftByCandidate = new Map<string, PostShortlistDrift>();
  if (candidateIds.length > 0) {
    const { data: sessionRows, error: sessionErr } = await admin
      .from("prescreen_sessions")
      .select("candidate_id, stage, state, questions_sent_at, reminder_sent_at, created_at")
      .eq("job_id", jobId)
      .in("candidate_id", candidateIds);
    if (sessionErr) throw sessionErr;
    const nowMs = Date.now();
    for (const s of sessionRows ?? []) {
      const cid = s.candidate_id as string;
      const stage = s.stage as PrescreenStage;
      if (!sessionByCandidateStage.has(cid)) sessionByCandidateStage.set(cid, {});
      sessionByCandidateStage.get(cid)![stage] = String(s.state ?? "");
      if (stage === "post_shortlist") {
        const drift = classifyPostShortlistDrift(
          {
            state: String(s.state ?? ""),
            questions_sent_at: (s.questions_sent_at as string | null) ?? null,
            reminder_sent_at: (s.reminder_sent_at as string | null) ?? null,
            created_at: (s.created_at as string | null) ?? null,
          },
          nowMs,
        );
        if (drift) driftByCandidate.set(cid, drift);
      }
    }
  }

  const prescreenByCandidate = new Map<string, Map<string, { value: string; passed: boolean }>>();
  if (candidateIds.length > 0) {
    const { data: prescreenRows, error: prescreenErr } = await admin
      .from("prescreen_responses")
      .select("candidate_id, question_id, answer, passed")
      .eq("job_id", jobId)
      .in("candidate_id", candidateIds);
    if (prescreenErr) throw prescreenErr;
    for (const r of prescreenRows ?? []) {
      const cid = r.candidate_id as string;
      const qid = r.question_id as string;
      if (!prescreenByCandidate.has(cid)) prescreenByCandidate.set(cid, new Map());
      prescreenByCandidate.get(cid)!.set(qid, {
        value: String(r.answer ?? ""),
        passed: r.passed === true,
      });
    }
  }

  const canonicalByApplication = new Map<string, Map<string, { value: string; passed: boolean }>>();
  if (applicationIds.length > 0) {
    const { data: answerRows, error: answerErr } = await admin
      .from("application_screening_answers")
      .select("application_id, answer_yes, job_screening_questions(id, fail_on_yes)")
      .in("application_id", applicationIds);
    if (answerErr) throw answerErr;
    for (const r of answerRows ?? []) {
      const appId = r.application_id as string;
      const q = firstRelation(
        r.job_screening_questions as
          | { id: string; fail_on_yes: boolean }
          | { id: string; fail_on_yes: boolean }[]
          | null,
      );
      if (!q) continue;
      const answerYes = Boolean((r as { answer_yes?: boolean }).answer_yes);
      if (!canonicalByApplication.has(appId)) canonicalByApplication.set(appId, new Map());
      canonicalByApplication.get(appId)!.set(q.id, {
        value: answerYes ? "Yes" : "No",
        passed: passedScreeningAnswer(q.fail_on_yes, answerYes),
      });
    }
  }

  const fitByCandidate = new Map<
    string,
    { score: number | null; band: string | null; scoringMethod: string | null }
  >();
  if (candidateIds.length > 0) {
    const { data: scoreRows, error: scoreErr } = await admin
      .from("fit_scores")
      .select("candidate_id, overall_score, band, scoring_method, created_at")
      .eq("job_id", jobId)
      .is("superseded_at", null)
      .in("candidate_id", candidateIds)
      .order("created_at", { ascending: false });
    if (scoreErr) throw scoreErr;
    for (const s of scoreRows ?? []) {
      const cid = s.candidate_id as string;
      if (fitByCandidate.has(cid)) continue;
      fitByCandidate.set(cid, {
        score: typeof s.overall_score === "number" ? s.overall_score : null,
        band: (s.band as string | null) ?? null,
        scoringMethod: (s.scoring_method as string | null) ?? null,
      });
    }
  }

  const rows: ScreeningReviewRow[] = shortlisted.flatMap((pc) => {
    const candidateId = pc.candidate_id as string;
    const stageId = pc.stage_id as string;
    const app = appByCandidate.get(candidateId);
    if (!app) return [];

    const applicationId = app.id as string;
    const pipelineCandidate = firstRelation(
      pc.candidates as
        | { id: string; name: string | null; full_name: string | null }
        | { id: string; name: string | null; full_name: string | null }[]
        | null,
    );
    const applicationCandidate = firstRelation(
      app.candidates as { id: string; name: string } | { id: string; name: string }[] | null,
    );
    const candidateName =
      pipelineCandidate?.full_name?.trim() ||
      pipelineCandidate?.name?.trim() ||
      applicationCandidate?.name?.trim() ||
      "Unknown";
    const fit = fitByCandidate.get(candidateId);
    const prescreenAnswers = prescreenByCandidate.get(candidateId);
    const canonicalAnswers = canonicalByApplication.get(applicationId);

    const answers: Record<string, ScreeningReviewAnswer> = {};
    let postShortlistAnswerCount = 0;
    let postShortlistFailed = false;
    for (const q of questions) {
      const fromPrescreen = q.source === "prescreen" ? prescreenAnswers?.get(q.id) : undefined;
      const fromCanonical = q.source === "canonical" ? canonicalAnswers?.get(q.id) : undefined;
      const hit = fromPrescreen ?? fromCanonical;
      if (hit) {
        answers[q.id] = { value: hit.value, passed: hit.passed };
        if (q.phase === "post_shortlist") {
          postShortlistAnswerCount += 1;
          if (hit.passed === false) postShortlistFailed = true;
        }
      }
    }

    const gateStatus: GateStatus | null = postShortlistFailed
      ? "failed"
      : ((app.gate_status as GateStatus | null) ?? null);

    return [
      {
        applicationId,
        candidateId,
        candidateName,
        applicationStatus: String(app.status ?? "applied"),
        pipelineStageName: stageNameById.get(stageId) ?? "Shortlisted",
        gateStatus,
        prescreenSessionByStage: sessionByCandidateStage.get(candidateId) ?? {},
        postShortlistDrift: driftByCandidate.get(candidateId) ?? null,
        postShortlistAnswerCount,
        postShortlistQuestionCount,
        postShortlistFailed,
        fitScore: fit?.score ?? null,
        fitBand: fit?.band ?? null,
        scoringMethod: fit?.scoringMethod ?? null,
        answers,
      },
    ];
  });

  return { jdApprovalPending, questions, rows };
}
