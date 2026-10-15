import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { env } from "@/lib/config/env";
import {
  submitMessageTemplateToMeta,
  TH_SCREENING_INVITE_TEMPLATE,
  type MetaTemplateDefinition,
} from "@/lib/whatsapp/meta-submit-message-template";
import { upsertTemplateStatusFromApiSubmit } from "@/lib/whatsapp/template-status-store";

const PLAN_PILOT_TEMPLATES: Record<string, MetaTemplateDefinition> = {
  th_screening_invite: TH_SCREENING_INVITE_TEMPLATE,
};

// Optional body: { names?: string[] } — defaults to the plan pilot templates.
const bodySchema = z.object({ names: z.array(z.string()).optional() });

/**
 * GET /api/admin/whatsapp-templates — template approval status (super_admin).
 * Populated by API submit + Meta `message_template_status_update` webhooks.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("whatsapp_template_status")
      .select(
        "template_name, language, status, category, rejection_reason, meta_template_id, submitted_at, status_updated_at, last_event",
      )
      .order("status_updated_at", { ascending: false });

    if (error) return jsonError("Failed to load template status", 500);

    return jsonSuccess({ templates: data ?? [] });
  } catch (err) {
    return handleApiError(err, "Failed to load WhatsApp templates", {
      route: "GET /api/admin/whatsapp-templates",
    });
  }
}

/**
 * POST /api/admin/whatsapp-templates — submit template(s) to Meta via Graph API.
 * Body: { names?: string[] } — defaults to plan pilot templates (th_screening_invite).
 * Final APPROVED/REJECTED status is written when Meta calls the webhook.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    let names: string[] = ["th_screening_invite"];
    const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (parsedBody.success && parsedBody.data.names && parsedBody.data.names.length > 0) {
      names = parsedBody.data.names.map((n) => n.trim()).filter(Boolean);
    }

    const admin = createSupabaseAdmin();
    const wabaId = env.metaWabaId?.trim() || null;
    const results: Array<Record<string, unknown>> = [];

    for (const name of names) {
      const def = PLAN_PILOT_TEMPLATES[name];
      if (!def) {
        results.push({ name, ok: false, error: "Unknown template; not in plan pilot registry" });
        continue;
      }

      const submitted = await submitMessageTemplateToMeta(def);
      if (!submitted.ok) {
        results.push({
          name,
          ok: false,
          error: submitted.error,
          httpStatus: submitted.httpStatus,
        });
        continue;
      }

      const status = submitted.alreadyExists ? "EXISTS_ON_WABA" : submitted.metaStatus;
      await upsertTemplateStatusFromApiSubmit(admin, {
        template_name: def.name,
        language: def.language,
        waba_id: wabaId,
        meta_template_id: submitted.metaTemplateId ?? null,
        status,
        category: def.category,
        last_event: submitted.alreadyExists ? "ALREADY_EXISTS" : "API_SUBMIT",
        submitted_at: new Date().toISOString(),
      });

      results.push({
        name,
        ok: true,
        status,
        metaTemplateId: submitted.metaTemplateId ?? null,
        alreadyExists: submitted.alreadyExists,
        note: "Subscribe webhook field message_template_status_update for live APPROVED/REJECTED updates.",
      });
    }

    const failed = results.filter((r) => r.ok === false);
    return jsonSuccess({
      submitted: results,
      webhook:
        "Ensure Meta app webhook subscribes to message_template_status_update at POST /api/webhooks/whatsapp",
      failedCount: failed.length,
    });
  } catch (err) {
    return handleApiError(err, "Failed to submit WhatsApp templates", {
      route: "POST /api/admin/whatsapp-templates",
    });
  }
}
