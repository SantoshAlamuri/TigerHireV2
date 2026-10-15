import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeContactDetail } from "@/lib/candidates/normalize-contact-detail";
import { extractPhoneFromCvText } from "@/lib/candidates/extract-phone-from-cv-text";

function withMergedPhone(
  candidate: Record<string, unknown>,
  phone: string | null,
): Record<string, unknown> {
  if (!phone) return candidate;
  return { ...candidate, phone };
}

/**
 * When `candidates.phone` is empty, merge a usable number from (in order): claimed user's
 * `profiles.phone`, Auth phone, then labelled patterns in `cv_raw_text`. Does not update DB.
 */
export async function mergeCandidateContactFallbacks(
  candidate: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (normalizeContactDetail(candidate.phone)) return candidate;

  const userId =
    typeof candidate.user_id === "string" && candidate.user_id.trim() ? candidate.user_id : null;

  try {
    const admin = createSupabaseAdmin();

    if (userId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("phone")
        .eq("id", userId)
        .maybeSingle();
      const profilePhone = normalizeContactDetail(prof?.phone);
      if (profilePhone) return withMergedPhone(candidate, profilePhone);

      const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
      if (!authErr && authData?.user) {
        const authPhone = normalizeContactDetail(authData.user.phone);
        if (authPhone) return withMergedPhone(candidate, authPhone);
      }
    }
  } catch {
    // Missing service role or transient errors — continue to CV heuristic
  }

  const cvRaw =
    typeof candidate.cv_raw_text === "string" && candidate.cv_raw_text.trim().length >= 30
      ? candidate.cv_raw_text
      : null;
  if (cvRaw) {
    const extracted = extractPhoneFromCvText(cvRaw);
    if (extracted) return withMergedPhone(candidate, extracted);
  }

  return candidate;
}
