import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/api-helpers";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { waitlistSchema } from "@/lib/validations/waitlist";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rl = await checkRateLimit({
      key: `waitlist:${ip}`,
      ...RATE_LIMIT_PRESETS.publicForm,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 },
      );
    }

    const parsedBody = await parseJsonBody(request, "POST /api/waitlist");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = waitlistSchema.safeParse(parsedBody.body);

    if (!parsed.success) {
      const msg = parsed.error.issues.map((e: { message: string }) => e.message).join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { email, type } = parsed.data;
    const admin = createSupabaseAdmin();

    // Upsert to avoid duplicates
    const { error } = await admin.from("waitlist").upsert({ email, type }, { onConflict: "email" });

    if (error) {
      logger.error("Waitlist insert failed", { error: String(error) });
      // Fall through — still return success to user
    }

    return NextResponse.json({
      ok: true,
      message: "You're on the list 🐯 We'll notify you when TigerHire launches.",
    });
  } catch (err) {
    reportError(err, { route: "POST /api/waitlist" });
    return NextResponse.json(
      {
        error: "We couldn't process your request. Please try again or join via WhatsApp.",
      },
      { status: 500 },
    );
  }
}
