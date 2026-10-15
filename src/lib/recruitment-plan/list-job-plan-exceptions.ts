import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanAutoExecuteEnabled } from "./plan-auto-execute-flags";

export type PlanJobExceptionRow = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  plan_stage_name: string;
  days_in_stage: number;
  target_dwell_days: number;
  entered_at: string;
  exception_detected_at: string;
};

export async function listJobPlanExceptions(
  admin: SupabaseClient,
  jobId: string,
): Promise<PlanJobExceptionRow[]> {
  if (!isPlanAutoExecuteEnabled()) return [];

  const { data: plan } = await admin
    .from("recruitment_plans")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!plan?.id) return [];

  const { data: rows, error } = await admin
    .from("plan_candidate_stage_tracking")
    .select(
      `id, candidate_id, entered_at, exception_detected_at,
       plan_stages!inner(display_name, target_dwell_days),
       candidates(name, full_name),
       pipeline_candidates!inner(status)`,
    )
    .eq("plan_id", plan.id as string)
    .eq("job_id", jobId)
    .not("exception_detected_at", "is", null)
    .order("exception_detected_at", { ascending: false })
    .limit(25);

  if (error || !rows?.length) return [];

  const out: PlanJobExceptionRow[] = [];
  const now = Date.now();

  for (const raw of rows) {
    const pc = raw.pipeline_candidates as { status?: string } | null;
    if (pc?.status === "rejected" || pc?.status === "hired") continue;

    const planStageRaw = raw.plan_stages;
    const stage = (Array.isArray(planStageRaw) ? planStageRaw[0] : planStageRaw) as {
      display_name: string;
      target_dwell_days?: number | null;
    };
    const cand = raw.candidates as { name?: string; full_name?: string } | null;
    const enteredAt = raw.entered_at as string;
    const days = Math.floor((now - new Date(enteredAt).getTime()) / 86400000);

    out.push({
      id: raw.id as string,
      candidate_id: raw.candidate_id as string,
      candidate_name: cand?.full_name ?? cand?.name ?? "Candidate",
      plan_stage_name: stage.display_name,
      days_in_stage: days,
      target_dwell_days: Number(stage.target_dwell_days ?? 5),
      entered_at: enteredAt,
      exception_detected_at: (raw.exception_detected_at as string) ?? enteredAt,
    });
  }

  return out;
}
