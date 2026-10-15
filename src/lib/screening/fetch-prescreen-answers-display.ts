import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrescreenStage } from "@/lib/prescreen/types";
import { getApprovedJdBase, getGatingQuestions } from "@/lib/prescreen/repository";

export type PrescreenAnswerDisplay = {
  questionId: string;
  questionText: string;
  phase: PrescreenStage;
  phaseLabel: string;
  answer: string;
  passed: boolean;
  sortOrder: number;
};

const PHASE_LABELS: Record<PrescreenStage, string> = {
  apply: "Pre-screen (at apply)",
  post_shortlist: "After shortlist",
};

const PHASE_SORT: Record<PrescreenStage, number> = {
  apply: 0,
  post_shortlist: 100,
};

/**
 * WhatsApp prescreen answers for a candidate on a job (both lifecycle phases).
 * Service role — call only after authz on the parent application/candidate.
 */
export async function fetchPrescreenAnswersForDisplay(
  admin: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<PrescreenAnswerDisplay[]> {
  const jdBase = await getApprovedJdBase(admin, jobId);
  if (!jdBase) return [];

  const [applyQs, postQs] = await Promise.all([
    getGatingQuestions(admin, jdBase.id, "apply"),
    getGatingQuestions(admin, jdBase.id, "post_shortlist"),
  ]);

  const questionMeta = new Map<
    string,
    { text: string; phase: PrescreenStage; sortOrder: number }
  >();
  applyQs.forEach((q, i) => {
    questionMeta.set(q.id, {
      text: q.question_text,
      phase: "apply",
      sortOrder: PHASE_SORT.apply + i,
    });
  });
  postQs.forEach((q, i) => {
    questionMeta.set(q.id, {
      text: q.question_text,
      phase: "post_shortlist",
      sortOrder: PHASE_SORT.post_shortlist + i,
    });
  });

  const questionIds = [...questionMeta.keys()];
  if (questionIds.length === 0) return [];

  const { data: rows, error } = await admin
    .from("prescreen_responses")
    .select("question_id, answer, passed")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .in("question_id", questionIds);
  if (error) throw error;

  const out: PrescreenAnswerDisplay[] = [];
  for (const r of rows ?? []) {
    const qid = r.question_id as string;
    const meta = questionMeta.get(qid);
    if (!meta) continue;
    out.push({
      questionId: qid,
      questionText: meta.text,
      phase: meta.phase,
      phaseLabel: PHASE_LABELS[meta.phase],
      answer: String(r.answer ?? ""),
      passed: r.passed === true,
      sortOrder: meta.sortOrder,
    });
  }

  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}
