import { NextRequest } from "next/server";
import { handleIdibuWebhookRequest } from "@/lib/integrations/idibu/webhook-http";

/**
 * POST /api/webhooks/idibu
 * Platform-level webhook (uses env or fallback credentials via getIdibuCredentials(null)).
 * Prefer org-scoped URL: POST /api/webhooks/idibu/{organisationId}
 */
export async function POST(request: NextRequest) {
  return handleIdibuWebhookRequest(request, null);
}
