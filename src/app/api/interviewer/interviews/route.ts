import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  handleApiError,
  hasRole,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";

interface AssignedInterview {
  pipelineCandidateId: string;
  jobId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  stageName: string;
  scheduledAt: string;
  feedbackSubmitted: boolean;
  // Neutral prep material (no AI verdict / peer feedback — see #354 anti-anchoring).
  resumeUrl: string | null;
  jdSummary: string | null;
  screeningAnswers: Array<{ question: string; answer: string }>;
}

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "interviewer")) return jsonError("Forbidden", 403);

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const interviewerEmail = user?.email?.trim().toLowerCase();
    if (!interviewerEmail) return jsonError("Interviewer email not available", 400);

    const { data: assignedStages, error: stageError } = await supabase
      .from("pipeline_stages")
      .select("id, stage_name")
      .ilike("interviewer_email", interviewerEmail);
    if (stageError) throw stageError;
    if (!assignedStages || assignedStages.length === 0) return jsonSuccess({ interviews: [] });

    const stageIds = assignedStages.map((stage) => stage.id);
    const stageNameById = new Map(
      assignedStages.map((stage) => [stage.id, stage.stage_name ?? "Interview"]),
    );

    const { data: pipelineRows, error: pipelineError } = await supabase
      .from("pipeline_candidates")
      .select(
        "id, job_id, candidate_id, stage_id, interview_scheduled_at, candidates(full_name, name, email, resume_url, cv_url), jobs(title, description), feedback_responses(id, submitted_by)",
      )
      .in("stage_id", stageIds)
      .not("interview_scheduled_at", "is", null)
      .order("interview_scheduled_at", { ascending: true });
    if (pipelineError) throw pipelineError;

    // Batch the candidates' screening Q&A for these (job, candidate) pairs so the
    // interviewer walks in with the answers instead of asking the recruiter.
    const answersByCandidateJob = new Map<string, Array<{ question: string; answer: string }>>();
    const candJobPairs = (pipelineRows ?? [])
      .map((r) => ({ candidateId: r.candidate_id as string, jobId: r.job_id as string }))
      .filter((p) => p.candidateId && p.jobId);
    if (candJobPairs.length > 0) {
      const candidateIds = [...new Set(candJobPairs.map((p) => p.candidateId))];
      const jobIds = [...new Set(candJobPairs.map((p) => p.jobId))];
      const { data: apps } = await supabase
        .from("applications")
        .select("id, candidate_id, job_id")
        .in("candidate_id", candidateIds)
        .in("job_id", jobIds);
      const appKeyById = new Map<string, string>();
      for (const a of apps ?? []) {
        appKeyById.set(a.id as string, `${a.job_id}:${a.candidate_id}`);
      }
      const appIds = (apps ?? []).map((a) => a.id as string);
      if (appIds.length > 0) {
        const { data: answers } = await supabase
          .from("application_screening_answers")
          .select("application_id, answer_yes, answer_text, job_screening_questions(question_text)")
          .in("application_id", appIds);
        for (const ans of answers ?? []) {
          const key = appKeyById.get(ans.application_id as string);
          if (!key) continue;
          const q = ans.job_screening_questions as { question_text?: string } | null;
          const answerText =
            (ans.answer_text as string | null) ??
            (ans.answer_yes == null ? "" : ans.answer_yes ? "Yes" : "No");
          if (!answersByCandidateJob.has(key)) answersByCandidateJob.set(key, []);
          answersByCandidateJob.get(key)!.push({
            question: q?.question_text ?? "Question",
            answer: answerText,
          });
        }
      }
    }

    const interviews: AssignedInterview[] = (pipelineRows ?? []).map((row) => {
      const feedback = (row.feedback_responses ?? []) as Array<{
        id: string;
        submitted_by: string;
      }>;
      const candidateSource = row.candidates as unknown;
      const jobSource = row.jobs as unknown;
      const candidate = (Array.isArray(candidateSource) ? candidateSource[0] : candidateSource) as
        | {
            full_name: string | null;
            name: string | null;
            email: string | null;
            resume_url: string | null;
            cv_url: string | null;
          }
        | null
        | undefined;
      const job = (Array.isArray(jobSource) ? jobSource[0] : jobSource) as
        | { title: string | null; description: string | null }
        | null
        | undefined;
      const jdSummaryRaw = (job?.description ?? "").trim();
      return {
        pipelineCandidateId: row.id,
        jobId: row.job_id as string,
        candidateId: row.candidate_id as string,
        candidateName: candidate?.full_name ?? candidate?.name ?? "Candidate",
        candidateEmail: candidate?.email ?? null,
        jobTitle: job?.title ?? "Role",
        stageName: stageNameById.get(row.stage_id) ?? "Interview",
        scheduledAt: row.interview_scheduled_at as string,
        feedbackSubmitted: feedback.some((entry) => entry.submitted_by === ctx.userId),
        resumeUrl: candidate?.resume_url ?? candidate?.cv_url ?? null,
        jdSummary: jdSummaryRaw ? jdSummaryRaw.slice(0, 600) : null,
        screeningAnswers: answersByCandidateJob.get(`${row.job_id}:${row.candidate_id}`) ?? [],
      };
    });

    return jsonSuccess({ interviews });
  } catch (err) {
    return handleApiError(err, "Failed to fetch interviewer interviews", {
      route: "GET /api/interviewer/interviews",
    });
  }
}
