import {
  jsonSuccess,
  jsonError,
  handleApiError,
  getAuthContext,
  requireAuth,
} from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildIdibuWebhookUrl,
  getIdibuCredentials,
  isIdibuCredentialsComplete,
  isIdibuPostingReady,
} from "@/lib/integrations/idibu/credentials";

/**
 * GET /api/idibu/status
 * idibu readiness for the current organisation (no secrets exposed).
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const ctx = await getAuthContext(supabase);
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) {
      return jsonSuccess({ configured: false, postingReady: false, webhookUrl: null });
    }

    const creds = await getIdibuCredentials(ctx.organisationId);
    const configured = isIdibuCredentialsComplete(creds);
    const postingReady = isIdibuPostingReady(creds);
    const webhookUrl = configured ? buildIdibuWebhookUrl(ctx.organisationId) : null;

    return jsonSuccess({ configured, postingReady, webhookUrl });
  } catch (err) {
    return handleApiError(err, "Idibu status failed", { route: "GET /api/idibu/status" });
  }
}
