import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, jsonError, jsonSuccess, parseJsonBody } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { providerEnum } from "@/lib/validations/integrations";
import {
  getConnection,
  upsertConnection,
} from "@/lib/repositories/integration-connections.repository";
import { retrieveSecret } from "@/lib/services/secrets";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { validateOrigin } from "@/lib/security/csrf";
import { normalizeIntegrationConnection } from "@/lib/integrations/connection-lifecycle";
import { validateSsoProviderConfig } from "@/lib/integrations/providers/sso";
import { validateKekaConnection } from "@/lib/integrations/providers/keka";
import { validateHiBobConnection } from "@/lib/integrations/providers/hibob";
import { validateDarwinboxConnection } from "@/lib/integrations/providers/darwinbox";
import { validateBambooHrConnection } from "@/lib/integrations/providers/bamboohr";
import { validateWorkdayConnection } from "@/lib/integrations/providers/workday";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";

const validateRequestSchema = z
  .object({
    provider: providerEnum,
  })
  .strict();

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_integrations",
    });
    if (auth.error) return auth.error;
    const limiter = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "integration-validate",
        organisationId: auth.context.organisationId,
        userId: auth.context.userId,
      }),
      limit: 5,
      windowSecs: 60,
    });
    if (!limiter.allowed)
      return jsonError("Too many validation attempts. Try again in a minute.", 429);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/settings/org/integrations/validate",
    );
    if (errorResponse) return errorResponse;
    const parsed = validateRequestSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid provider", 422);

    const provider = parsed.data.provider;
    const supabase = await createSupabaseServerClient();
    const connection = await getConnection(supabase, {
      scope: "organisation",
      provider,
      organisationId: auth.context.organisationId,
    });
    if (!connection) return jsonError("Integration not found", 404);

    if (!connection.secret_ref) {
      return jsonError("No stored secret found for this integration.", 400);
    }

    const apiKey = await retrieveSecret(connection.secret_ref);
    const config = (connection.config ?? {}) as Record<string, unknown>;

    let result: {
      ok: boolean;
      status: "connected" | "error";
      message: string;
      metadata?: Record<string, unknown>;
    } | null = null;

    if (provider === "google_sso" || provider === "microsoft_sso" || provider === "okta_sso") {
      result = await validateSsoProviderConfig(provider, config);
    } else if (provider === "keka") {
      result = await validateKekaConnection(apiKey, config);
    } else if (provider === "hibob") {
      result = await validateHiBobConnection(apiKey, config);
    } else if (provider === "darwinbox") {
      result = await validateDarwinboxConnection(apiKey, config);
    } else if (provider === "bamboohr") {
      result = await validateBambooHrConnection(apiKey, config);
    } else if (provider === "workday") {
      result = await validateWorkdayConnection(apiKey, config);
    }

    if (!result) {
      return jsonError("Validation is not implemented for this provider.", 400);
    }

    const row = await upsertConnection(supabase, {
      scope: "organisation",
      organisation_id: auth.context.organisationId,
      owner_user_id: null,
      provider,
      auth_type: connection.auth_type,
      secret_ref: connection.secret_ref,
      config: {
        ...config,
        lastValidatedAt: new Date().toISOString(),
        lastValidation: {
          ok: result.ok,
          message: result.message,
          metadata: result.metadata ?? null,
        },
      },
      status: result.status,
      status_message: result.message,
    });

    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "integration.validated",
      resource_type: "integration_connection",
      resource_id: provider,
      metadata: {
        provider,
        ok: result.ok,
        message: result.message,
      },
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    });

    return jsonSuccess({
      validation: result,
      integration: {
        ...normalizeIntegrationConnection(row),
        secret_ref: null,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to validate integration", {
      route: "POST /api/settings/org/integrations/validate",
    });
  }
}
