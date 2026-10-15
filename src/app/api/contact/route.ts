import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendContactNotification } from "@/lib/services/resend";
import { parseJsonBody } from "@/lib/api-helpers";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { contactSchema } from "@/lib/validations/contact";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rl = await checkRateLimit({
      key: `contact:${ip}`,
      ...RATE_LIMIT_PRESETS.publicForm,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many messages. Please try again in a minute." },
        { status: 429 },
      );
    }

    const parsedBody = await parseJsonBody(request, "POST /api/contact");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = contactSchema.safeParse(parsedBody.body);

    if (!parsed.success) {
      const msg = parsed.error.issues.map((e: { message: string }) => e.message).join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { name, email, company, message, type } = parsed.data;
    const admin = createSupabaseAdmin();

    // Store in database
    const { error } = await admin.from("contact_submissions").insert({
      name,
      email,
      company,
      message,
      type,
    });

    if (error) {
      logger.error("Contact form insert failed", { error: String(error) });
      return NextResponse.json(
        {
          error: "We couldn't save your message. Please try again or contact us via WhatsApp.",
        },
        { status: 500 },
      );
    }

    // Send notification email (non-blocking)
    sendContactNotification({ name, email, company, type, message }).catch(async (err) => {
      logger.error("Contact form email send failed", { error: String(err) });
      const { appendToDlq } = await import("@/lib/utils/dlq");
      await appendToDlq("contact_notification_email", { name, email, company, type }, String(err));
    });

    return NextResponse.json({
      ok: true,
      message: "Thanks — we'll get back within 4 business hours on WhatsApp or 24 hours by email.",
    });
  } catch (err) {
    reportError(err, { route: "POST /api/contact" });
    return NextResponse.json(
      {
        error: "We couldn't process your message. Please try WhatsApp or email us directly.",
      },
      { status: 500 },
    );
  }
}
