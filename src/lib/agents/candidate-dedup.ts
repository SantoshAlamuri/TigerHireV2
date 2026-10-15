import type { SupabaseClient } from "@supabase/supabase-js";

/** Lowercase + trim for stable dedupe lookups and storage. */
export function normalizeEmailForCandidate(email: string | null | undefined): string | null {
  if (email == null || typeof email !== "string") return null;
  const t = email.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/** Digits-only canonical phone for stable matching/storage. */
export function normalizePhoneForCandidate(phone: string | null | undefined): string | null {
  if (phone == null || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Find an existing candidate by email → phone (exact) → name cascade.
 * Returns the candidate ID if found, null otherwise.
 *
 * Phone matching intentionally requires exact canonical digits-only equality to
 * avoid cross-person merges between unrelated numbers that share suffixes.
 * Name matching is optional and should only be used for scraper signals where
 * there is no other identifier - common names can cause false merges.
 *
 * Uses `.limit(1)` (not `maybeSingle`) so duplicate rows for the same email do not throw.
 */
export async function findExistingCandidate(
  supabase: SupabaseClient,
  fields: {
    email?: string | null;
    phone?: string | null;
    name?: string | null;
  },
  options?: { matchByName?: boolean },
): Promise<string | null> {
  const normalizedEmail = normalizeEmailForCandidate(fields.email);
  if (normalizedEmail) {
    const { data, error } = await supabase
      .from("candidates")
      .select("id")
      .ilike("email", normalizedEmail)
      .limit(1);
    if (!error) {
      const row = data?.[0] as { id: string } | undefined;
      if (row) return row.id;
    }
  }

  const normalizedPhone = normalizePhoneForCandidate(fields.phone);
  if (normalizedPhone) {
    const { data, error } = await supabase
      .from("candidates")
      .select("id")
      .eq("phone", normalizedPhone)
      .limit(1);
    if (!error) {
      const row = data?.[0] as { id: string } | undefined;
      if (row) return row.id;
    }
  }

  if (options?.matchByName && fields.name?.trim()) {
    const { data, error } = await supabase
      .from("candidates")
      .select("id")
      .ilike("name", fields.name.trim())
      .limit(1);
    if (!error) {
      const row = data?.[0] as { id: string } | undefined;
      if (row) return row.id;
    }
  }

  return null;
}

/**
 * Claim an unclaimed candidate row by the logged-in user's email.
 * Used when a candidate first shared a profile via WhatsApp (or elsewhere) and
 * later logs in with the same email or LinkedIn — we link that row to their auth user.
 * Only updates rows where user_id IS NULL to avoid stealing another user's claim.
 * Returns the candidate id if claimed, null otherwise.
 */
export async function claimUnclaimedCandidateByEmail(
  supabase: SupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeEmailForCandidate(email);
  if (!normalized) return null;

  const { data, error: selErr } = await supabase
    .from("candidates")
    .select("id")
    .ilike("email", normalized)
    .is("user_id", null)
    .limit(1);

  if (selErr) return null;
  const row = data?.[0] as { id: string } | undefined;
  if (!row) return null;

  const { error } = await supabase
    .from("candidates")
    .update({
      user_id: userId,
      email: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) return null;
  return row.id;
}

/**
 * Claim an unclaimed candidate row by a phone number the logged-in user just proved
 * they own (e.g. a WhatsApp OTP verification). This is the phone-keyed counterpart to
 * {@link claimUnclaimedCandidateByEmail} and closes the gap for candidates first created
 * from a WhatsApp phone with no email (or a different email) — SSO login gives an email,
 * not a phone, so the phone claim can only happen once the phone is verified.
 * Only updates rows where user_id IS NULL to avoid stealing another user's claim.
 * Returns the candidate id if claimed, null otherwise.
 */
export async function claimUnclaimedCandidateByPhone(
  supabase: SupabaseClient,
  userId: string,
  phone: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizePhoneForCandidate(phone);
  if (!normalized) return null;

  const { data, error: selErr } = await supabase
    .from("candidates")
    .select("id")
    .eq("phone", normalized)
    .is("user_id", null)
    .limit(1);

  if (selErr) return null;
  const row = data?.[0] as { id: string } | undefined;
  if (!row) return null;

  const { error } = await supabase
    .from("candidates")
    .update({
      user_id: userId,
      phone: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .is("user_id", null);

  if (error) return null;
  return row.id;
}
