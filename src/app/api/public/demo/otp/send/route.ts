import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendReferrerOtp } from "@/lib/services/referrer-otp";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import { demoOtpSendSchema } from "@/lib/agents/demo-otp";

/**
 * Sends a WhatsApp OTP to unlock the homepage demo's upload tier. Reuses the
 * referrer OTP machinery (storage + template + fallback text). Tight limits:
 * OTP sends are the classic SMS-pumping abuse target.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const perMinute = await checkRateLimit({
      key: `demo-otp-send:${ip}`,
      limit: 3,
      windowSecs: 60,
    });
    const perDayIp = await checkRateLimit({
      key: `demo-otp-send-day:${ip}`,
      limit: 10,
      windowSecs: 86400,
    });
    if (!perMinute.allowed || !perDayIp.allowed) {
      return NextResponse.json(
        { error: "Too many code requests — try again later." },
        { status: 429 },
      );
    }

    const parsedBody = await parseJsonBody(request, "POST /api/public/demo/otp/send");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = demoOtpSendSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid WhatsApp number." }, { status: 400 });
    }

    const norm = normalizeReferrerWhatsapp(parsed.data.phone);
    if (norm.length < 8) {
      return NextResponse.json({ error: "Enter a valid WhatsApp number." }, { status: 400 });
    }
    const perDayPhone = await checkRateLimit({
      key: `demo-otp-send-phone:${norm}`,
      limit: 5,
      windowSecs: 86400,
    });
    if (!perDayPhone.allowed) {
      return NextResponse.json(
        { error: "Too many codes sent to this number today — try again tomorrow." },
        { status: 429 },
      );
    }

    const admin = createSupabaseAdmin();
    const result = await sendReferrerOtp(admin, parsed.data.phone);
    if (!result.delivered) {
      logger.warn("demo_otp_send_failed", { error: result.error });
      return NextResponse.json(
        { error: "Couldn't reach that number on WhatsApp — check it and try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    reportError(err, { route: "POST /api/public/demo/otp/send" });
    return NextResponse.json(
      { error: "Couldn't send the code right now — try again in a minute." },
      { status: 500 },
    );
  }
}
