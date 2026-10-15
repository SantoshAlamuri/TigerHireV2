import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";

const STAGE_SELECT_V1 =
  "id, job_id, stage_name, stage_order, stage_type, sla_days, is_locked, notify_candidate, color, notify_email_body, interviewer_email, interviewer_name, feedback_template_id, interviewer_user_id";
const STAGE_SELECT_V0 =
  "id, job_id, stage_name, stage_order, stage_type, sla_days, is_locked, notify_candidate, color, notify_email_body, interviewer_email, interviewer_name, feedback_template_id";
const STAGE_SELECT_LEGACY =
  "id, job_id, stage_name, stage_order, sla_days, is_locked, notify_candidate, color, notify_email_body, interviewer_email, interviewer_name";

function isMissingColumnError(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err && typeof err.message === "string"
      ? err.message
      : String(err ?? "");
  return msg.includes("column") && msg.includes("does not exist");
}

export type StageCompatRow = {
  id: string;
  job_id: string;
  stage_name: string;
  stage_order: number;
  stage_type?: string | null;
  sla_days: number | null;
  is_locked: boolean;
  notify_candidate: boolean;
  color: string | null;
  notify_email_body: string | null;
  interviewer_email: string | null;
  interviewer_name: string | null;
  feedback_template_id?: string | null;
  interviewer_user_id?: string | null;
};

function normalizeStageRow(row: StageCompatRow): StageCompatRow {
  return {
    ...row,
    stage_type: row.stage_type ?? "screening",
    feedback_template_id: row.feedback_template_id ?? null,
    interviewer_user_id: row.interviewer_user_id ?? null,
  };
}

/**
 * Load pipeline_stages for a job, falling back to narrower SELECTs when optional columns
 * are missing (older databases).
 */
export async function fetchStagesWithCompat(
  client: SupabaseClient,
  jobId: string,
): Promise<{ rows: StageCompatRow[] | null; error: PostgrestError | null }> {
  const v1 = await client
    .from("pipeline_stages")
    .select(STAGE_SELECT_V1)
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  if (!v1.error) {
    return {
      rows: (v1.data ?? []).map((r) => normalizeStageRow(r as StageCompatRow)),
      error: null,
    };
  }
  if (!isMissingColumnError(v1.error)) {
    return { rows: null, error: v1.error };
  }

  const v0 = await client
    .from("pipeline_stages")
    .select(STAGE_SELECT_V0)
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  if (!v0.error) {
    return {
      rows: (v0.data ?? []).map((r) => normalizeStageRow(r as StageCompatRow)),
      error: null,
    };
  }
  if (!isMissingColumnError(v0.error)) {
    return { rows: null, error: v0.error };
  }

  const legacy = await client
    .from("pipeline_stages")
    .select(STAGE_SELECT_LEGACY)
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  if (legacy.error) return { rows: null, error: legacy.error };
  return {
    rows: (legacy.data ?? []).map((r) => normalizeStageRow(r as StageCompatRow)),
    error: null,
  };
}
