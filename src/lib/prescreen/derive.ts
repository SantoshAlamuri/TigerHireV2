import type { SupabaseClient } from "@supabase/supabase-js";
import { syncGatingQuestionsPreservingAnswers } from "@/lib/prescreen/question-sync";

export type PrescreenQuestionDraft = {
  requirement_id: string | null;
  question_text: string;
  answer_type: "yes_no" | "range" | "single_select";
  options: string[] | null;
  gating: boolean;
};

const MAX_GATING_QUESTIONS = 5;

/** Build ≤5 gating prescreen questions from must-have jd_requirements. */
export async function derivePrescreenQuestions(
  admin: SupabaseClient,
  jdBaseDocumentId: string,
): Promise<PrescreenQuestionDraft[]> {
  const { data: reqs, error } = await admin
    .from("jd_requirements")
    .select("id, text, tier, kind, verifiable")
    .eq("jd_base_document_id", jdBaseDocumentId)
    .eq("tier", "must_have")
    .order("created_at", { ascending: true })
    .limit(MAX_GATING_QUESTIONS);

  if (error) throw error;
  if (!reqs?.length) return [];

  return reqs.map((r) => ({
    requirement_id: r.id,
    question_text: `Do you meet this requirement: ${r.text}?`,
    answer_type: "yes_no" as const,
    options: ["Yes", "No"],
    gating: true,
  }));
}

/** Sync apply-stage prescreen_questions for a JD Base (does not touch post-shortlist). */
export async function upsertPrescreenQuestionsForJdBase(
  admin: SupabaseClient,
  jdBaseDocumentId: string,
): Promise<void> {
  const drafts = await derivePrescreenQuestions(admin, jdBaseDocumentId);
  await syncGatingQuestionsPreservingAnswers(
    admin,
    jdBaseDocumentId,
    "apply",
    drafts.map((d) => ({
      question_text: d.question_text,
      requirement_id: d.requirement_id,
      answer_type: d.answer_type,
      options: d.options,
      gating: d.gating,
    })),
  );
}
