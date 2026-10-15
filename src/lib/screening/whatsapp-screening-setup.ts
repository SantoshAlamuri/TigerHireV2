import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrescreenStage } from "@/lib/prescreen/types";
import { syncGatingQuestionsPreservingAnswers } from "@/lib/prescreen/question-sync";

/** Knockout pre-screen at apply/upload time. */
export const MAX_WHATSAPP_SCREENING_QUESTIONS_APPLY = 5;
/** Deeper qualification after the candidate is shortlisted. */
export const MAX_WHATSAPP_SCREENING_QUESTIONS_POST_SHORTLIST = 10;

/** @deprecated Use stage-specific limits. */
export const MAX_WHATSAPP_SCREENING_QUESTIONS = MAX_WHATSAPP_SCREENING_QUESTIONS_APPLY;

export type WhatsAppScreeningQuestion = {
  id: string;
  questionText: string;
};

export type WhatsAppScreeningSetupPayload = {
  whatsappEnabled: boolean;
  jdBaseReady: boolean;
  jdBaseApproved: boolean;
  jobTitle: string;
  companyName: string;
  mustHaves: string[];
  /** Knockout questions sent at apply/upload (YES/NO can gate out). */
  applyQuestions: WhatsAppScreeningQuestion[];
  /** Questions sent when the candidate is shortlisted (informational only). */
  postShortlistQuestions: WhatsAppScreeningQuestion[];
};

function maxQuestionsForStage(stage: PrescreenStage): number {
  return stage === "post_shortlist"
    ? MAX_WHATSAPP_SCREENING_QUESTIONS_POST_SHORTLIST
    : MAX_WHATSAPP_SCREENING_QUESTIONS_APPLY;
}

/** Latest JD base row for a job (approved preferred, else newest draft). */
export async function getJdBaseForScreeningSetup(
  admin: SupabaseClient,
  jobId: string,
): Promise<{
  id: string;
  approvedAt: string | null;
  idealMustHaves: string[];
} | null> {
  const { data, error } = await admin
    .from("jd_base_documents")
    .select("id, approved_at, ideal_candidate_profile")
    .eq("job_id", jobId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const profile = data.ideal_candidate_profile as { must_haves?: string[] } | null;
  return {
    id: data.id as string,
    approvedAt: (data.approved_at as string | null) ?? null,
    idealMustHaves: Array.isArray(profile?.must_haves)
      ? profile!.must_haves!.map((s) => String(s).trim()).filter(Boolean)
      : [],
  };
}

async function fetchQuestionsForStage(
  admin: SupabaseClient,
  jdBaseDocumentId: string,
  stage: PrescreenStage,
): Promise<WhatsAppScreeningQuestion[]> {
  const { data: rows, error } = await admin
    .from("prescreen_questions")
    .select("id, question_text")
    .eq("jd_base_document_id", jdBaseDocumentId)
    .eq("gating", true)
    .eq("ask_stage", stage)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (rows ?? []).map((r) => ({
    id: r.id as string,
    questionText: String(r.question_text ?? ""),
  }));
}

export async function fetchWhatsAppScreeningSetup(
  admin: SupabaseClient,
  jobId: string,
  organisationId: string,
): Promise<WhatsAppScreeningSetupPayload> {
  const [{ data: job }, { data: org }, jdBase] = await Promise.all([
    admin.from("jobs").select("title").eq("id", jobId).single(),
    admin
      .from("organisations")
      .select("name, screening_default_mode")
      .eq("id", organisationId)
      .single(),
    getJdBaseForScreeningSetup(admin, jobId),
  ]);

  let applyQuestions: WhatsAppScreeningQuestion[] = [];
  let postShortlistQuestions: WhatsAppScreeningQuestion[] = [];
  if (jdBase) {
    [applyQuestions, postShortlistQuestions] = await Promise.all([
      fetchQuestionsForStage(admin, jdBase.id, "apply"),
      fetchQuestionsForStage(admin, jdBase.id, "post_shortlist"),
    ]);
  }

  const mustHaves = jdBase?.idealMustHaves ?? [];
  if (applyQuestions.length === 0 && mustHaves.length > 0) {
    applyQuestions = mustHaves
      .slice(0, MAX_WHATSAPP_SCREENING_QUESTIONS_APPLY)
      .map((text, index) => ({
        id: `draft-apply-${index}`,
        questionText: defaultQuestionFromMustHave(text),
      }));
  }

  return {
    whatsappEnabled: org?.screening_default_mode === "whatsapp",
    jdBaseReady: Boolean(jdBase),
    jdBaseApproved: Boolean(jdBase?.approvedAt),
    jobTitle: String(job?.title ?? "this role"),
    companyName: String(org?.name ?? "the company"),
    mustHaves,
    applyQuestions,
    postShortlistQuestions,
  };
}

export function defaultQuestionFromMustHave(mustHave: string): string {
  const t = mustHave.trim();
  if (!t) return "";
  if (/^do you\b/i.test(t) || t.endsWith("?")) return t;
  return `Do you meet this requirement: ${t}?`;
}

/** Replace gating prescreen questions for one ask stage on the job's JD base. */
export async function saveWhatsAppScreeningQuestions(
  admin: SupabaseClient,
  jobId: string,
  questionTexts: string[],
  stage: PrescreenStage,
): Promise<void> {
  const trimmed = questionTexts.map((q) => q.trim()).filter(Boolean);
  const max = maxQuestionsForStage(stage);
  if (trimmed.length === 0) {
    throw new Error("Add at least one WhatsApp screening question.");
  }
  if (trimmed.length > max) {
    throw new Error(`Maximum ${max} questions allowed for this stage.`);
  }

  const jdBase = await getJdBaseForScreeningSetup(admin, jobId);
  if (!jdBase) {
    throw new Error("Complete Scoring setup first (Ideal Profile), then return here.");
  }

  await syncGatingQuestionsPreservingAnswers(
    admin,
    jdBase.id,
    stage,
    trimmed.map((question_text) => ({
      question_text,
      requirement_id: null,
      answer_type: "yes_no",
      options: ["Yes", "No"],
      gating: true,
    })),
  );

  if (stage === "apply") {
    await syncApplyPrescreenToJobScreening(admin, jobId, trimmed);
  }
}

/**
 * Mirror apply-stage WhatsApp knockout questions into job_screening_questions so
 * the public apply form and Screening review use one config for WhatsApp orgs.
 */
export async function syncApplyPrescreenToJobScreening(
  admin: SupabaseClient,
  jobId: string,
  questionTexts: string[],
): Promise<void> {
  const { error: delErr } = await admin
    .from("job_screening_questions")
    .delete()
    .eq("job_id", jobId);
  if (delErr) throw delErr;

  if (questionTexts.length === 0) return;

  const { error: insErr } = await admin.from("job_screening_questions").insert(
    questionTexts.map((question_text, index) => ({
      job_id: jobId,
      question_text,
      fail_on_yes: false,
      sort_order: index,
      is_active: true,
      answer_type: "yes_no",
      options: null,
    })),
  );
  if (insErr) throw insErr;
}

/** Used on JD approve — do not overwrite recruiter-edited WhatsApp questions. */
export async function deriveGatingPrescreenQuestionsIfEmpty(
  admin: SupabaseClient,
  jdBaseDocumentId: string,
): Promise<void> {
  const { count, error: countErr } = await admin
    .from("prescreen_questions")
    .select("id", { count: "exact", head: true })
    .eq("jd_base_document_id", jdBaseDocumentId)
    .eq("gating", true)
    .eq("ask_stage", "apply");
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) return;

  const { upsertPrescreenQuestionsForJdBase } = await import("@/lib/prescreen/derive");
  await upsertPrescreenQuestionsForJdBase(admin, jdBaseDocumentId);
}
