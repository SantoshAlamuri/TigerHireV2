import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

/**
 * Deterministic phone -> candidate identity resolution.
 *
 * One phone can map to many `candidates` rows over time (re-ingests, cold
 * signals, re-applications). Historically the engine resolved this ad hoc across
 * ~11 sites with inconsistent tie-breaks — "newest created_at wins" (which lets a
 * re-surfaced old candidate hijack a live flow — the rediscovery poison) and
 * "arbitrary limit(1)". This module is the single canonical rule.
 *
 * Canonical pick (stable + rediscovery-safe):
 *   1. exclude erased candidates,
 *   2. prefer a CLAIMED row (user_id set) — a real owner of the profile,
 *   3. then the EARLIEST created_at — the original identity, so ingesting a newer
 *      duplicate never changes who a phone resolves to,
 *   4. then id ascending — total order for full determinism.
 */
export interface ResolvedCandidate {
  id: string;
  user_id: string | null;
  created_at: string;
  last_active_at: string | null;
  do_not_call: boolean | null;
}

export interface PhoneIdentity {
  candidateId: string | null;
  candidate: ResolvedCandidate | null;
  /** Count of non-erased candidate rows for this phone. */
  total: number;
  /** True when more than one non-erased row exists (the pick was a tie-break). */
  ambiguous: boolean;
}

const EMPTY_IDENTITY: PhoneIdentity = {
  candidateId: null,
  candidate: null,
  total: 0,
  ambiguous: false,
};

/**
 * Pure canonical selection over already-fetched rows. Exported for direct testing
 * and reuse by call sites that already hold candidate rows.
 */
export function pickCanonicalCandidate(rows: ResolvedCandidate[]): ResolvedCandidate | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const aClaimed = a.user_id ? 0 : 1;
    const bClaimed = b.user_id ? 0 : 1;
    if (aClaimed !== bClaimed) return aClaimed - bClaimed;

    const aCreated = Date.parse(a.created_at);
    const bCreated = Date.parse(b.created_at);
    const aTime = Number.isFinite(aCreated) ? aCreated : Number.POSITIVE_INFINITY;
    const bTime = Number.isFinite(bCreated) ? bCreated : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime; // earliest first

    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return sorted[0] ?? null;
}

/**
 * Resolve a phone to its canonical candidate. Never throws — returns an empty
 * identity on a query error or a too-short phone.
 */
export async function resolvePhoneIdentity(
  admin: SupabaseClient,
  phone: string,
): Promise<PhoneIdentity> {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return EMPTY_IDENTITY;

  const { data, error } = await admin
    .from("candidates")
    .select("id, user_id, created_at, last_active_at, do_not_call, erased_at")
    .eq("phone", digits);

  if (error) {
    logger.warn("resolve_phone_identity_query_failed", { error: error.message });
    return EMPTY_IDENTITY;
  }

  const rows = ((data ?? []) as Array<ResolvedCandidate & { erased_at: string | null }>)
    .filter((r) => !r.erased_at)
    .map(({ erased_at: _erased, ...rest }) => rest);

  const canonical = pickCanonicalCandidate(rows);
  const identity: PhoneIdentity = {
    candidateId: canonical?.id ?? null,
    candidate: canonical,
    total: rows.length,
    ambiguous: rows.length > 1,
  };

  if (identity.ambiguous) {
    logger.info("resolve_phone_identity_ambiguous", {
      phone_digits_len: digits.length,
      total: identity.total,
      chosen_claimed: Boolean(canonical?.user_id),
    });
  }

  return identity;
}
