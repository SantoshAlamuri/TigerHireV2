import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Recalculate trust score for a candidate from entry_path, vouches,
 * verification_claims, profile completeness, and authenticity detection.
 *
 * ## Formula (v2 — April 2026)
 *
 * | Input                          | Points                       |
 * |--------------------------------|------------------------------|
 * | entry_path = "referral"        | Base 40 (else 20)            |
 * | ≥1 vouch                       | +15                          |
 * | ≥2 vouches                     | +10 (stacked)                |
 * | Any vouch weight ≥ 80          | +10                          |
 * | Each verified claim (confirmed)| +5                           |
 * | Each flagged claim             | -10                          |
 * | linkedin_url present           | +3 (unverified — reduced from +8) |
 * | github_url present             | +2 (unverified — reduced from +7) |
 * | email present                  | +5                           |
 * | ghost_risk_score ≥ 75          | +5                           |
 * | authenticity_signal AI + confidence>0.8 | -10 (AI-generated CV penalty) |
 * | Clamp                          | 0–100                        |
 *
 * ## Accepted risks
 *
 * - **Ghost score gaming (+5):** Low impact; candidate responds fast for a +5 bump. Acceptable.
 * - **Referral path inflation:** Code-controlled via referral token resolution; cannot be spoofed from UI.
 * - **Verification claim injection:** Claims set only by verify.ts agent; not user-facing input.
 * - **Vouch weight ceiling exploit:** Referrer self-reports relationship/duration; no cross-check yet.
 *   Mitigated by credibility_multiplier from LLM and rapid-vouch-pattern flagging.
 * - **LinkedIn/GitHub spoofing:** Reduced to +3/+2 (from +8/+7) until URL ownership verification is built.
 */
export async function recalculateTrustScore(candidateId: string): Promise<number> {
  const supabase = createSupabaseAdmin();

  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .select(
      "id, entry_path, linkedin_url, github_url, email, ghost_risk_score, authenticity_signal, authenticity_confidence",
    )
    .eq("id", candidateId)
    .single();

  if (candError || !candidate) {
    logger.warn("Trust score candidate not found", {
      candidate_id: candidateId,
    });
    return 0;
  }

  const { data: vouches } = await supabase
    .from("vouches")
    .select("id, weight")
    .eq("candidate_id", candidateId);

  const { data: claims } = await supabase
    .from("verification_claims")
    .select("id, status")
    .eq("candidate_id", candidateId);

  let score = 0;

  if (candidate.entry_path === "referral") score = 40;
  else score = 20;

  const vouchList = vouches ?? [];
  if (vouchList.length >= 1) score += 15;
  if (vouchList.length >= 2) score += 10;
  const hasSeniorVouch = vouchList.some((v: { weight?: number }) => (v.weight ?? 0) >= 80);
  if (hasSeniorVouch) score += 10;

  const claimList = claims ?? [];
  const confirmed = claimList.filter((c: { status?: string }) => c.status === "confirmed").length;
  const flagged = claimList.filter((c: { status?: string }) => c.status === "flagged").length;
  score += confirmed * 5;
  score -= flagged * 10;

  if (candidate.linkedin_url) score += 3;
  if (candidate.github_url) score += 2;
  if (candidate.email) score += 5;

  const ghost = candidate.ghost_risk_score ?? 50;
  if (ghost >= 75) score += 5;

  const authenticitySignal = candidate.authenticity_signal as string | null;
  const authenticityConfidence = (candidate.authenticity_confidence as number | null) ?? 0;
  if (authenticitySignal === "likely_ai_generated" && authenticityConfidence > 0.8) {
    score -= 10;
  }

  score = Math.min(100, Math.max(0, score));

  await supabase.from("candidates").update({ trust_score: score }).eq("id", candidateId);

  return score;
}
