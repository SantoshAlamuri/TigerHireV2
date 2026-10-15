import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import type { PrescreenStage } from "@/lib/prescreen/types";
import { getApprovedJdBase, getGatingQuestions, getSession } from "@/lib/prescreen/repository";

/**
 * Clear an incomplete prescreen session so a fresh invite can be sent.
 * Completed sessions are left untouched (returns false).
 */
export async function resetIncompletePrescreenSession(
  admin: SupabaseClient,
  params: {
    jobId: string;
    candidateId: string;
    stage: PrescreenStage;
  },
): Promise<boolean> {
  const existing = await getSession(admin, params.jobId, params.candidateId, params.stage);
  if (!existing) return false;

  const jdBase = await getApprovedJdBase(admin, params.jobId);
  if (jdBase) {
    const questions = await getGatingQuestions(admin, jdBase.id, params.stage);
    const questionIds = questions.map((q) => q.id);
    if (existing.state === "complete" && questionIds.length > 0) {
      const { data: responses } = await admin
        .from("prescreen_responses")
        .select("question_id")
        .eq("job_id", params.jobId)
        .eq("candidate_id", params.candidateId)
        .in("question_id", questionIds);
      const answered = new Set((responses ?? []).map((r) => r.question_id as string));
      if (questions.every((q) => answered.has(q.id))) return false;
    } else if (existing.state === "complete") {
      return false;
    }
    if (questionIds.length > 0) {
      const { error: respErr } = await admin
        .from("prescreen_responses")
        .delete()
        .eq("job_id", params.jobId)
        .eq("candidate_id", params.candidateId)
        .in("question_id", questionIds);
      if (respErr) throw respErr;
    }
  }

  const { error: delErr } = await admin.from("prescreen_sessions").delete().eq("id", existing.id);
  if (delErr) throw delErr;

  logger.info("[prescreen] incomplete session reset for resend", {
    jobId: params.jobId,
    candidateId: params.candidateId,
    stage: params.stage,
    previousState: existing.state,
  });
  return true;
}
