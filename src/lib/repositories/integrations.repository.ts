import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrivacySettingsInput, Provider } from "@/lib/validations/integrations";

export interface IntegrationRecord {
  id: string;
  organisation_id: string;
  provider: Provider | string;
  auth_type: "api_key" | "oauth";
  status: "connected" | "disconnected" | "error";
  status_message: string | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  oauth_scopes: string[] | null;
  oauth_account_email: string | null;
  secret_ref: string | null;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  organisation_id: string;
  actor_user_id?: string | null;
  actor_email?: string | null;
  event_type: string;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
}

const INTEGRATION_COLUMNS =
  "organisation_id, provider, auth_type, status, status_message, oauth_access_token, oauth_refresh_token, oauth_token_expires_at, oauth_scopes, oauth_account_email, secret_ref, config, created_at, updated_at";
const AUDIT_LOG_COLUMNS =
  "organisation_id, actor_user_id, actor_email, event_type, resource_type, resource_id, metadata, ip_address, created_at";
const PRIVACY_SETTINGS_COLUMNS =
  "organisation_id, consent_message, recording_retention_days, transcript_retention_days, updated_at";

export function maskIntegrationSecret(
  row: IntegrationRecord,
): IntegrationRecord & { masked_key?: string } {
  const maskedKey =
    row.secret_ref && row.secret_ref.length >= 4
      ? `••••••${row.secret_ref.slice(-4)}`
      : row.secret_ref
        ? "••••••"
        : undefined;

  return {
    ...row,
    secret_ref: null,
    masked_key: maskedKey,
  };
}

export async function getIntegrations(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("integrations")
    .select(INTEGRATION_COLUMNS)
    .eq("organisation_id", organizationId)
    .order("provider", { ascending: true });

  if (error) throw error;
  return (data ?? []) as IntegrationRecord[];
}

export async function upsertIntegration(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string,
  data: Partial<IntegrationRecord>,
) {
  const payload = {
    organisation_id: organizationId,
    provider,
    ...data,
  };
  const { data: row, error } = await supabase
    .from("integrations")
    .upsert(payload, { onConflict: "organisation_id,provider" })
    .select(INTEGRATION_COLUMNS)
    .single();

  if (error) throw error;
  return row as IntegrationRecord;
}

export async function disconnectIntegration(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string,
) {
  const { data, error } = await supabase
    .from("integrations")
    .update({
      status: "disconnected",
      status_message: null,
      oauth_access_token: null,
      oauth_refresh_token: null,
      oauth_token_expires_at: null,
      oauth_scopes: null,
      oauth_account_email: null,
      secret_ref: null,
    })
    .eq("organisation_id", organizationId)
    .eq("provider", provider)
    .select(INTEGRATION_COLUMNS)
    .single();

  if (error) throw error;
  return data as IntegrationRecord;
}

export async function getIntegrationByProvider(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string,
) {
  const { data, error } = await supabase
    .from("integrations")
    .select(INTEGRATION_COLUMNS)
    .eq("organisation_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw error;
  return (data as IntegrationRecord | null) ?? null;
}

export async function writeAuditLog(supabase: SupabaseClient, entry: AuditLogEntry) {
  const { error } = await supabase.from("audit_log").insert({
    ...entry,
    metadata: entry.metadata ?? {},
  });
  if (error) throw error;
}

export async function getAuditLog(
  supabase: SupabaseClient,
  organizationId: string,
  options?: { limit?: number; before?: string },
) {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  let query = supabase
    .from("audit_log")
    .select(AUDIT_LOG_COLUMNS)
    .eq("organisation_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPrivacySettings(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("privacy_settings")
    .select(PRIVACY_SETTINGS_COLUMNS)
    .eq("organisation_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertPrivacySettings(
  supabase: SupabaseClient,
  organizationId: string,
  data: PrivacySettingsInput,
) {
  const payload = {
    organisation_id: organizationId,
    consent_message: data.consentMessage,
    recording_retention_days: data.recordingRetentionDays,
    transcript_retention_days: data.transcriptRetentionDays,
    updated_at: new Date().toISOString(),
  };

  const { data: row, error } = await supabase
    .from("privacy_settings")
    .upsert(payload, { onConflict: "organisation_id" })
    .select(PRIVACY_SETTINGS_COLUMNS)
    .single();

  if (error) throw error;
  return row;
}
