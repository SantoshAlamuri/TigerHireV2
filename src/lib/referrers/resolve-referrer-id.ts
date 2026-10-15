import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";

/** Resolve `referrers.id` for a logged-in user (profile user_id or candidate phone match). */
export async function resolveReferrerIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: byUser } = await supabase
    .from("referrers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (byUser?.id) return byUser.id as string;

  const { data: candidate } = await supabase
    .from("candidates")
    .select("phone")
    .eq("user_id", userId)
    .maybeSingle();
  const rawPhone = (candidate?.phone as string | undefined) ?? "";
  const normalizedPhone = normalizeReferrerWhatsapp(rawPhone);
  if (normalizedPhone.length < 8) return null;

  const { data: byPhone } = await supabase
    .from("referrers")
    .select("id")
    .eq("whatsapp_number", normalizedPhone)
    .maybeSingle();
  if (byPhone?.id) return byPhone.id as string;

  const { data: byPlusPhone } = await supabase
    .from("referrers")
    .select("id")
    .eq("whatsapp_number", `+${normalizedPhone}`)
    .maybeSingle();
  return (byPlusPhone?.id as string | undefined) ?? null;
}
