import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { reportError } from "@/lib/observability/report-error";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { consumeReferrerOtp } from "@/lib/services/referrer-otp";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import { demoOtpVerifySchema, signDemoAccessToken } from "@/lib/agents/demo-otp";

/**
 * Verifies a demo OTP and returns a 24h signed access token for the upload
 * tier. Uses consumeReferrerOtp (attempt-capped, single-use) — NOT
 * verifyReferrerOtp, which would touch the referrers table.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit({ key: `demo-otp-verify:${ip}`, limit: 10, windowSecs: 60 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts — try again in a minute." },
        { status: 429 },
      );
    }

    const parsedBody = await parseJsonBody(request, "POST /api/public/demo/otp/verify");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = demoOtpVerifySchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const ok = await consumeReferrerOtp(admin, parsed.data.phone, parsed.data.code);
    if (!ok) {
      return NextResponse.json(
        { error: "That code didn't match or has expired — request a new one." },
        { status: 400 },
      );
    }
    const norm = normalizeReferrerWhatsapp(parsed.data.phone);
    return NextResponse.json({ ok: true, token: signDemoAccessToken(norm) });
  } catch (err) {
    reportError(err, { route: "POST /api/public/demo/otp/verify" });
    return NextResponse.json(
      { error: "Couldn't verify right now — try again in a minute." },
      { status: 500 },
    );
  }
}
