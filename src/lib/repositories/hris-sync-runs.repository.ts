import type { SupabaseClient } from "@supabase/supabase-js";
import type { HrisProvider, HrisSyncMode } from "@/lib/validations/hris-sync";

export interface HrisSyncRunRecord {
  id: string;
  organisation_id: string;
  provider: HrisProvider | string;
  mode: HrisSyncMode;
  status: "running" | "succeeded" | "failed" | "cancelled";
  started_at: string;
  finished_at: string | null;
  triggered_by: string | null;
  summary: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

const HRIS_SYNC_RUN_COLUMNS =
  "id, organisation_id, provider, mode, status, started_at, finished_at, triggered_by, summary, error_message, created_at, updated_at";

export async function createHrisSyncRun(
  supabase: SupabaseClient,
  payload: {
    organisationId: string;
    provider: HrisProvider;
    mode: HrisSyncMode;
    triggeredBy: string;
    summary?: unknown;
  },
) {
  const { data, error } = await supabase
    .from("hris_sync_runs")
    .insert({
      organisation_id: payload.organisationId,
      provider: payload.provider,
      mode: payload.mode,
      status: "running",
      triggered_by: payload.triggeredBy,
      summary: payload.summary ?? {},
      started_at: new Date().toISOString(),
    })
    .select(HRIS_SYNC_RUN_COLUMNS)
    .single();
  if (error) throw error;
  return data as HrisSyncRunRecord;
}

export async function completeHrisSyncRun(
  supabase: SupabaseClient,
  args: {
    id: string;
    status: "succeeded" | "failed" | "cancelled";
    summary?: unknown;
    errorMessage?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("hris_sync_runs")
    .update({
      status: args.status,
      summary: args.summary ?? {},
      error_message: args.errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", args.id)
    .select(HRIS_SYNC_RUN_COLUMNS)
    .single();
  if (error) throw error;
  return data as HrisSyncRunRecord;
}

export async function listHrisSyncRuns(
  supabase: SupabaseClient,
  args: {
    organisationId: string;
    provider?: HrisProvider;
    limit?: number;
  },
) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  let query = supabase
    .from("hris_sync_runs")
    .select(HRIS_SYNC_RUN_COLUMNS)
    .eq("organisation_id", args.organisationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args.provider) query = query.eq("provider", args.provider);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as HrisSyncRunRecord[];
}
