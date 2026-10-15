import { NextRequest } from "next/server";
import {
  getAuthContext,
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  requireAuth,
  hasRole,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveApiKeySchema } from "@/lib/validations/integrations";
import {
  listConnections,
  upsertConnection,
} from "@/lib/repositories/integration-connections.repository";
import { storeSecret } from "@/lib/services/secrets";
import { SETTINGS_PROVIDERS } from "@/features/settings/config/providers";
import { validateOrigin } from "@/lib/security/csrf";
import { normalizeIntegrationConnection } from "@/lib/integrations/connection-lifecycle";

function maskSecret(secretRef: string | null) {
  if (!secretRef) return undefined;
  return secretRef.length >= 4 ? `••••••${secretRef.slice(-4)}` : "••••••";
}

const PLATFORM_PROVIDER_SET = new Set(
  SETTINGS_PROVIDERS.filter((provider) => provider.scopeSupport?.includes("platform")).map(
    (provider) => provider.provider,
  ),
);

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const supabase = await createSupabaseServerClient();
    const rows = await listConnections(supabase, { scope: "platform" });
    return jsonSuccess({
      integrations: rows.map((row) => ({
        ...normalizeIntegrationConnection(row),
        secret_ref: null,
        masked_key: maskSecret(row.secret_ref),
      })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load platform integrations", {
      route: "GET /api/settings/platform/integrations",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrf = validateOrigin(request);
    if (csrf) return csrf;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/settings/platform/integrations",
    );
    if (errorResponse) return errorResponse;
    const parsed = saveApiKeySchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { provider, apiKey, config } = parsed.data;
    if (!PLATFORM_PROVIDER_SET.has(provider)) {
      return jsonError("This provider is not managed at platform scope", 400);
    }
    const supabase = await createSupabaseServerClient();
    const secretRef = await storeSecret("platform", provider, "api_key", apiKey);
    const row = await upsertConnection(supabase, {
      scope: "platform",
      organisation_id: null,
      owner_user_id: null,
      provider,
      auth_type: "api_key",
      status: "connected",
      status_message: null,
      secret_ref: secretRef,
      config: config ?? {},
      is_default: true,
    });

    return jsonSuccess({
      integration: {
        ...normalizeIntegrationConnection(row),
        secret_ref: null,
        masked_key: maskSecret(row.secret_ref),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to save platform integration", {
      route: "POST /api/settings/platform/integrations",
    });
  }
}
