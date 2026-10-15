import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { jsonSuccess, jsonError } from "@/lib/api-helpers";
import { handleApiError } from "@/lib/api-helpers";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import {
  extractApplicationIdFromSpringVerifyPayload,
  extractSpringVerifyStatus,
} from "@/lib/integrations/springverify/workflow";
import { getSpringVerifyCredentials } from "@/lib/integrations/springverify/credentials";

/**
 * Constant-time secret comparison to avoid leaking the expected secret via timing.
 * Mirrors the pattern in the WhatsApp route's verifyWhatsAppSignature.
 */
function secretMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on length mismatch; the length difference itself is not secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/webhooks/springverify
 * Receives SpringVerify callbacks. The inbound case is mapped to an
 * organisation via candidate.meta_data.application_id → application → org,
 * then the provided secret (`x-tigerhire-webhook-secret` or
 * `Authorization: Bearer …`) is verified against that organisation's
 * SpringVerify webhook secret (BYO-account model), falling back to the
 * platform-wide `SPRINGVERIFY_WEBHOOK_SECRET`.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    let payload: unknown = raw;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = { raw };
    }

    const applicationId = extractApplicationIdFromSpringVerifyPayload(payload);
    const status = extractSpringVerifyStatus(payload);

    let organisationId: string | null = null;
    let offerId: string | null = null;
    if (applicationId) {
      const admin = createSupabaseAdmin();
      const [{ data: app }, { data: offer }] = await Promise.all([
        admin
          .from("applications")
          .select("id, jobs!inner(organisation_id)")
          .eq("id", applicationId)
          .maybeSingle(),
        admin
          .from("offers")
          .select("id")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      organisationId =
        ((app?.jobs as { organisation_id?: string } | null)?.organisation_id as
          | string
          | undefined) ?? null;
      offerId = (offer?.id as string | undefined) ?? null;
    }

    // Per-org webhook secret (only the org that owns the application), plus
    // the platform env secret as fallback for testing / unattributable events.
    const credentials = organisationId ? await getSpringVerifyCredentials(organisationId) : null;
    const orgSecret =
      credentials?.source === "organisation" ? (credentials.webhookSecret ?? "").trim() : "";
    const envSecret = env.springverifyWebhookSecret.trim();
    const expectedSecrets = [orgSecret, envSecret].filter((secret) => secret.length > 0);
    if (expectedSecrets.length === 0) {
      return jsonError("Webhook not configured", 501);
    }

    const headerSecret =
      request.headers.get("x-tigerhire-webhook-secret") ??
      request.headers.get("x-webhook-secret") ??
      "";
    const auth = request.headers.get("authorization") ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const provided = [headerSecret, bearer];

    const orgHasOwnSecret = orgSecret.length > 0;
    const matchesOrgSecret =
      orgHasOwnSecret && provided.some((value) => secretMatches(value, orgSecret));
    // When the org has its own webhook secret, the platform-wide env secret must
    // NOT authorize events attributed to that org (mirrors the idibu handler).
    const matchesEnvSecret =
      !orgHasOwnSecret &&
      envSecret.length > 0 &&
      provided.some((value) => secretMatches(value, envSecret));
    if (!matchesOrgSecret && !matchesEnvSecret) {
      return jsonError("Unauthorized", 401);
    }

    if (organisationId && offerId) {
      await recordHiringOfferAuditEvent({
        organisationId,
        entityType: "offer",
        entityId: offerId,
        eventType: "BGV_WEBHOOK_RECEIVED",
        actorProfileId: null,
        actorRole: "system",
        prevStatus: null,
        newStatus: status,
        channel: "api",
        metadata: {
          applicationId,
          springverifyStatus: status,
          payload,
        },
      });
    }

    logger.info("SpringVerify webhook received", {
      bytes: raw.length,
      applicationId,
      offerId,
      springverifyStatus: status,
      secretSource: matchesOrgSecret ? "organisation" : "env",
      preview: raw.slice(0, 200),
    });

    return jsonSuccess({
      ok: true,
      received: true,
      applicationId,
      offerId,
      springverifyStatus: status,
    });
  } catch (err) {
    return handleApiError(err, "SpringVerify webhook failed", {
      route: "POST /api/webhooks/springverify",
    });
  }
}
