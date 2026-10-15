import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { ScreeningDefaultMode } from "@/lib/screening/types";

export async function getOrgScreeningDefaultMode(
  admin: SupabaseClient,
  organisationId: string,
): Promise<ScreeningDefaultMode> {
  const { data } = await admin
    .from("organisations")
    .select("screening_default_mode")
    .eq("id", organisationId)
    .maybeSingle();
  const mode = (data as { screening_default_mode?: string | null } | null)?.screening_default_mode;
  if (mode === "off" || mode === "whatsapp" || mode === "voice") return mode;
  return "off";
}

/** Customer orgs control WhatsApp prescreen via Settings → Screening → Default mode. */
export async function isOrgWhatsappScreeningEnabled(
  organisationId?: string | null,
  admin?: SupabaseClient,
): Promise<boolean> {
  if (!organisationId) return false;
  const client = admin ?? createSupabaseAdmin();
  const mode = await getOrgScreeningDefaultMode(client, organisationId);
  return mode === "whatsapp";
}

export async function getOrgDisplayName(
  admin: SupabaseClient,
  organisationId: string,
): Promise<string> {
  const { data } = await admin
    .from("organisations")
    .select("name")
    .eq("id", organisationId)
    .maybeSingle();
  const name = (data as { name?: string | null } | null)?.name?.trim();
  return name || "the hiring team";
}
