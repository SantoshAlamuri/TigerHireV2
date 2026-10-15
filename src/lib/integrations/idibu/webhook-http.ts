import { after, NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getIdibuCredentials,
  isIdibuCredentialsComplete,
} from "@/lib/integrations/idibu/credentials";
import {
  parseIdibuWebhookBody,
  processIdibuWebhook,
} from "@/lib/integrations/idibu/process-webhook";

/**
 * When the shared platform secret is used (organisationId === null), the resolved job's
 * organisation is the only authorization boundary — a single secret could otherwise ingest
 * candidates into ANY org by job reference. If the target job's org has its own active idibu
 * credentials, that org MUST use its org-scoped endpoint; deny the platform path so the shared
 * secret cannot cross into an org that has configured its own integration.
 * Returns true when the platform path is allowed to target this vacancy.
 */
async function platformPathAllowedForVacancy(vacancyRef: string): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data: job } = await admin
    .from("jobs")
    .select("organisation_id")
    .eq("id", vacancyRef)
    .maybeSingle();
  const orgId = (job?.organisation_id as string | undefined) ?? null;
  if (!orgId) return true; // job_not_found is handled downstream as a dead letter.

  const { data: orgCreds } = await admin
    .from("organisation_job_board_credentials")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("board", "idibu")
    .eq("is_active", true)
    .maybeSingle();
  return !orgCreds; // org has its own credentials → must use org-scoped endpoint.
}

function extractWebhookSecret(request: NextRequest): string {
  const headerSecret =
    request.headers.get("x-idibu-webhook-secret") ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("secret") ??
    "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return headerSecret || bearer;
}

function verifySecret(expected: string, request: NextRequest): boolean {
  const provided = extractWebhookSecret(request);
  if (!expected || !provided) return false;
  // Constant-time compare to avoid timing oracle on the shared secret. Buffer
  // lengths must match for timingSafeEqual; if they differ we still do a compare
  // against a same-length zero buffer to keep the timing profile flat-ish.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function handleIdibuWebhookRequest(
  request: NextRequest,
  organisationId: string | null,
): Promise<Response> {
  try {
    const creds = organisationId
      ? await getIdibuCredentials(organisationId)
      : await getIdibuCredentials(null);

    if (!isIdibuCredentialsComplete(creds)) {
      return jsonError("Webhook not configured", 501);
    }

    if (!verifySecret(creds!.webhook_secret, request)) {
      return jsonError("Unauthorized", 401);
    }

    const raw = await request.text();
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return jsonError("Invalid JSON", 400);
    }

    const parsed = parseIdibuWebhookBody(body);
    const eventType = parsed["payload-information"]?.webhook_event ?? "unknown";
    const vacancyRef = parsed.payload?.vacancies?.[0]?.reference?.trim();
    const email = parsed.payload?.email?.trim().toLowerCase();
    const board = parsed.payload?.source?.trim() || "unknown";

    logger.info("idibu_webhook_received", {
      organisationId,
      eventType,
      vacancyRef,
      candidateEmail: email,
      board,
      bytes: raw.length,
    });

    // Authorization boundary for the shared platform endpoint: the resolved job's org is the
    // only thing scoping the request. If that org has its own idibu credentials, deny the
    // platform secret here and force the org-scoped endpoint (/api/webhooks/idibu/{orgId}).
    if (organisationId === null && vacancyRef) {
      const allowed = await platformPathAllowedForVacancy(vacancyRef);
      if (!allowed) {
        logger.warn("idibu_webhook_platform_secret_denied_org_has_own_creds", {
          eventType,
          vacancyRef,
          board,
        });
        return jsonError(
          "This vacancy's organisation has its own idibu integration; use the org-scoped webhook URL.",
          403,
        );
      }
    }

    after(async () => {
      try {
        const result = await processIdibuWebhook(parsed, organisationId);
        logger.info("idibu_webhook_processed", {
          organisationId,
          eventType,
          vacancyRef,
          candidateEmail: email,
          board,
          outcome: result.outcome,
          jobId: result.jobId,
          candidateId: result.candidateId,
        });
      } catch (err) {
        logger.error("idibu_webhook_handler_error", {
          organisationId,
          eventType,
          vacancyRef,
          candidateEmail: email,
          board,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return jsonSuccess({ ok: true, received: true });
  } catch (err) {
    return handleApiError(err, "Idibu webhook failed", {
      route: organisationId
        ? `POST /api/webhooks/idibu/${organisationId}`
        : "POST /api/webhooks/idibu",
    });
  }
}
