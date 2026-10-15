import type { SupabaseClient } from "@supabase/supabase-js";

export const OrganisationRepository = {
  async getById(supabase: SupabaseClient, id: string) {
    const { data, error } = await supabase
      .from("organisations")
      .select(
        "id, type, name, slug, approval, company_plan, stripe_customer_id, created_at, updated_at",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async getBySlug(supabase: SupabaseClient, slug: string) {
    const { data, error } = await supabase
      .from("organisations")
      .select(
        "id, type, name, slug, approval, company_plan, stripe_customer_id, created_at, updated_at",
      )
      .eq("slug", slug)
      .single();
    if (error) return null;
    return data;
  },

  async getMembers(supabase: SupabaseClient, orgId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, avatar_url, created_at, is_active, is_org_admin")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async getPendingInvites(supabase: SupabaseClient, orgId: string) {
    const { data } = await supabase
      .from("invites")
      .select("id, email, role, expires_at, created_at")
      .eq("organisation_id", orgId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString());
    return data ?? [];
  },

  async createInvite(supabase: SupabaseClient, payload: Record<string, unknown>) {
    const { error } = await supabase.from("invites").insert(payload);
    if (error) throw error;
  },

  async findPendingInvite(supabase: SupabaseClient, email: string, orgId: string) {
    const { data } = await supabase
      .from("invites")
      .select("id")
      .eq("email", email)
      .eq("organisation_id", orgId)
      .is("accepted_at", null)
      .single();
    return data;
  },
};
