import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

/**
 * Deep-copy a job's SETUP into a new DRAFT job (same org): JD/description, JD Base (ICP + scoring
 * rubric), pipeline stages, and screening questions. Candidates/applications/fit-scores are NOT
 * copied — the copy is a fresh, un-posted draft the recruiter reviews before publishing.
 *
 * Column lists are explicit allowlists (verified against the live schema) so runtime/identity
 * fields (id, status, timestamps, embeddings, dedup, posting state) never leak into the copy.
 * Inserts run via the service-role admin client; the caller must first authorise access to the
 * source job (org scoping). On any child-insert failure the new job is deleted (FK cascade cleans
 * the partial copy), so a copy either fully succeeds or leaves nothing behind.
 */

type Row = Record<string, unknown>;

// SETUP columns copied verbatim from the source job row.
const JOB_SETUP_COLUMNS = [
  "title",
  "description",
  "location",
  "compensation_min",
  "compensation_max",
  "hiring_manager_id",
  "role_function",
  "seniority_level",
  "skills_required",
  "skills_preferred",
  "remote_allowed",
  "jd_sections",
  "assigned_recruiter_id",
  "show_salary",
  "skills_rubric",
  "list_on_public_job_board",
  "list_for_internal_referrals",
  "applications_close_at",
  "source",
  "tier",
  "role_category",
  "city",
].join(", ");

const JD_BASE_COLUMNS =
  "role_title, company, context, weights, score_floor, fit_thresholds, extraction_additions, ideal_candidate_profile, structured_jd";
const PIPELINE_STAGE_COLUMNS =
  "stage_name, stage_order, interviewer_email, interviewer_name, stage_type, sla_days, is_locked, notify_candidate, color, notify_email_body, interviewer_user_id";
const SCREENING_QUESTION_COLUMNS = "question_text, fail_on_yes, sort_order, is_active";

export async function copyJobSetup(
  admin: SupabaseClient,
  params: { sourceJobId: string; organisationId: string; createdBy: string },
): Promise<{ jobId: string }> {
  const { sourceJobId, organisationId, createdBy } = params;

  const { data: srcRow, error: srcErr } = await admin
    .from("jobs")
    .select(JOB_SETUP_COLUMNS)
    .eq("id", sourceJobId)
    .single();
  if (srcErr || !srcRow) {
    throw new Error(`copy_job: source job not found (${String(srcErr?.message ?? srcErr)})`);
  }
  const src = srcRow as unknown as Row;

  // New draft job: copied setup + reset identity/runtime/posting state.
  const insertRow: Row = {
    ...src,
    organisation_id: organisationId,
    created_by: createdBy,
    title: `${(src.title as string)?.trim() || "Untitled role"} (Copy)`,
    status: "draft",
    is_active: false,
    jd_embedding: null,
    shortlist_due_at: null,
    shortlist_delivered_at: null,
    hiring_request_id: null,
    dedup_fingerprint: null,
    source_url: null,
    source_job_id: null,
    posted_at: null,
  };

  const { data: created, error: insErr } = await admin
    .from("jobs")
    .insert(insertRow)
    .select("id")
    .single();
  if (insErr || !created) {
    throw new Error(`copy_job: failed to create job (${String(insErr?.message ?? insErr)})`);
  }
  const jobId = (created as { id: string }).id;

  try {
    // JD Base (scoring rubric / ICP) — reset approval so the draft is re-approved before scoring.
    const { data: jdBaseRow } = await admin
      .from("jd_base_documents")
      .select(JD_BASE_COLUMNS)
      .eq("job_id", sourceJobId)
      .maybeSingle();
    const jdBase = jdBaseRow as unknown as Row | null;
    if (jdBase) {
      const { error } = await admin
        .from("jd_base_documents")
        .insert({ ...jdBase, job_id: jobId, approved_by: null, approved_at: null, version: 1 });
      if (error) throw new Error(`jd_base copy failed: ${error.message}`);
    }

    // Pipeline stages — preserve order.
    const { data: stageRows } = await admin
      .from("pipeline_stages")
      .select(PIPELINE_STAGE_COLUMNS)
      .eq("job_id", sourceJobId)
      .order("stage_order", { ascending: true });
    const stages = (stageRows ?? []) as unknown as Row[];
    if (stages.length > 0) {
      const { error } = await admin
        .from("pipeline_stages")
        .insert(stages.map((s) => ({ ...s, job_id: jobId })));
      if (error) throw new Error(`pipeline_stages copy failed: ${error.message}`);
    }

    // Screening questions.
    const { data: questionRows } = await admin
      .from("job_screening_questions")
      .select(SCREENING_QUESTION_COLUMNS)
      .eq("job_id", sourceJobId)
      .order("sort_order", { ascending: true });
    const questions = (questionRows ?? []) as unknown as Row[];
    if (questions.length > 0) {
      const { error } = await admin
        .from("job_screening_questions")
        .insert(questions.map((q) => ({ ...q, job_id: jobId, organisation_id: organisationId })));
      if (error) throw new Error(`screening_questions copy failed: ${error.message}`);
    }
  } catch (err) {
    // Compensating delete — FK cascade removes any children already inserted.
    await admin.from("jobs").delete().eq("id", jobId);
    logger.error("copy_job_rollback", {
      sourceJobId,
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  logger.info("copy_job_success", { sourceJobId, newJobId: jobId, organisationId });
  return { jobId };
}
