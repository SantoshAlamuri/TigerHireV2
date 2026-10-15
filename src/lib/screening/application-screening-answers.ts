import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScreeningAnswerItem } from "./job-screening";

export async function upsertApplicationScreeningAnswers(
  admin: SupabaseClient,
  applicationId: string,
  answers: ScreeningAnswerItem[],
): Promise<void> {
  if (answers.length === 0) return;
  const { error } = await admin.from("application_screening_answers").upsert(
    answers.map((a) => ({
      application_id: applicationId,
      question_id: a.questionId,
      answer_yes: a.answerYes ?? null,
      answer_text: a.answerText ?? null,
    })),
    { onConflict: "application_id,question_id" },
  );
  if (error) throw error;
}
