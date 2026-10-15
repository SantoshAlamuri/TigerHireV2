import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ScreeningJob,
  ScreeningJobInsert,
  ScreeningJobUpdate,
  ScreeningStatus,
  ScreeningSummary,
} from "./types";

const SCREENING_JOB_COLUMNS = [
  "id",
  "organisation_id",
  "candidate_id",
  "req_id",
  "mode",
  "status",
  "bolna_call_id",
  "audio_url",
  "duration_seconds",
  "whatsapp_thread_id",
  "whatsapp_message_count",
  "transcript_url",
  "summary_json",
  "recommendation",
  "scheduled_at",
  "started_at",
  "ended_at",
  "last_activity_at",
  "nudge_sent_at",
  "created_at",
  "updated_at",
  "billable",
  "billed_at",
  "cost_inr",
  "charge_inr",
  "triggered_by",
  "overridden_from_mode",
  "recruiter_id",
].join(", ");

type ScreeningJobRow = Omit<ScreeningJob, "summary_json"> & {
  summary_json: ScreeningSummary | null;
};

function mapScreeningJobRow(row: ScreeningJobRow): ScreeningJob {
  return {
    ...row,
    summary_json: row.summary_json,
  };
}

function toScreeningJobRow(value: unknown): ScreeningJobRow {
  return value as ScreeningJobRow;
}

export async function createScreeningJob(
  supabase: SupabaseClient,
  payload: ScreeningJobInsert,
): Promise<ScreeningJob> {
  const { data, error } = await supabase
    .from("screening_jobs")
    .insert(payload)
    .select(SCREENING_JOB_COLUMNS)
    .single();
  if (error) throw error;
  return mapScreeningJobRow(toScreeningJobRow(data));
}

export async function getScreeningJobById(
  supabase: SupabaseClient,
  args: { id: string; organisationId?: string },
): Promise<ScreeningJob | null> {
  let query = supabase.from("screening_jobs").select(SCREENING_JOB_COLUMNS).eq("id", args.id);
  if (args.organisationId) query = query.eq("organisation_id", args.organisationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapScreeningJobRow(toScreeningJobRow(data)) : null;
}

export async function updateScreeningJobById(
  supabase: SupabaseClient,
  args: { id: string; organisationId?: string; patch: ScreeningJobUpdate },
): Promise<ScreeningJob | null> {
  if (Object.keys(args.patch).length === 0) {
    return getScreeningJobById(supabase, { id: args.id, organisationId: args.organisationId });
  }

  let query = supabase
    .from("screening_jobs")
    .update(args.patch)
    .eq("id", args.id)
    .select(SCREENING_JOB_COLUMNS);
  if (args.organisationId) query = query.eq("organisation_id", args.organisationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapScreeningJobRow(toScreeningJobRow(data)) : null;
}

export async function setScreeningJobStatus(
  supabase: SupabaseClient,
  args: {
    id: string;
    status: ScreeningStatus;
    organisationId?: string;
    startedAt?: string | null;
    endedAt?: string | null;
  },
): Promise<ScreeningJob | null> {
  const patch: ScreeningJobUpdate = { status: args.status };
  if (args.startedAt !== undefined) patch.started_at = args.startedAt;
  if (args.endedAt !== undefined) patch.ended_at = args.endedAt;
  return updateScreeningJobById(supabase, {
    id: args.id,
    organisationId: args.organisationId,
    patch,
  });
}

export async function listScreeningJobsForCandidate(
  supabase: SupabaseClient,
  args: { organisationId: string; candidateId: string; limit?: number },
): Promise<ScreeningJob[]> {
  const { data, error } = await supabase
    .from("screening_jobs")
    .select(SCREENING_JOB_COLUMNS)
    .eq("organisation_id", args.organisationId)
    .eq("candidate_id", args.candidateId)
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 25);
  if (error) throw error;
  return (data ?? []).map((row) => mapScreeningJobRow(toScreeningJobRow(row)));
}

export async function listTenantScreeningJobsByStatus(
  supabase: SupabaseClient,
  args: { organisationId: string; statuses: ScreeningStatus[]; limit?: number },
): Promise<ScreeningJob[]> {
  let query = supabase
    .from("screening_jobs")
    .select(SCREENING_JOB_COLUMNS)
    .eq("organisation_id", args.organisationId)
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 100);

  if (args.statuses.length > 0) {
    query = query.in("status", args.statuses);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapScreeningJobRow(toScreeningJobRow(row)));
}

export async function findActiveScreeningJobForCandidate(
  supabase: SupabaseClient,
  args: { organisationId: string; candidateId: string; reqId?: string },
): Promise<ScreeningJob | null> {
  let query = supabase
    .from("screening_jobs")
    .select(SCREENING_JOB_COLUMNS)
    .eq("organisation_id", args.organisationId)
    .eq("candidate_id", args.candidateId)
    .in("status", ["queued", "awaiting_consent", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (args.reqId) query = query.eq("req_id", args.reqId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapScreeningJobRow(toScreeningJobRow(data)) : null;
}
