import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { inferReferrerType } from "./metrics";

export async function resolveOrCreateReferrerIdentityForFlow(
  phone: string,
  profile: { id: string; full_name?: string | null; role?: string | null },
): Promise<{ directReferrerId: string | null; parentReferrerId: string | null }> {
  const supabase = createSupabaseAdmin();
  const baseName = profile.full_name?.trim() || "TigerHire Referrer";
  const referrerType = inferReferrerType(profile.role);

  try {
    const { data: byUser } = await supabase
      .from("referrers")
      .select("id, parent_referrer_id")
      .eq("user_id", profile.id)
      .limit(1)
      .maybeSingle();
    if (byUser?.id) {
      await supabase
        .from("referrers")
        .update({
          name: baseName,
          type: referrerType,
          whatsapp_number: phone,
          whatsapp_verified: true,
          status: "active",
          user_id: profile.id,
        })
        .eq("id", byUser.id);
      return {
        directReferrerId: byUser.id as string,
        parentReferrerId: (byUser.parent_referrer_id as string | null) ?? null,
      };
    }

    const { data: byPhone } = await supabase
      .from("referrers")
      .select("id, parent_referrer_id")
      .eq("whatsapp_number", phone)
      .limit(1)
      .maybeSingle();
    if (byPhone?.id) {
      await supabase
        .from("referrers")
        .update({
          name: baseName,
          type: referrerType,
          whatsapp_number: phone,
          whatsapp_verified: true,
          status: "active",
          user_id: profile.id,
        })
        .eq("id", byPhone.id);
      return {
        directReferrerId: byPhone.id as string,
        parentReferrerId: (byPhone.parent_referrer_id as string | null) ?? null,
      };
    }

    const { data: inserted, error: insertError } = await supabase
      .from("referrers")
      .insert({
        name: baseName,
        type: referrerType,
        whatsapp_number: phone,
        whatsapp_verified: true,
        status: "active",
        user_id: profile.id,
      })
      .select("id, parent_referrer_id")
      .single();
    if (insertError || !inserted) {
      throw insertError ?? new Error("referrer insert failed");
    }

    return {
      directReferrerId: inserted.id as string,
      parentReferrerId: (inserted.parent_referrer_id as string | null) ?? null,
    };
  } catch (error) {
    logger.warn("WhatsApp referral: failed to resolve referrer identity", {
      message: phone,
      error: String(error),
    });
    return { directReferrerId: null, parentReferrerId: null };
  }
}
