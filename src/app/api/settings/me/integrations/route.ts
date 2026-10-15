import { NextRequest } from "next/server";
import { handleApiError, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth } from "@/lib/api-helpers";
import { listConnections } from "@/lib/repositories/integration-connections.repository";
import { normalizeIntegrationConnection } from "@/lib/integrations/connection-lifecycle";

function maskSecret(secretRef: string | null) {
  if (!secretRef) return undefined;
  return secretRef.length >= 4 ? `••••••${secretRef.slice(-4)}` : "••••••";
}

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation linked to your account", 400);

    const supabase = await createSupabaseServerClient();
    const rows = await listConnections(supabase, {
      scope: "user",
      ownerUserId: ctx.userId,
    });

    return jsonSuccess({
      integrations: rows.map((row) => ({
        ...normalizeIntegrationConnection(row),
        secret_ref: null,
        masked_key: maskSecret(row.secret_ref),
      })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load personal integrations", {
      route: "GET /api/settings/me/integrations",
    });
  }
}
