import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { CascadeLayer } from "./types";

/**
 * Append a row to cascade_decisions. Fire-and-forget — observability MUST NOT
 * block the scoring path or fail the request.
 */
export async function logCascadeDecision(params: {
  supabase?: SupabaseClient;
  entityHash: string;
  candidateId?: string | null;
  jobId?: string | null;
  organisationId?: string | null;
  layerResolved: CascadeLayer;
  knockoutReason?: string | null;
  costInrPaise: number;
  costUsdMicros: number;
  latencyMs: number;
  cacheHit: boolean;
}): Promise<void> {
  const supabase = params.supabase ?? createSupabaseAdmin();
  try {
    const { error } = await supabase.from("cascade_decisions").insert({
      entity_hash: params.entityHash,
      candidate_id: params.candidateId ?? null,
      job_id: params.jobId ?? null,
      organisation_id: params.organisationId ?? null,
      layer_resolved: params.layerResolved,
      knockout_reason: params.knockoutReason ?? null,
      cost_inr_paise: params.costInrPaise,
      cost_usd_micros: params.costUsdMicros,
      latency_ms: params.latencyMs,
      cache_hit: params.cacheHit,
    });
    if (error) {
      logger.warn("cascade_decision log failed", { error: error.message });
    }
  } catch (err) {
    logger.warn("cascade_decision log threw", { error: String(err) });
  }
}
