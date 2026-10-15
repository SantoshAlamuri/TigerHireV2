import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { resolvePhoneIdentity } from "@/lib/whatsapp/resolve-phone-identity";

const ACTIVE_APPLICATION_STATUSES = new Set(["applied", "viewed", "shortlisted"]);

export function pickActiveApplicationForInbound(
  rows: Array<{ id: string; status: string; updated_at: string }>,
): { chosenId: string | null; ambiguous: boolean; allActiveIds: string[] } {
  const active = rows.filter((r) => ACTIVE_APPLICATION_STATUSES.has(r.status));
  if (active.length === 0) {
    return { chosenId: null, ambiguous: false, allActiveIds: [] };
  }
  const sorted = [...active].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
  const first = sorted[0];
  if (!first) {
    return { chosenId: null, ambiguous: false, allActiveIds: [] };
  }
  return {
    chosenId: first.id,
    ambiguous: active.length > 1,
    allActiveIds: active.map((r) => r.id),
  };
}

/**
 * Candidate phone (digits) → most recently updated *active* application, if any.
 */
export async function resolveApplicationIdForInboundPhone(phone: string): Promise<{
  applicationId: string | null;
  ambiguous: boolean;
  allActiveApplicationIds: string[];
}> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) {
    return { applicationId: null, ambiguous: false, allActiveApplicationIds: [] };
  }

  const supabase = createSupabaseAdmin();
  // Canonical, stable candidate resolution (was an arbitrary limit(1) pick).
  const identity = await resolvePhoneIdentity(supabase, digits);
  const candidateId = identity.candidateId ?? undefined;
  if (!candidateId) {
    return { applicationId: null, ambiguous: false, allActiveApplicationIds: [] };
  }

  const { data: apps, error: aErr } = await supabase
    .from("applications")
    .select("id, status, updated_at")
    .eq("candidate_id", candidateId)
    .order("updated_at", { ascending: false });

  if (aErr) {
    logger.warn("inbound app resolution: applications query failed", { error: aErr.message });
    return { applicationId: null, ambiguous: false, allActiveApplicationIds: [] };
  }

  const { chosenId, ambiguous, allActiveIds } = pickActiveApplicationForInbound(
    (apps ?? []) as Array<{ id: string; status: string; updated_at: string }>,
  );

  if (ambiguous) {
    logger.warn("inbound: multiple active applications; using most recently updated", {
      candidateId,
      chosenApplicationId: chosenId,
      activeApplicationIds: allActiveIds,
    });
  }

  return { applicationId: chosenId, ambiguous, allActiveApplicationIds: allActiveIds };
}
