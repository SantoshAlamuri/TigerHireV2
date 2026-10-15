import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isEnabled } from "@/lib/feature-flags";
import { FEATURE_FLAG_NOTETAKER_RECALL } from "@/lib/interviews/notetaker-dispatch";
import { logger } from "@/lib/observability/logger";

/**
 * Candidate/interviewer-facing recording disclosure.
 *
 * The AI notetaker joins interviews and records + transcribes them; booking
 * invites previously said nothing about this. Disclosing that recording may
 * happen — up front, on the invite — is the baseline consent posture. The copy
 * is intentionally plain and gives the candidate a way to object. (#354)
 */
export const RECORDING_DISCLOSURE_TEXT =
  "This interview may be recorded and transcribed by an AI notetaker to help the hiring team review it. Please let your interviewer or recruiter know if you have any concerns.";

/** Short HTML paragraph form for emails. */
export const RECORDING_DISCLOSURE_HTML = `<p style="color:#666;font-size:13px;margin-top:16px">${RECORDING_DISCLOSURE_TEXT}</p>`;

/**
 * Whether the org has the notetaker turned on — gate the disclosure on the same
 * flag + per-org toggle that actually enable recording, so interviews that will
 * never be recorded don't carry a false notice. Fails CLOSED to "no disclosure"
 * only when we truly can't determine it (never blocks the invite). Best-effort.
 */
export async function isNotetakerDisclosureRequired(
  organisationId: string | null | undefined,
): Promise<boolean> {
  if (!organisationId) return false;
  try {
    if (!(await isEnabled(FEATURE_FLAG_NOTETAKER_RECALL, organisationId))) return false;
    const admin = createSupabaseAdmin();
    const { data: org } = await admin
      .from("organisations")
      .select("notetaker_enabled")
      .eq("id", organisationId)
      .maybeSingle<{ notetaker_enabled: boolean }>();
    return Boolean(org?.notetaker_enabled);
  } catch (error) {
    logger.warn("notetaker disclosure check failed", {
      organisationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
