import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentitySource } from "@/types/database";

interface IdentitySyncMetadataInput {
  source: IdentitySource;
  externalId?: string | null;
  lastSyncedAt?: string;
}

const PROFILE_UPDATE_COLUMNS =
  "id, role, organisation_id, full_name, avatar_url, created_at, updated_at, phone, azure_oid, is_active, identity_source, external_identity_id, identity_last_synced_at, is_platform_admin, role_status";

export const ProfileRepository = {
  async getById(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*, organisations(id, name, company_plan, slug)")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  },

  async update(supabase: SupabaseClient, userId: string, payload: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select(PROFILE_UPDATE_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async listByOrganisation(supabase: SupabaseClient, orgId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, avatar_url, created_at")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async getByOrganisationAndRoles(supabase: SupabaseClient, orgId: string, roles: string[]) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("organisation_id", orgId)
      .in("role", roles);
    return data ?? [];
  },

  async upsertIdentitySyncMetadata(
    supabase: SupabaseClient,
    userId: string,
    metadata: IdentitySyncMetadataInput,
  ) {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        identity_source: metadata.source,
        external_identity_id: metadata.externalId ?? null,
        identity_last_synced_at: metadata.lastSyncedAt ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id, identity_source, external_identity_id, identity_last_synced_at")
      .single();
    if (error) throw error;
    return data;
  },
};
