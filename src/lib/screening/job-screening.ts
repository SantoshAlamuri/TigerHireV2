import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getApprovedJdBase, getGatingQuestions } from "@/lib/prescreen/repository";
import { isOrgWhatsappScreeningEnabled } from "@/lib/screening/org-whatsapp-screening";
import { syncApplyPrescreenToJobScreening } from "@/lib/screening/whatsapp-screening-setup";

export type ScreeningAnswerType = "yes_no" | "single_select";

/** A single_select choice. `knockout` choices fail the gate when selected. */
export type ScreeningOption = { label: string; knockout: boolean };

export type JobScreeningQuestionRow = {
  id: string;
  question_text: string;
  fail_on_yes: boolean;
  sort_order: number;
  is_active: boolean;
  answer_type: ScreeningAnswerType;
  options: ScreeningOption[] | null;
};

/** An answer carries `answerYes` for yes_no questions, or `answerText` (the chosen label) for single_select. */
export const screeningAnswerItemSchema = z
  .object({
    questionId: z.string().uuid(),
    answerYes: z.boolean().optional(),
    answerText: z.string().trim().min(1).max(200).optional(),
  })
  .refine((a) => a.answerYes !== undefined || a.answerText !== undefined, {
    message: "Each answer needs answerYes or answerText.",
  });

export const screeningAnswersPayloadSchema = z.array(screeningAnswerItemSchema);

export type ScreeningAnswerItem = z.infer<typeof screeningAnswerItemSchema>;

/**
 * Public apply / JD: no knockout metadata (candidates cannot see which choice fails).
 * single_select questions expose their option labels so the candidate can choose.
 */
export type PublicScreeningQuestion = {
  id: string;
  questionText: string;
  sortOrder: number;
  answerType: ScreeningAnswerType;
  options: string[] | null;
};

/** Recruiter manage API: full row including knockout metadata. */
export type ManageScreeningQuestion = PublicScreeningQuestion & {
  failOnYes: boolean;
  isActive: boolean;
  optionsDetail: ScreeningOption[] | null;
};

/** Safely parse the `options` jsonb column into typed choices. */
export function parseScreeningOptions(raw: unknown): ScreeningOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => (o && typeof o === "object" ? (o as Record<string, unknown>) : null))
    .filter((o): o is Record<string, unknown> => o !== null)
    .map((o) => ({ label: String(o.label ?? "").trim(), knockout: Boolean(o.knockout) }))
    .filter((o) => o.label.length > 0);
}

function normalizeRow(r: Record<string, unknown>): JobScreeningQuestionRow {
  const answerType: ScreeningAnswerType =
    r.answer_type === "single_select" ? "single_select" : "yes_no";
  return {
    id: String(r.id),
    question_text: String(r.question_text ?? ""),
    fail_on_yes: Boolean(r.fail_on_yes),
    sort_order: Number(r.sort_order ?? 0),
    is_active: Boolean(r.is_active),
    answer_type: answerType,
    options: answerType === "single_select" ? parseScreeningOptions(r.options) : null,
  };
}

const SCREENING_QUESTION_COLUMNS =
  "id, question_text, fail_on_yes, sort_order, is_active, answer_type, options";

export async function fetchActiveScreeningQuestions(
  supabase: SupabaseClient,
  jobId: string,
  organisationId?: string | null,
): Promise<JobScreeningQuestionRow[]> {
  if (organisationId && (await isOrgWhatsappScreeningEnabled(organisationId, supabase))) {
    await ensureJobScreeningSyncedFromPrescreenApply(supabase, jobId);
  }

  const { data, error } = await supabase
    .from("job_screening_questions")
    .select(SCREENING_QUESTION_COLUMNS)
    .eq("job_id", jobId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => normalizeRow(r as Record<string, unknown>));
}

/** Backfill job_screening_questions from apply prescreen when WhatsApp org has not synced yet. */
async function ensureJobScreeningSyncedFromPrescreenApply(
  supabase: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { count, error: countErr } = await supabase
    .from("job_screening_questions")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("is_active", true);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) return;

  const jdBase = await getApprovedJdBase(supabase, jobId);
  if (!jdBase) return;

  const applyQs = await getGatingQuestions(supabase, jdBase.id, "apply");
  if (applyQs.length === 0) return;

  await syncApplyPrescreenToJobScreening(
    supabase,
    jobId,
    applyQs.map((q) => q.question_text),
  );
}

/** Does a single answer fail its question? null result = unanswered/invalid (treated as incomplete). */
function answerFailsQuestion(q: JobScreeningQuestionRow, a: ScreeningAnswerItem): boolean | null {
  if (q.answer_type === "single_select") {
    const text = (a.answerText ?? "").trim().toLowerCase();
    if (!text) return null;
    const matched = (q.options ?? []).find((o) => o.label.trim().toLowerCase() === text);
    if (!matched) return null;
    return matched.knockout;
  }
  if (a.answerYes == null) return null;
  return q.fail_on_yes ? a.answerYes === true : a.answerYes === false;
}

/**
 * Returns whether the application should be allowed to proceed; no DB writes.
 */
export function evaluateScreeningAnswers(
  questions: JobScreeningQuestionRow[],
  answers: ScreeningAnswerItem[] | null | undefined,
): { ok: true } | { ok: false; reason: "incomplete" | "knockout"; message: string } {
  if (questions.length === 0) return { ok: true };

  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const list = answers ?? [];
  if (list.length > 0) {
    const u = new Set(list.map((a) => a.questionId));
    if (u.size !== list.length) {
      return {
        ok: false,
        reason: "incomplete",
        message: "Each screening question must be answered once.",
      };
    }
  }

  for (const a of list) {
    const q = byId.get(a.questionId);
    if (!q) {
      return { ok: false, reason: "incomplete", message: "Invalid screening question reference." };
    }
    const fails = answerFailsQuestion(q, a);
    if (fails === null) {
      return {
        ok: false,
        reason: "incomplete",
        message: "Please answer all screening questions before applying.",
      };
    }
    seen.add(a.questionId);
    if (fails) {
      return {
        ok: false,
        reason: "knockout",
        message:
          "Based on your answers, you do not meet a minimum requirement for this role. You have not been added to the pipeline for this job.",
      };
    }
  }

  for (const q of questions) {
    if (!seen.has(q.id)) {
      return {
        ok: false,
        reason: "incomplete",
        message: "Please answer all screening questions before applying.",
      };
    }
  }

  return { ok: true };
}

export function toPublicQuestions(rows: JobScreeningQuestionRow[]): PublicScreeningQuestion[] {
  return rows.map((r) => ({
    id: r.id,
    questionText: r.question_text,
    sortOrder: r.sort_order,
    answerType: r.answer_type,
    options: r.answer_type === "single_select" ? (r.options ?? []).map((o) => o.label) : null,
  }));
}
