import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

/**
 * Do-not-contact lookup for a canonical phone (91 + 10 digits).
 *
 * A phone is opted out when either:
 *  - any candidates row for that phone has do_not_call = true (set by the STOP
 *    keyword handler in src/lib/whatsapp/handler.ts), or
 *  - the whatsapp_sessions row for that phone is in state "opted_out".
 *
 * Fails OPEN on lookup errors (same stance as the template-status lookup in
 * outbound-policy): a transient DB hiccup must not take down OTP / interview
 * flows. The STOP handler writes both signals, so a single failed read rarely
 * hides a real opt-out.
 */
export async function isPhoneOptedOut(
  supabase: SupabaseClient,
  phoneDigits: string,
): Promise<boolean> {
  try {
    const [candidateRes, sessionRes] = await Promise.all([
      supabase
        .from("candidates")
        .select("id")
        .eq("phone", phoneDigits)
        .eq("do_not_call", true)
        .limit(1),
      supabase
        .from("whatsapp_sessions")
        .select("id")
        .eq("phone", phoneDigits)
        .eq("session_state", "opted_out")
        .limit(1),
    ]);
    if (candidateRes.error) throw candidateRes.error;
    if (sessionRes.error) throw sessionRes.error;
    return (candidateRes.data ?? []).length > 0 || (sessionRes.data ?? []).length > 0;
  } catch (err) {
    logger.warn("whatsapp_opt_out_lookup_failed", {
      phone_len: phoneDigits.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
