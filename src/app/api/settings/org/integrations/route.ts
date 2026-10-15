import { NextRequest } from "next/server";
import {
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildScopedRateLimitKey,
  checkRateLimit,
  RATE_LIMIT_PRESETS,
} from "@/lib/security/rate-limit";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { getOrgSettingsPermissions, hasSettingsCapability } from "@/lib/settings/permissions";
import type { UserRole } from "@/types/database";
import { saveApiKeySchema } from "@/lib/validations/integrations";
import {
  getConnection,
  listConnections,
  upsertConnection,
} from "@/lib/repositories/integration-connections.repository";
import { encryptIntegrationToken, storeSecret } from "@/lib/services/secrets";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { encryptCredentials } from "@/lib/security/credentials-encryption";
import { SETTINGS_PROVIDERS } from "@/features/settings/config/providers";
import { validateOrigin } from "@/lib/security/csrf";
import { normalizeIntegrationConnection } from "@/lib/integrations/connection-lifecycle";

const JOB_BOARD_PROVIDERS = new Set(["adzuna", "indeed", "idibu"]);
const SPRINGVERIFY_PROVIDER = "springverify";
const ORG_PROVIDER_SET = new Set(
  SETTINGS_PROVIDERS.filter((provider) => provider.scopeSupport?.includes("organisation")).map(
    (provider) => provider.provider,
  ),
);

function maskSecret(secretRef: string | null) {
  if (!secretRef) return undefined;
  return secretRef.length >= 4 ? `••••••${secretRef.slice(-4)}` : "••••••";
}

function parseOptionalIdField(value: unknown): { ok: boolean; value: number | null } {
  if (value == null) return { ok: true, value: null };
  const asString = String(value).trim();
  if (!asString) return { ok: true, value: null };
  const n = Number(asString);
  if (!Number.isFinite(n)) return { ok: false, value: null };
  return { ok: true, value: n };
}

/**
 * SpringVerify (BYO BGV account): whitelist config keys, require an https
 * create-case URL, and encrypt the webhook secret at rest
 * (config.webhook_secret_enc). Plaintext `apiKey` / `webhook_secret` sent by
 * the form are never persisted in `config`.
 */
function normalizeSpringVerifyConfig(
  raw: Record<string, unknown>,
  priorWebhookSecretEnc: string | null,
): { config: Record<string, unknown> } | { error: string } {
  const createCaseUrl = String(raw.create_case_url ?? "").trim();
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(createCaseUrl);
  } catch {
    parsedUrl = null;
  }
  if (!parsedUrl || parsedUrl.protocol !== "https:") {
    return { error: "Create-case URL must be a valid https:// URL" };
  }

  const packageId = parseOptionalIdField(raw.package_id);
  const subtypeId = parseOptionalIdField(raw.subtype_id);
  if (!packageId.ok || !subtypeId.ok) {
    return { error: "Package ID and Subtype ID must be numbers" };
  }
  if ((packageId.value == null) !== (subtypeId.value == null)) {
    return { error: "Package ID and Subtype ID must be provided together" };
  }

  const webhookSecret = typeof raw.webhook_secret === "string" ? raw.webhook_secret.trim() : "";
  const webhookSecretEnc = webhookSecret
    ? encryptIntegrationToken(webhookSecret)
    : priorWebhookSecretEnc;

  return {
    config: {
      create_case_url: createCaseUrl,
      ...(packageId.value != null
        ? { package_id: packageId.value, subtype_id: subtypeId.value }
        : {}),
      ...(webhookSecretEnc ? { webhook_secret_enc: webhookSecretEnc } : {}),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request, { capability: "view_settings" });
    if (auth.error) return auth.error;

    const supabase = await createSupabaseServerClient();
    const rows = await listConnections(supabase, {
      scope: "organisation",
      organisationId: auth.context.organisationId,
    });
    // Viewers (view_settings) may lack manage_integrations — tell the UI so it
    // renders read-only instead of editable forms that 403 on save.
    const permissions = await getOrgSettingsPermissions(supabase, auth.context.organisationId);
    const canManage = hasSettingsCapability(
      auth.context.role as UserRole,
      "manage_integrations",
      permissions,
    );
    return jsonSuccess({
      canManage,
      integrations: rows.map((row) => ({
        ...normalizeIntegrationConnection(row),
        secret_ref: null,
        masked_key: maskSecret(row.secret_ref),
      })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load organisation integrations", {
      route: "GET /api/settings/org/integrations",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_integrations",
    });
    if (auth.error) return auth.error;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "settings-org-key-save",
        organisationId: auth.context.organisationId,
        userId: auth.context.userId,
        suffix: ip,
      }),
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/settings/org/integrations",
    );
    if (errorResponse) return errorResponse;
    const parsed = saveApiKeySchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { provider, apiKey, config } = parsed.data;
    if (!ORG_PROVIDER_SET.has(provider)) {
      return jsonError("This provider is managed at platform or user scope", 400);
    }
    const supabase = await createSupabaseServerClient();
    let secretRef: string;
    let normalizedConfig: Record<string, unknown> = config ?? {};

    if (JOB_BOARD_PROVIDERS.has(provider)) {
      const encrypted = encryptCredentials((config ?? {}) as Record<string, unknown>);
      const legacySecretRef = `legacy_job_board:${encrypted.toString("base64")}`;
      secretRef = legacySecretRef;

      const { error } = await supabase.from("organisation_job_board_credentials").upsert(
        {
          organisation_id: auth.context.organisationId,
          board: provider,
          encrypted_credentials: encrypted,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,board" },
      );
      if (error) {
        if (error.code === "23514" && provider === "idibu") {
          return jsonError(
            "Database update required: in Supabase SQL Editor, run migration 20260603120000_job_board_idibu.sql so board 'idibu' is allowed (see docs/integrations/idibu-setup.md).",
            503,
          );
        }
        throw error;
      }

      normalizedConfig = {
        ...(config ?? {}),
        migratedFrom: "organisation_job_board_credentials",
      };
    } else if (provider === SPRINGVERIFY_PROVIDER) {
      // Preserve the previously stored (encrypted) webhook secret when the
      // form re-submits without one; never trust an enc blob from the client.
      const existing = await getConnection(supabase, {
        scope: "organisation",
        provider,
        organisationId: auth.context.organisationId,
      });
      const priorEnc = (existing?.config as Record<string, unknown> | null)?.webhook_secret_enc;
      const normalized = normalizeSpringVerifyConfig(
        (config ?? {}) as Record<string, unknown>,
        typeof priorEnc === "string" && priorEnc.length > 0 ? priorEnc : null,
      );
      if ("error" in normalized) return jsonError(normalized.error, 400);
      normalizedConfig = normalized.config;
      secretRef = await storeSecret(auth.context.organisationId, provider, "api_key", apiKey);
    } else {
      secretRef = await storeSecret(auth.context.organisationId, provider, "api_key", apiKey);
    }

    const row = await upsertConnection(supabase, {
      scope: "organisation",
      organisation_id: auth.context.organisationId,
      owner_user_id: null,
      provider,
      auth_type: "api_key",
      status: "connected",
      status_message: null,
      secret_ref: secretRef,
      config: normalizedConfig,
    });

    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "integration.key_updated",
      resource_type: "integration_connection",
      resource_id: provider,
      metadata: { provider, scope: "organisation" },
      ip_address: ip,
    });

    return jsonSuccess({
      integration: {
        ...normalizeIntegrationConnection(row),
        secret_ref: null,
        masked_key: maskSecret(row.secret_ref),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to save organisation integration", {
      route: "POST /api/settings/org/integrations",
    });
  }
}
