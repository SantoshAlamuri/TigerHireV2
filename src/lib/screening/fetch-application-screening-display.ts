import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplicationScreeningAnswerDisplay = {
  questionId: string;
  questionText: string;
  failOnYes: boolean;
  sortOrder: number;
  answerYes: boolean;
  /** For this application row, the answer is not a knockout (same rule as `evaluateScreeningAnswers`). */
  passed: boolean;
};

/** Aligned with `evaluateScreeningAnswers` — a stored row should always have passed true for admitted applications. */
export function passedScreeningAnswer(failOnYes: boolean, answerYes: boolean): boolean {
  const fails = failOnYes ? answerYes : !answerYes;
  return !fails;
}

function firstRelation<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Read stored pre-screen answers for an application (service role — call only after authz on the parent application).
 */
export async function fetchApplicationScreeningAnswersForDisplay(
  admin: SupabaseClient,
  applicationId: string,
): Promise<ApplicationScreeningAnswerDisplay[]> {
  const { data, error } = await admin
    .from("application_screening_answers")
    .select("answer_yes, job_screening_questions(id, question_text, fail_on_yes, sort_order)")
    .eq("application_id", applicationId);

  if (error) throw error;

  const out: ApplicationScreeningAnswerDisplay[] = [];
  for (const r of data ?? []) {
    const q = firstRelation(
      r.job_screening_questions as
        | { id: string; question_text: string; fail_on_yes: boolean; sort_order: number }
        | { id: string; question_text: string; fail_on_yes: boolean; sort_order: number }[]
        | null
        | undefined,
    );
    if (!q) continue;
    const answerYes = Boolean((r as { answer_yes?: boolean }).answer_yes);
    out.push({
      questionId: q.id,
      questionText: q.question_text,
      failOnYes: q.fail_on_yes,
      sortOrder: q.sort_order,
      answerYes,
      passed: passedScreeningAnswer(q.fail_on_yes, answerYes),
    });
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}
