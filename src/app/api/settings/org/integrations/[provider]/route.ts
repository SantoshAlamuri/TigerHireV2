import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSettingsAdmin } from "@/lib/settings/server";
import { providerEnum } from "@/lib/validations/integrations";
import {
  deleteConnection,
  getConnection,
} from "@/lib/repositories/integration-connections.repository";
import { deleteSecret } from "@/lib/services/secrets";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { validateOrigin } from "@/lib/security/csrf";

const JOB_BOARD_PROVIDERS = new Set(["adzuna", "indeed", "idibu"]);

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
    const existing = await getConnection(supabase, {
      scope: "organisation",
      provider,
      organisationId: auth.context.organisationId,
    });
    if (!existing) return jsonError("Integration not found", 404);

    if (existing.secret_ref) await deleteSecret(existing.secret_ref);

    if (JOB_BOARD_PROVIDERS.has(provider)) {
      const { error } = await supabase
        .from("organisation_job_board_credentials")
        .delete()
        .eq("organisation_id", auth.context.organisationId)
        .eq("board", provider);
      if (error) throw error;
    }

    await deleteConnection(supabase, {
      scope: "organisation",
      provider,
      organisationId: auth.context.organisationId,
    });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await writeAuditLog(supabase, {
      organisation_id: auth.context.organisationId,
      actor_user_id: auth.context.userId,
      actor_email: auth.context.actorEmail,
      event_type: "integration.disconnected",
      resource_type: "integration_connection",
      resource_id: provider,
      metadata: { provider, scope: "organisation" },
      ip_address: ip,
    });

    return jsonSuccess({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to disconnect organisation integration", {
      route: "DELETE /api/settings/org/integrations/[provider]",
    });
  }
}
