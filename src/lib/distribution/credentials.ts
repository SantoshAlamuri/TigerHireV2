/**
 * Helper functions to fetch and decrypt organisation-specific job board credentials.
 *
 * IMPORTANT: The new way (per-org credentials) is the default. Global env var fallback
 * is only for migration period and should be disabled in production.
 */

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptCredentials } from "@/lib/security/credentials-encryption";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";

export interface AdzunaCredentials {
  app_id: string;
  app_key: string;
  advertiser_id?: string;
}

export interface IndeedCredentials {
  access_token: string;
}

/**
 * Fetch and decrypt Adzuna credentials for an organisation.
 *
 * NEW WAY (default): Uses org-specific credentials from database.
 * OLD WAY (fallback): Only used if ALLOW_JOB_BOARD_GLOBAL_FALLBACK=true (for migration only).
 */
export async function getAdzunaCredentials(
  organisationId: string | null | undefined,
): Promise<AdzunaCredentials | null> {
  if (!organisationId) {
    // No org ID - can't use org-specific credentials
    if (env.allowJobBoardGlobalFallback) {
      logger.warn(
        "Using global Adzuna credentials (no organisationId). This should only be used during migration.",
      );
      const appId = process.env.ADZUNA_APP_ID;
      const appKey = process.env.ADZUNA_APP_KEY;
      if (appId && appKey) {
        return {
          app_id: appId,
          app_key: appKey,
          advertiser_id: process.env.ADZUNA_ADVERTISER_ID,
        };
      }
    }
    return null;
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("organisation_job_board_credentials")
    .select("encrypted_credentials")
    .eq("organisation_id", organisationId)
    .eq("board", "adzuna")
    .eq("is_active", true)
    .single();

  if (error || !data) {
    // No org-specific credentials found
    if (env.allowJobBoardGlobalFallback) {
      logger.warn("No org-specific Adzuna credentials found, falling back to global env vars", {
        organisationId,
        board: "adzuna",
      });
      const appId = process.env.ADZUNA_APP_ID;
      const appKey = process.env.ADZUNA_APP_KEY;
      if (appId && appKey) {
        return {
          app_id: appId,
          app_key: appKey,
          advertiser_id: process.env.ADZUNA_ADVERTISER_ID,
        };
      }
    } else {
      logger.warn("No org-specific Adzuna credentials found and global fallback is disabled", {
        organisationId,
        board: "adzuna",
      });
    }
    return null;
  }

  try {
    const decryptedRaw = decryptCredentials(data.encrypted_credentials as Buffer);
    if (typeof decryptedRaw !== "object" || decryptedRaw === null) {
      throw new Error("Decrypted credentials is not an object");
    }
    const decrypted = decryptedRaw as Record<string, unknown>;

    // Validate required fields
    if (typeof decrypted.app_id !== "string" || typeof decrypted.app_key !== "string") {
      throw new Error("Invalid Adzuna credentials structure");
    }

    const credentials: AdzunaCredentials = {
      app_id: decrypted.app_id,
      app_key: decrypted.app_key,
      advertiser_id:
        typeof decrypted.advertiser_id === "string" ? decrypted.advertiser_id : undefined,
    };

    // Update last_used_at
    await admin
      .from("organisation_job_board_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("organisation_id", organisationId)
      .eq("board", "adzuna");

    return credentials;
  } catch (err) {
    logger.error("Failed to decrypt Adzuna credentials", {
      organisationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Fetch and decrypt Indeed credentials for an organisation.
 *
 * NEW WAY (default): Uses org-specific credentials from database.
 * OLD WAY (fallback): Only used if ALLOW_JOB_BOARD_GLOBAL_FALLBACK=true (for migration only).
 */
export async function getIndeedCredentials(
  organisationId: string | null | undefined,
): Promise<IndeedCredentials | null> {
  if (!organisationId) {
    // No org ID - can't use org-specific credentials
    if (env.allowJobBoardGlobalFallback) {
      logger.warn(
        "Using global Indeed credentials (no organisationId). This should only be used during migration.",
      );
      const token = process.env.INDEED_ACCESS_TOKEN;
      if (token) {
        return { access_token: token };
      }
    }
    return null;
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("organisation_job_board_credentials")
    .select("encrypted_credentials")
    .eq("organisation_id", organisationId)
    .eq("board", "indeed")
    .eq("is_active", true)
    .single();

  if (error || !data) {
    // No org-specific credentials found
    if (env.allowJobBoardGlobalFallback) {
      logger.warn("No org-specific Indeed credentials found, falling back to global env vars", {
        organisationId,
        board: "indeed",
      });
      const token = process.env.INDEED_ACCESS_TOKEN;
      if (token) {
        return { access_token: token };
      }
    } else {
      logger.warn("No org-specific Indeed credentials found and global fallback is disabled", {
        organisationId,
        board: "indeed",
      });
    }
    return null;
  }

  try {
    const decryptedRaw = decryptCredentials(data.encrypted_credentials as Buffer);
    if (typeof decryptedRaw !== "object" || decryptedRaw === null) {
      throw new Error("Decrypted credentials is not an object");
    }
    const decrypted = decryptedRaw as Record<string, unknown>;

    // Validate required fields
    if (typeof decrypted.access_token !== "string") {
      throw new Error("Invalid Indeed credentials structure");
    }

    const credentials: IndeedCredentials = {
      access_token: decrypted.access_token,
    };

    // Update last_used_at
    await admin
      .from("organisation_job_board_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("organisation_id", organisationId)
      .eq("board", "indeed");

    return credentials;
  } catch (err) {
    logger.error("Failed to decrypt Indeed credentials", {
      organisationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
