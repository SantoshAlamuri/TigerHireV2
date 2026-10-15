import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getConnection } from "@/lib/repositories/integration-connections.repository";
import { decryptIntegrationToken, retrieveSecret } from "@/lib/services/secrets";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";

export const SPRINGVERIFY_PROVIDER = "springverify";

/**
 * Resolved SpringVerify credentials for one create-case / webhook interaction.
 * `source` records whether they came from the organisation's own SpringVerify
 * account (BYO, stored in `integration_connections`) or from the platform-wide
 * env vars (testing / default fallback).
 */
export interface SpringVerifyCredentials {
  createCaseUrl: string;
  apiKey: string;
  packageId: number | null;
  subtypeId: number | null;
  webhookSecret: string | null;
  source: "organisation" | "platform_env";
}

function parseOptionalId(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** Platform-wide env credentials (SPRINGVERIFY_*). Used when the org has none. */
export function springVerifyCredentialsFromEnv(): SpringVerifyCredentials | null {
  const createCaseUrl = env.springverifyCreateCaseUrl.trim();
  const apiKey = env.springverifyApiKey.trim();
  if (!createCaseUrl || !apiKey) return null;
  return {
    createCaseUrl,
    apiKey,
    packageId: env.springverifyPackageId,
    subtypeId: env.springverifySubtypeId,
    webhookSecret: env.springverifyWebhookSecret.trim() || null,
    source: "platform_env",
  };
}

/**
 * Per-organisation SpringVerify credentials (BYO-account model).
 *
 * Reads the org's `integration_connections` row (scope=organisation,
 * provider=springverify): the API token lives behind `secret_ref`
 * (Supabase Vault or encrypted fallback), the webhook secret is stored
 * AES-256-GCM-encrypted in `config.webhook_secret_enc`, and
 * `create_case_url` / `package_id` / `subtype_id` are plain config.
 *
 * Falls back to platform env vars when the org has no usable connection.
 */
export async function getSpringVerifyCredentials(
  organisationId: string | null | undefined,
): Promise<SpringVerifyCredentials | null> {
  if (organisationId) {
    try {
      const admin = createSupabaseAdmin();
      const connection = await getConnection(admin, {
        scope: "organisation",
        provider: SPRINGVERIFY_PROVIDER,
        organisationId,
      });

      if (connection && connection.status === "connected" && connection.secret_ref) {
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const createCaseUrl = String(config.create_case_url ?? "").trim();
        const apiKey = createCaseUrl ? (await retrieveSecret(connection.secret_ref)).trim() : "";

        if (createCaseUrl && apiKey) {
          let webhookSecret: string | null = null;
          const enc = config.webhook_secret_enc;
          if (typeof enc === "string" && enc.length > 0) {
            try {
              webhookSecret = decryptIntegrationToken(enc);
            } catch (err) {
              logger.error("springverify_webhook_secret_decrypt_failed", {
                organisationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          return {
            createCaseUrl,
            apiKey,
            packageId: parseOptionalId(config.package_id),
            subtypeId: parseOptionalId(config.subtype_id),
            webhookSecret,
            source: "organisation",
          };
        }
        logger.warn("springverify_org_connection_incomplete", { organisationId });
      }
    } catch (err) {
      logger.error("springverify_org_credentials_lookup_failed", {
        organisationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Org has no usable connection → platform default (testing fallback).
    const fromEnv = springVerifyCredentialsFromEnv();
    if (fromEnv) {
      logger.warn("No org SpringVerify credentials; falling back to platform env", {
        organisationId,
      });
    }
    return fromEnv;
  }

  return springVerifyCredentialsFromEnv();
}
