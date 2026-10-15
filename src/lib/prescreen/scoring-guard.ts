import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrescreenGateEnabled } from "@/lib/prescreen/flag";
import type { GateStatus } from "@/lib/prescreen/types";

export type ScoringGuardDecision = {
  /** Block LLM scoring (failed = gated out; pending = awaiting gate resolution). */
  block: boolean;
  reason?: "gate_failed" | "gate_pending";
  gateStatus: GateStatus | null;
};

/**
 * Decide whether FitScore LLM scoring may proceed for a job+candidate.
 * Flag OFF -> never block. Flag ON -> block when gate_status is `failed` or `pending`;
 * allow `passed`, `unverified` (timeout), and NULL (no gate row).
 */
export async function checkScoringGuard(params: {
  admin: SupabaseClient;
  jobId: string;
  candidateId: string;
  organisationId?: string | null;
}): Promise<ScoringGuardDecision> {
  if (!(await isPrescreenGateEnabled(params.organisationId))) {
    return { block: false, gateStatus: null };
  }

  const { data } = await params.admin
    .from("applications")
    .select("gate_status")
    .eq("job_id", params.jobId)
    .eq("candidate_id", params.candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const gateStatus = (data?.gate_status ?? null) as GateStatus | null;
  if (gateStatus === "failed") return { block: true, reason: "gate_failed", gateStatus };
  if (gateStatus === "pending") return { block: true, reason: "gate_pending", gateStatus };
  return { block: false, gateStatus };
}
