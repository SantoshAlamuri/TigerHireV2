import { NextRequest } from "next/server";
import { z } from "zod";
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
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const bodySchema = z
  .object({
    phone: z.string().min(8).max(32),
    message: z.string().min(1).max(4096),
  })
  .strict();

/**
 * POST /api/admin/whatsapp-sessions/send — super_admin sends a session WhatsApp (Meta Cloud API).
 * Respects WHATSAPP_MODE, production outbound hold, and 24h window / template fallback like other sends.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/admin/whatsapp-sessions/send");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const digits = parsed.data.phone.replace(/\D/g, "");
    if (digits.length < 8) {
      return jsonError("Invalid phone number", 400);
    }

    const text = parsed.data.message.trim();
    const result = await sendWhatsAppMessage(digits, text);
    if (!result.success) {
      return jsonError(result.error ?? "WhatsApp send failed", 502);
    }

    // Human takeover guard: when an admin replies manually, silence bot auto-replies
    // for a short window so the user gets one coherent voice.
    try {
      const supabase = createSupabaseAdmin();
      const { data: row } = await supabase
        .from("whatsapp_sessions")
        .select("id, context")
        .eq("phone", digits)
        .maybeSingle();
      if (row?.id) {
        const now = Date.now();
        const until = new Date(now + 30 * 60 * 1000).toISOString();
        const mergedContext = {
          ...((row.context as Record<string, unknown> | null) ?? {}),
          human_takeover_active: true,
          human_takeover_requested_at: new Date(now).toISOString(),
          human_takeover_until: until,
          human_takeover_by_user_id: ctx.userId,
        };
        await supabase
          .from("whatsapp_sessions")
          .update({ context: mergedContext })
          .eq("id", row.id);
      }
    } catch {
      // Never fail the outbound send for takeover metadata issues.
    }

    return jsonSuccess({ ok: true as const, messageId: result.messageId });
  } catch (err) {
    return handleApiError(err, "Failed to send WhatsApp message", {
      route: "POST /api/admin/whatsapp-sessions/send",
    });
  }
}
