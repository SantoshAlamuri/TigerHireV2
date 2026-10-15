import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider } from "@/lib/validations/integrations";

export type IntegrationScope = "platform" | "organisation" | "user";

export interface IntegrationConnection {
  id: string;
  scope: IntegrationScope;
  organisation_id: string | null;
  owner_user_id: string | null;
  provider: Provider | string;
  auth_type: "api_key" | "oauth";
  status: "connected" | "disconnected" | "error";
  status_message: string | null;
  secret_ref: string | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  oauth_scopes: string[] | null;
  oauth_account_email: string | null;
  config: Record<string, unknown> | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const INTEGRATION_CONNECTION_COLUMNS =
  "id, scope, organisation_id, owner_user_id, provider, auth_type, status, status_message, secret_ref, oauth_access_token, oauth_refresh_token, oauth_token_expires_at, oauth_scopes, oauth_account_email, config, is_default, created_at, updated_at";

export async function listConnections(
  supabase: SupabaseClient,
  args: {
    scope: IntegrationScope;
    organisationId?: string;
    ownerUserId?: string;
  },
) {
  let query = supabase
    .from("integration_connections")
    .select(INTEGRATION_CONNECTION_COLUMNS)
    .eq("scope", args.scope)
    .order("updated_at", { ascending: false });

  if (args.organisationId) query = query.eq("organisation_id", args.organisationId);
  if (args.ownerUserId) query = query.eq("owner_user_id", args.ownerUserId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as IntegrationConnection[];
}

export async function upsertConnection(
  supabase: SupabaseClient,
  payload: Partial<IntegrationConnection> & {
    scope: IntegrationScope;
    provider: string;
    organisation_id?: string | null;
    owner_user_id?: string | null;
  },
) {
  const existing = await getConnection(supabase, {
    scope: payload.scope,
    provider: payload.provider,
    organisationId: payload.organisation_id ?? undefined,
    ownerUserId: payload.owner_user_id ?? undefined,
  });

  if (existing) {
    const { data, error } = await supabase
      .from("integration_connections")
      .update(payload)
      .eq("id", existing.id)
      .select(INTEGRATION_CONNECTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as IntegrationConnection;
  }

  const { data, error } = await supabase
    .from("integration_connections")
    .insert(payload)
    .select(INTEGRATION_CONNECTION_COLUMNS)
    .single();
  if (error) throw error;
  return data as IntegrationConnection;
}

export async function deleteConnection(
  supabase: SupabaseClient,
  args: {
    scope: IntegrationScope;
    provider: string;
    organisationId?: string;
    ownerUserId?: string;
  },
) {
  let query = supabase
    .from("integration_connections")
    .delete()
    .eq("scope", args.scope)
    .eq("provider", args.provider);

  if (args.organisationId) query = query.eq("organisation_id", args.organisationId);
  if (args.ownerUserId) query = query.eq("owner_user_id", args.ownerUserId);

  const { error } = await query;
  if (error) throw error;
}

export async function getConnection(
  supabase: SupabaseClient,
  args: {
    scope: IntegrationScope;
    provider: string;
    organisationId?: string;
    ownerUserId?: string;
  },
) {
  let query = supabase
    .from("integration_connections")
    .select(INTEGRATION_CONNECTION_COLUMNS)
    .eq("scope", args.scope)
    .eq("provider", args.provider);

  if (args.organisationId) query = query.eq("organisation_id", args.organisationId);
  if (args.ownerUserId) query = query.eq("owner_user_id", args.ownerUserId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as IntegrationConnection | null) ?? null;
}
