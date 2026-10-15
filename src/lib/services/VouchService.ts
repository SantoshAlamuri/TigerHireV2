import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

const VOUCH_COLUMNS =
  "id, candidate_id, voucher_name, relationship_type, standout_sentence, strength_score, created_at";

export const VouchService = {
  async getVouchesForCandidate(supabase: SupabaseClient, candidateId: string) {
    const { data, error } = await supabase
      .from("vouches")
      .select(VOUCH_COLUMNS)
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async getTrustScore(supabase: SupabaseClient, candidateId: string) {
    const { data } = await supabase
      .from("candidates")
      .select("trust_score, ghost_risk_score")
      .eq("id", candidateId)
      .single();
    return data;
  },

  async updateTrustScore(
    supabase: SupabaseClient,
    candidateId: string,
    trustScore: number,
    ghostRisk: number,
  ) {
    const { error } = await supabase
      .from("candidates")
      .update({
        trust_score: trustScore,
        ghost_risk_score: ghostRisk,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (error) throw error;
    logger.info("Trust score updated", {
      candidate_id: candidateId,
      trust_score: trustScore,
    });
  },
};
