import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { CascadeLayer } from "./types";

/**
 * Cached verdict from a prior cascade run. Returned by lookupVerdictCache when
 * the (candidate, jd) pair has been resolved before.
 */
export interface CachedVerdict {
  entity_hash: string;
  layer_resolved: CascadeLayer;
  verdict_json: Record<string, unknown>;
  cost_inr_paise: number;
  created_at: string;
}

const DEFAULT_TTL_DAYS = 7;

/**
 * Lookup an unexpired, uninvalidated verdict for an entity_hash. Returns null
 * on miss (caller proceeds to compute). Failsafe — DB hiccups fall through to
 * recompute rather than block scoring.
 */
export async function lookupVerdictCache(
  supabase: SupabaseClient,
  entityHash: string,
): Promise<CachedVerdict | null> {
  try {
    const { data, error } = await supabase
      .from("verdict_cache")
      .select("entity_hash, layer_resolved, verdict_json, cost_inr_paise, created_at")
      .eq("entity_hash", entityHash)
      .is("invalidated_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      logger.warn("verdict_cache lookup failed", { hash: entityHash, error: error.message });
      return null;
    }
    if (!data) return null;

    return {
      entity_hash: data.entity_hash as string,
      layer_resolved: data.layer_resolved as CachedVerdict["layer_resolved"],
      verdict_json: (data.verdict_json as Record<string, unknown>) ?? {},
      cost_inr_paise: (data.cost_inr_paise as number) ?? 0,
      created_at: data.created_at as string,
    };
  } catch (err) {
    logger.warn("verdict_cache lookup threw", { hash: entityHash, error: String(err) });
    return null;
  }
}

/**
 * Persist a verdict to the cache. UPSERT keyed on (entity_hash) so re-running
 * the cascade after manual invalidation rewrites the row instead of conflicting.
 */
export async function writeVerdictCache(params: {
  supabase?: SupabaseClient;
  entityHash: string;
  candidateId?: string | null;
  jobId?: string | null;
  organisationId?: string | null;
  layerResolved: Exclude<CascadeLayer, "CACHE_HIT">;
  verdict: Record<string, unknown>;
  costInrPaise: number;
  ttlDays?: number;
}): Promise<void> {
  const supabase = params.supabase ?? createSupabaseAdmin();
  const expiresAt = new Date(
    Date.now() + (params.ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const { error } = await supabase.from("verdict_cache").upsert(
      {
        entity_hash: params.entityHash,
        candidate_id: params.candidateId ?? null,
        job_id: params.jobId ?? null,
        organisation_id: params.organisationId ?? null,
        layer_resolved: params.layerResolved,
        verdict_json: params.verdict,
        cost_inr_paise: params.costInrPaise,
        invalidated_at: null,
        invalidated_reason: null,
        expires_at: expiresAt,
      },
      { onConflict: "entity_hash" },
    );
    if (error) {
      logger.warn("verdict_cache write failed", {
        hash: params.entityHash,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("verdict_cache write threw", {
      hash: params.entityHash,
      error: String(err),
    });
  }
}

/**
 * Mark a cached verdict as invalid (e.g. recruiter flagged the score as wrong,
 * the JD was edited, or the candidate uploaded a new CV). The cache lookup will
 * miss after this and the next call recomputes.
 */
export async function invalidateVerdictCache(params: {
  supabase?: SupabaseClient;
  entityHash: string;
  reason: string;
}): Promise<void> {
  const supabase = params.supabase ?? createSupabaseAdmin();
  try {
    const { error } = await supabase
      .from("verdict_cache")
      .update({
        invalidated_at: new Date().toISOString(),
        invalidated_reason: params.reason.slice(0, 200),
      })
      .eq("entity_hash", params.entityHash)
      .is("invalidated_at", null);
    if (error) {
      logger.warn("verdict_cache invalidate failed", {
        hash: params.entityHash,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("verdict_cache invalidate threw", {
      hash: params.entityHash,
      error: String(err),
    });
  }
}
