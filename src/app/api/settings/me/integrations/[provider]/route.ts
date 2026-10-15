import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth } from "@/lib/api-helpers";
import { providerEnum } from "@/lib/validations/integrations";
import {
  deleteConnection,
  getConnection,
} from "@/lib/repositories/integration-connections.repository";
import { deleteSecret } from "@/lib/services/secrets";
import { validateOrigin } from "@/lib/security/csrf";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const csrf = validateOrigin(request);
    if (csrf) return csrf;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation linked to your account", 400);

    const { provider: rawProvider } = await params;
    const parsedProvider = providerEnum.safeParse(rawProvider);
    if (!parsedProvider.success) return jsonError("Invalid provider", 400);
    const provider = parsedProvider.data;

    const supabase = await createSupabaseServerClient();
    const existing = await getConnection(supabase, {
      scope: "user",
      provider,
      ownerUserId: ctx.userId,
    });
    if (!existing) return jsonError("Integration not found", 404);

    if (existing.secret_ref) await deleteSecret(existing.secret_ref);

    await deleteConnection(supabase, {
      scope: "user",
      provider,
      ownerUserId: ctx.userId,
    });

    return jsonSuccess({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to disconnect personal integration", {
      route: "DELETE /api/settings/me/integrations/[provider]",
    });
  }
}
