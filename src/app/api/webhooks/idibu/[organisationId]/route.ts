import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api-helpers";
import { handleIdibuWebhookRequest } from "@/lib/integrations/idibu/webhook-http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/webhooks/idibu/{organisationId}
 * Organisation-scoped idibu webhook (secret from Company Settings → Job boards → idibu).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> },
) {
  const { organisationId } = await params;
  if (!UUID_RE.test(organisationId)) {
    return jsonError("Invalid organisation id", 400);
  }
  return handleIdibuWebhookRequest(request, organisationId);
}
