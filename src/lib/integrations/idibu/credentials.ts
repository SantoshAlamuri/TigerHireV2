import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptCredentials } from "@/lib/security/credentials-encryption";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";

export interface IdibuCredentials {
  app_id: string;
  app_secret: string;
  integration_name: string;
  webhook_secret: string;
  default_sector: string;
}

function credentialsFromEnv(): IdibuCredentials | null {
  const app_id = env.idibuAppId.trim();
  const app_secret = env.idibuAppSecret.trim();
  const integration_name = env.idibuIntegrationName.trim();
  const webhook_secret = env.idibuWebhookSecret.trim();
  if (!app_id || !app_secret) return null;
  return {
    app_id,
    app_secret,
    integration_name,
    webhook_secret,
    default_sector: env.idibuDefaultSector.trim() || "1",
  };
}

function parseIdibuCredentialBlob(raw: Record<string, unknown>): IdibuCredentials | null {
  const app_id = String(raw.app_id ?? "").trim();
  const app_secret = String(raw.app_secret ?? "").trim();
  const integration_name = String(raw.integration_name ?? "").trim();
  const webhook_secret = String(raw.webhook_secret ?? "").trim();
  const default_sector = String(raw.default_sector ?? "").trim() || "1";
  if (!app_id || !app_secret || !webhook_secret) return null;
  return { app_id, app_secret, integration_name, webhook_secret, default_sector };
}

/** Webhook + credential storage (idibu: App ID, App Secret, Webhook secret). */
export function isIdibuCredentialsComplete(creds: IdibuCredentials | null | undefined): boolean {
  if (!creds) return false;
  return Boolean(creds.app_id && creds.app_secret && creds.webhook_secret);
}

export function isIdibuPostingReady(creds: IdibuCredentials | null | undefined): boolean {
  if (!creds) return false;
  return Boolean(creds.app_id && creds.app_secret && creds.integration_name);
}

/**
 * Organisation idibu credentials from encrypted job-board store, with optional platform env fallback.
 */
export async function getIdibuCredentials(
  organisationId: string | null | undefined,
): Promise<IdibuCredentials | null> {
  if (organisationId) {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("organisation_job_board_credentials")
      .select("encrypted_credentials")
      .eq("organisation_id", organisationId)
      .eq("board", "idibu")
      .eq("is_active", true)
      .maybeSingle();

    if (!error && data?.encrypted_credentials) {
      try {
        const decryptedRaw = decryptCredentials(data.encrypted_credentials as Buffer);
        const parsed = parseIdibuCredentialBlob(
          typeof decryptedRaw === "object" && decryptedRaw !== null
            ? (decryptedRaw as Record<string, unknown>)
            : {},
        );
        if (parsed) return parsed;
      } catch (err) {
        logger.error("idibu_credentials_decrypt_failed", {
          organisationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (env.allowJobBoardGlobalFallback || !organisationId) {
    const fromEnv = credentialsFromEnv();
    if (fromEnv) {
      if (!organisationId) {
        logger.warn("Using platform env idibu credentials (no organisationId)");
      } else {
        logger.warn("No org idibu credentials; falling back to platform env", { organisationId });
      }
      return fromEnv;
    }
  }

  return null;
}

export function buildIdibuWebhookUrl(organisationId: string, baseUrl?: string): string {
  const root = (baseUrl ?? env.baseUrl).replace(/\/$/, "");
  return `${root}/api/webhooks/idibu/${organisationId}`;
}
