import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import type { PrescreenStage } from "@/lib/prescreen/types";

export type GatingQuestionDraft = {
  question_text: string;
  requirement_id: string | null;
  answer_type: string;
  options: string[] | null;
  gating: boolean;
};

function normalizeText(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Answer-preserving replacement for the delete-then-insert question sync.
 *
 * - Questions whose text is unchanged keep their row (and id), so existing
 *   prescreen_responses stay linked.
 * - Removed questions are deleted only when no candidate has answered them;
 *   answered ones are demoted to gating=false (retired, answers retained) —
 *   also required by the ON DELETE RESTRICT constraint on
 *   prescreen_responses.question_id.
 * - Only genuinely new texts are inserted.
 */
export async function syncGatingQuestionsPreservingAnswers(
  admin: SupabaseClient,
  jdBaseDocumentId: string,
  stage: PrescreenStage,
  drafts: GatingQuestionDraft[],
): Promise<{ kept: number; inserted: number; deleted: number; retired: number }> {
  const { data: existing, error: exErr } = await admin
    .from("prescreen_questions")
    .select("id, question_text")
    .eq("jd_base_document_id", jdBaseDocumentId)
    .eq("ask_stage", stage)
    .eq("gating", true);
  if (exErr) throw exErr;

  const wantByNorm = new Map(drafts.map((d) => [normalizeText(d.question_text), d]));
  const keptIds = new Set<string>();
  const toInsert = new Map(wantByNorm);

  for (const row of existing ?? []) {
    const n = normalizeText(String(row.question_text ?? ""));
    if (wantByNorm.has(n) && toInsert.has(n)) {
      keptIds.add(row.id as string);
      toInsert.delete(n);
    }
  }

  const removed = (existing ?? []).filter((r) => !keptIds.has(r.id as string));
  let deleted = 0;
  let retired = 0;

  if (removed.length > 0) {
    const removedIds = removed.map((r) => r.id as string);
    const { data: answered, error: ansErr } = await admin
      .from("prescreen_responses")
      .select("question_id")
      .in("question_id", removedIds);
    if (ansErr) throw ansErr;
    const answeredIds = new Set((answered ?? []).map((r) => r.question_id as string));

    const deletable = removedIds.filter((id) => !answeredIds.has(id));
    const demote = removedIds.filter((id) => answeredIds.has(id));

    if (deletable.length > 0) {
      const { error: delErr } = await admin
        .from("prescreen_questions")
        .delete()
        .in("id", deletable);
      if (delErr) throw delErr;
      deleted = deletable.length;
    }
    if (demote.length > 0) {
      const { error: demErr } = await admin
        .from("prescreen_questions")
        .update({ gating: false })
        .in("id", demote);
      if (demErr) throw demErr;
      retired = demote.length;
      logger.info("[prescreen] retired answered questions instead of deleting", {
        jdBaseDocumentId,
        stage,
        retired: demote.length,
      });
    }
  }

  if (toInsert.size > 0) {
    const { error: insErr } = await admin.from("prescreen_questions").insert(
      [...toInsert.values()].map((d) => ({
        jd_base_document_id: jdBaseDocumentId,
        requirement_id: d.requirement_id,
        question_text: d.question_text,
        answer_type: d.answer_type,
        options: d.options,
        gating: d.gating,
        ask_stage: stage,
      })),
    );
    if (insErr) throw insErr;
  }

  return { kept: keptIds.size, inserted: toInsert.size, deleted, retired };
}
