import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { buildDemoRubric, demoJdSchema } from "@/lib/agents/demo-rubric";

/**
 * Public homepage demo: paste a JD, get a weighted rubric. Unauthenticated by
 * design, so the rate limit is deliberately tight (each call is one Sonnet
 * request). No DB writes.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const perMinute = await checkRateLimit({ key: `demo-rubric:${ip}`, limit: 5, windowSecs: 60 });
    if (!perMinute.allowed) {
      return NextResponse.json(
        {
          error:
            "Demo limit reached — try again in a minute, or book a walkthrough for a live run on your data.",
        },
        { status: 429 },
      );
    }
    const perDayIp = await checkRateLimit({
      key: `demo-rubric-day:${ip}`,
      limit: 25,
      windowSecs: 86400,
    });
    if (!perDayIp.allowed) {
      return NextResponse.json(
        { error: "You've hit today's demo limit — come back tomorrow, or book a walkthrough." },
        { status: 429 },
      );
    }
    const globalDay = await checkRateLimit({
      key: "demo-rubric-day:global",
      limit: 500,
      windowSecs: 86400,
    });
    if (!globalDay.allowed) {
      logger.warn("demo_rubric_global_cap_hit", {});
      return NextResponse.json(
        { error: "The demo is at capacity today — reach out to hello@tigerhire.io." },
        { status: 429 },
      );
    }

    const parsedBody = await parseJsonBody(request, "POST /api/public/demo/rubric");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = demoJdSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((issue) => issue.message).join("; ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const rubric = await buildDemoRubric(parsed.data.jd);
    return NextResponse.json({ ok: true, rubric });
  } catch (err) {
    logger.warn("demo_rubric_failed", { error: String(err) });
    reportError(err, { route: "POST /api/public/demo/rubric" });
    return NextResponse.json(
      { error: "The demo couldn't build a rubric right now. Showing sample output instead." },
      { status: 502 },
    );
  }
}
