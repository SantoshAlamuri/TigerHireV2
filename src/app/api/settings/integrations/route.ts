import { NextRequest } from "next/server";
import { z } from "zod";
import {
  handleApiError,
  handleZodError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { saveApiKeySchema } from "@/lib/validations/integrations";
import {
  getIntegrations,
  maskIntegrationSecret,
  upsertIntegration,
  writeAuditLog,
} from "@/lib/repositories/integrations.repository";
import { storeSecret } from "@/lib/services/secrets";
import { validateOrigin } from "@/lib/security/csrf";

async function validateSendGridKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch("https://api.sendgrid.com/v3/scopes", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message: "SendGrid key rejected (missing or invalid Mail Send permission)",
      };
    }
    if (!response.ok) {
      return { ok: false, message: `SendGrid validation failed (${response.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Unable to validate SendGrid key" };
  }
}

const providerParamSchema = z
  .object({
    provider: saveApiKeySchema.shape.provider,
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSettingsAdmin(request);
    if (auth.error) return auth.error;

    const supabase = await createSupabaseServerClient();
    const rows = await getIntegrations(supabase, auth.context.organisationId);
    return jsonSuccess({
      integrations: rows.map((row) => maskIntegrationSecret(row)),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load integrations", {
      route: "GET /api/settings/integrations",
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
      key: `settings:key-save:${auth.context.organisationId}:${ip}`,
      ...RATE_LIMIT_PRESETS.default,
    });
    if (!rl.allowed) return jsonError("Too many attempts, please try again shortly", 429);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/settings/integrations");
    if (errorResponse) return errorResponse;
    const parsed = saveApiKeySchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { provider, apiKey, config } = parsed.data;
    const providerParse = providerParamSchema.safeParse({ provider });
    if (!providerParse.success) return handleZodError(providerParse.error);

    let status: "connected" | "error" = "connected";
    let statusMessage: string | null = null;
    if (provider === "sendgrid") {
      const check = await validateSendGridKey(apiKey);
      if (!check.ok) {
        status = "error";
        statusMessage = check.message ?? "Unable to validate SendGrid key";
      }
    }

    const secretRef = await storeSecret(auth.context.organisationId, provider, "api_key", apiKey);
    const supabase = await createSupabaseServerClient();
    const row = await upsertIntegration(supabase, auth.context.organisationId, provider, {
      auth_type: "api_key",
      status,
      status_message: statusMessage,
      secret_ref: secretRef,
      config: config ?? {},
    });

    const admin = createSupabaseAdmin();
    await writeAuditLog(admin, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "integration.key_updated",
      resource_type: "integration",
      resource_id: provider,
      metadata: { provider, status },
      ip_address: ip,
    });

    return jsonSuccess({ integration: maskIntegrationSecret(row) });
  } catch (err) {
    return handleApiError(err, "Failed to save integration key", {
      route: "POST /api/settings/integrations",
    });
  }
}
