import { NextRequest } from "next/server";
import {
  getAuthContext,
  handleApiError,
  hasRole,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { provider: rawProvider } = await params;
    const parsedProvider = providerEnum.safeParse(rawProvider);
    if (!parsedProvider.success) return jsonError("Invalid provider", 400);
    const provider = parsedProvider.data;

    const supabase = await createSupabaseServerClient();
    const existing = await getConnection(supabase, {
      scope: "platform",
      provider,
    });
    if (!existing) return jsonError("Integration not found", 404);

    if (existing.secret_ref) await deleteSecret(existing.secret_ref);
    await deleteConnection(supabase, {
      scope: "platform",
      provider,
    });

    return jsonSuccess({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to disconnect platform integration", {
      route: "DELETE /api/settings/platform/integrations/[provider]",
    });
  }
}
