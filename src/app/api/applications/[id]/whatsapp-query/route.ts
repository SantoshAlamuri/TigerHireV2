import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ApplicationRepository } from "@/lib/repositories/ApplicationRepository";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { assertApplicationRouteAccess } from "@/lib/applications/assert-application-access";
import { validateOrigin } from "@/lib/security/csrf";
import { sendWhatsAppMessage } from "@/lib/services/whatsapp";
import { insertApplicationWaMessage } from "@/lib/whatsapp/wa-messages-db";
import { normalizeContactDetail } from "@/lib/candidates/normalize-contact-detail";
import { logger } from "@/lib/observability/logger";

type Ctx = { params: Promise<{ id: string }> };

const ROLES = ["hiring_manager", "leadership", "recruiter", "super_admin"] as const;

/** Prewritten intents so common asks are one click; free text stays available. */
const QUERY_PRESETS: Record<string, string> = {
  request_cv:
    "Hi {name}, could you share your latest CV here as a PDF? It helps us move your application forward.",
  ask_logistics:
    "Hi {name}, to move your application forward, could you share your notice period, current & expected CTC, and when you could start?",
};

// Presets ONLY — the system frames every candidate-facing question. Free text is
// deliberately not accepted: internal flag/recruiter language must never reach the
// candidate, and WhatsApp asks are for MISSING information, not re-verifying claims.
const bodySchema = z.object({
  preset: z.enum(["request_cv", "ask_logistics"]),
});

/**
 * POST /api/applications/[id]/whatsapp-query — recruiter asks the candidate for MISSING
 * information on WhatsApp via system-framed preset questions, logged into the application's
 * wa_messages timeline. Session-text policy (24h window, opt-out) enforced by sendWhatsAppMessage.
 */
export async function POST(request: NextRequest, context: Ctx) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ROLES)) return jsonError("Forbidden", 403);

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError("Provide a `preset` (request_cv | ask_logistics)", 400);
    }

    const { id: applicationId } = await context.params;
    const supabase = await createSupabaseServerClient();
    const data = await ApplicationRepository.getById(supabase, applicationId);
    if (!data) return jsonError("Application not found", 404);

    const app = data as {
      candidate_id?: string;
      jobs?:
        | { organisation_id?: string; hiring_manager_id?: string }
        | { organisation_id?: string; hiring_manager_id?: string }[]
        | null;
      candidates?: { user_id?: string } | { user_id?: string }[] | null;
    };
    const accessError = await assertApplicationRouteAccess(ctx, applicationId, app);
    if (accessError) return accessError;

    const admin = createSupabaseAdmin();
    const { data: candidate } = await admin
      .from("candidates")
      .select("name, full_name, phone")
      .eq("id", app.candidate_id ?? "")
      .maybeSingle();
    const phone = normalizeContactDetail(candidate?.phone);
    if (!phone) return jsonError("Candidate has no phone number on file", 422);

    const firstName =
      (candidate?.full_name || candidate?.name || "").trim().split(/\s+/)[0] || "there";
    const message = QUERY_PRESETS[parsed.data.preset].replaceAll("{name}", firstName);

    const result = await sendWhatsAppMessage(String(phone), message);

    // Log the attempt either way — failed sends must be visible in the timeline, not silent.
    await insertApplicationWaMessage({
      applicationId,
      direction: "out",
      waMessageId: result.messageId ?? null,
      templateName: `recruiter_query:${parsed.data.preset}`,
      body: message,
      status: result.success ? "sent" : "failed",
      rawPayload: { sent_by: ctx.userId, error: result.error ?? null },
    });

    if (!result.success) {
      logger.warn("recruiter whatsapp query failed", {
        applicationId,
        error: result.error,
      });
      return jsonError(
        result.error === "outside_session_window"
          ? "Candidate hasn't messaged in the last 24h — WhatsApp only allows templated messages outside that window."
          : (result.error ?? "WhatsApp send failed"),
        502,
      );
    }

    return jsonSuccess({ sent: true, message });
  } catch (e) {
    return handleApiError(e, "Failed to send WhatsApp query", {
      route: "POST /api/applications/[id]/whatsapp-query",
    });
  }
}

export const dynamic = "force-dynamic";
