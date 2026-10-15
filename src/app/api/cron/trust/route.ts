import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { recalculateTrustScore } from "@/lib/agents/trust-score";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/cron/trust
 * Runs daily. Recalculates trust scores for candidates with recent vouches or verification_claims.
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer header.
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: vouches, error: vouchesErr } = await supabase
    .from("vouches")
    .select("candidate_id")
    .gte("created_at", yesterday.toISOString());
  const { data: claims, error: claimsErr } = await supabase
    .from("verification_claims")
    .select("candidate_id")
    .gte("checked_at", yesterday.toISOString());

  // If both source reads failed, we'd silently report success while recomputing
  // nothing — surface it instead.
  if (vouchesErr && claimsErr) {
    logger.error("Trust cron: both source queries failed", {
      vouchesError: vouchesErr.message,
      claimsError: claimsErr.message,
    });
    return NextResponse.json({ error: "source queries failed" }, { status: 500 });
  }
  if (vouchesErr) logger.error("Trust cron: vouches query failed", { error: vouchesErr.message });
  if (claimsErr) logger.error("Trust cron: claims query failed", { error: claimsErr.message });

  const candidateIds = new Set<string>();
  for (const v of vouches ?? []) candidateIds.add(v.candidate_id);
  for (const c of claims ?? []) candidateIds.add(c.candidate_id);

  let updated = 0;
  let failed = 0;
  for (const id of candidateIds) {
    try {
      await recalculateTrustScore(id);
      updated++;
    } catch (err) {
      failed++;
      logger.error("Trust cron: recalculateTrustScore failed", {
        candidateId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ updated, failed, candidateIds: candidateIds.size });
}

export { POST as GET };
