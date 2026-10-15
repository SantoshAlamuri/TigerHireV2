import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One-time claim tokens for unclaimed (apply-flow) candidate profiles — B2.2.
 * A token lets a candidate bind their existing `candidates` row to a freshly
 * created auth user from the apply link, regardless of which email they sign up
 * with. Tokens are single-use (cleared on claim) and time-boxed.
 */

export const CLAIM_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function generateClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Return a live claim token for an *unclaimed* candidate (reusing a valid one,
 * else minting a new one). Returns null if the candidate is already claimed. */
export async function ensureClaimToken(
  admin: SupabaseClient,
  candidateId: string,
): Promise<string | null> {
  const { data: cand } = await admin
    .from("candidates")
    .select("user_id, claim_token, claim_token_expires_at")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand || cand.user_id) return null;

  const existing = cand.claim_token as string | null;
  const expires = cand.claim_token_expires_at as string | null;
  if (existing && expires && new Date(expires).getTime() > Date.now()) {
    return existing;
  }

  const token = generateClaimToken();
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_MS).toISOString();
  const { error } = await admin
    .from("candidates")
    .update({ claim_token: token, claim_token_expires_at: expiresAt })
    .eq("id", candidateId);
  return error ? null : token;
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "already_has_profile" | "error" };

/** Bind the unclaimed candidate identified by `token` to `userId`. Single-use. */
export async function claimCandidateByToken(
  admin: SupabaseClient,
  token: string,
  userId: string,
): Promise<ClaimResult> {
  if (!token.trim()) return { ok: false, reason: "invalid" };

  const { data: cand } = await admin
    .from("candidates")
    .select("id, user_id, claim_token_expires_at")
    .eq("claim_token", token)
    .maybeSingle();
  if (!cand) return { ok: false, reason: "invalid" };

  // Already claimed: success only if it's the same user (idempotent re-click).
  if (cand.user_id) {
    return cand.user_id === userId ? { ok: true } : { ok: false, reason: "invalid" };
  }

  const exp = cand.claim_token_expires_at as string | null;
  if (exp && new Date(exp).getTime() < Date.now()) return { ok: false, reason: "expired" };

  // Don't create a second identity: if this user already owns a candidate row,
  // just consume the token rather than binding a duplicate.
  const { data: existingForUser } = await admin
    .from("candidates")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingForUser && existingForUser.id !== cand.id) {
    await admin
      .from("candidates")
      .update({ claim_token: null, claim_token_expires_at: null })
      .eq("id", cand.id);
    return { ok: false, reason: "already_has_profile" };
  }

  const { error } = await admin
    .from("candidates")
    .update({
      user_id: userId,
      claim_token: null,
      claim_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cand.id);
  return error ? { ok: false, reason: "error" } : { ok: true };
}
