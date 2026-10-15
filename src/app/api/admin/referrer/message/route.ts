import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { logger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";

const bodySchema = z
  .object({
    referrer_id: z.string().uuid(),
    message_text: z.string().min(1).max(4096),
    application_id: z.string().uuid(),
  })
  .strict();

function unwrapJob(
  jobs: unknown,
): { organisation_id: string | null; hiring_manager_id: string | null } | null {
  if (jobs == null) return null;
  const j = Array.isArray(jobs) ? jobs[0] : jobs;
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  return {
    organisation_id: (o.organisation_id as string | null) ?? null,
    hiring_manager_id: (o.hiring_manager_id as string | null) ?? null,
  };
}

async function tryInsertNotificationsLog(row: Record<string, unknown>): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("notifications_log").insert(row);
  if (error) {
    console.info("[admin/referrer/message] notifications_log insert skipped or failed", {
      ...row,
      supabaseMessage: error.message,
    });
  }
}

/**
 * POST /api/admin/referrer/message
 * Freeform WhatsApp to a referrer (session message via Meta Cloud API; template fallback when
 * outside 24h window — same path as `sendWhatsAppMessage` (Meta Cloud API).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "recruiter", "leadership", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/admin/referrer/message");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    const { referrer_id, message_text, application_id } = parsed.data;
    const text = message_text.trim();
    if (!text) return jsonError("message_text is empty", 400);

    const supabase = await createSupabaseServerClient();
    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("id, direct_referrer_id, job_id, jobs ( organisation_id, hiring_manager_id )")
      .eq("id", application_id)
      .maybeSingle();

    if (appErr || !app) {
      return jsonError("Application not found", 404);
    }
    if ((app.direct_referrer_id as string | null) !== referrer_id) {
      return jsonError("referrer_id does not match this application", 400);
    }

    const job = unwrapJob(app.jobs);
    if (!job?.organisation_id) {
      return jsonError("Job not found", 404);
    }

    if (!ctx.organisationId || job.organisation_id !== ctx.organisationId) {
      return jsonError("Forbidden", 403);
    }
    if (hasRole(ctx, "hiring_manager") && job.hiring_manager_id !== ctx.userId) {
      return jsonError("Forbidden", 403);
    }

    const admin = createSupabaseAdmin();
    const { data: referrer, error: refErr } = await admin
      .from("referrers")
      .select("id, whatsapp_number")
      .eq("id", referrer_id)
      .maybeSingle();

    if (refErr || !referrer?.whatsapp_number) {
      logger.warn("admin/referrer/message: referrer WhatsApp missing", {
        referrer_id,
        error: refErr?.message,
      });
      return jsonError("Referrer WhatsApp not available", 400);
    }

    const sendResult = await sendWhatsAppMessage(referrer.whatsapp_number as string, text);

    logger.info("admin/referrer/message: WhatsApp send finished", {
      application_id,
      referrer_id,
      success: sendResult.success,
      error: sendResult.error,
    });

    await tryInsertNotificationsLog({
      channel: "whatsapp",
      kind: "referrer_freeform",
      referrer_id,
      application_id,
      message_preview: text.slice(0, 200),
      send_success: sendResult.success,
      send_error: sendResult.error ?? null,
      outbound_hold: env.isProductionOutboundHold,
      whatsapp_sandbox: env.whatsappSandbox,
      outbound_notifications_enabled: env.outboundNotificationsEnabled,
      created_at: new Date().toISOString(),
    });

    if (!sendResult.success) {
      return jsonError(sendResult.error ?? "WhatsApp send failed", 502);
    }

    return jsonSuccess({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to send message", {
      route: "POST /api/admin/referrer/message",
    });
  }
}
