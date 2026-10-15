import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { providerEnum } from "@/lib/validations/integrations";
import {
  getIntegrationByProvider,
  upsertIntegration,
  writeAuditLog,
} from "@/lib/repositories/integrations.repository";
import { deleteSecret } from "@/lib/services/secrets";
import { validateOrigin } from "@/lib/security/csrf";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const auth = await requireSettingsAdmin(request, {
      validateCsrf: true,
      capability: "manage_integrations",
    });
    if (auth.error) return auth.error;

    const { provider: rawProvider } = await params;
    const parsedProvider = providerEnum.safeParse(rawProvider);
    if (!parsedProvider.success) return jsonError("Invalid provider", 400);
    const provider = parsedProvider.data;

    const supabase = await createSupabaseServerClient();
    const existing = await getIntegrationByProvider(
      supabase,
      auth.context.organisationId,
      provider,
    );
    if (!existing) return jsonError("Integration not found", 404);

    if (existing.secret_ref) {
      await deleteSecret(existing.secret_ref);
    }

    const row = await upsertIntegration(supabase, auth.context.organisationId, provider, {
      status: "disconnected",
      status_message: null,
      oauth_access_token: null,
      oauth_refresh_token: null,
      oauth_token_expires_at: null,
      oauth_scopes: null,
      oauth_account_email: null,
      secret_ref: null,
    });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const admin = createSupabaseAdmin();
    await writeAuditLog(admin, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "integration.disconnected",
      resource_type: "integration",
      resource_id: provider,
      metadata: { provider },
      ip_address: ip,
    });

    return jsonSuccess({ integration: row });
  } catch (err) {
    return handleApiError(err, "Failed to disconnect integration", {
      route: "DELETE /api/settings/integrations/[provider]",
    });
  }
}
