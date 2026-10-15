import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, jsonError, jsonSuccess, parseJsonBody } from "@/lib/api-helpers";
import { handleScreeningWhatsappReply } from "@/lib/screening/whatsapp-flow";

const bodySchema = z.object({ phone: z.string().optional(), body: z.string().optional() });

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return jsonError("Not available", 404);
  }

  try {
    const parsed = await parseJsonBody<{ phone?: string; body?: string }>(
      request,
      "POST /api/screening/whatsapp/reply",
    );
    if (parsed.errorResponse) return parsed.errorResponse;
    const validated = bodySchema.safeParse(parsed.body ?? {});
    if (!validated.success) return jsonError("phone and body are required", 400);
    const phone = (validated.data.phone ?? "").trim();
    const body = (validated.data.body ?? "").trim();
    if (!phone || !body) return jsonError("phone and body are required", 400);

    const handled = await handleScreeningWhatsappReply({ phone, body });
    return jsonSuccess({ ok: true, handled });
  } catch (error) {
    return handleApiError(error, "Failed to process screening WhatsApp reply", {
      route: "POST /api/screening/whatsapp/reply",
    });
  }
}
