/** Up to 10 parallel scoring calls plus file text extraction. */
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { demoRubricSchema, type DemoRubric } from "@/lib/agents/demo-rubric";
import { demoScoreRequestSchema, scoreDemoPool } from "@/lib/agents/demo-score";
import type { DemoCandidate } from "@/lib/agents/demo-candidates";
import { DemoUploadError, parseDemoUploads } from "@/lib/agents/demo-upload";
import { verifyDemoAccessToken } from "@/lib/agents/demo-otp";

const DEGRADED_MESSAGE =
  "The demo couldn't score enough profiles right now. Showing sample output instead.";

/**
 * Public homepage demo scorer. Two modes:
 * - JSON body { rubric }: scores the fixed 10-profile fictional sample pool.
 * - multipart/form-data (rubric field + up to 10 CV files): scores the
 *   uploaded CVs. Files are parsed in memory and discarded — no storage, no
 *   DB writes, nothing persisted.
 * One Haiku call per profile, so the per-IP limit is tight.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const perMinute = await checkRateLimit({ key: `demo-score:${ip}`, limit: 3, windowSecs: 60 });
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
      key: `demo-score-day:${ip}`,
      limit: 15,
      windowSecs: 86400,
    });
    if (!perDayIp.allowed) {
      return NextResponse.json(
        { error: "You've hit today's demo limit — come back tomorrow, or book a walkthrough." },
        { status: 429 },
      );
    }
    const globalDay = await checkRateLimit({
      key: "demo-score-day:global",
      limit: 300,
      windowSecs: 86400,
    });
    if (!globalDay.allowed) {
      logger.warn("demo_score_global_cap_hit", {});
      return NextResponse.json(
        { error: "The demo is at capacity today — reach out to hello@tigerhire.io." },
        { status: 429 },
      );
    }

    let rubric: DemoRubric;
    let pool: DemoCandidate[] | undefined;
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // Upload tier: requires a WhatsApp-verified access token, capped at 2
      // runs per phone number per day.
      const phone = verifyDemoAccessToken(request.headers.get("x-demo-token") ?? "");
      if (!phone) {
        return NextResponse.json(
          { error: "Verify your WhatsApp number to score your own CVs." },
          { status: 401 },
        );
      }
      const formData = await request.formData();
      const rubricRaw = formData.get("rubric");
      let rubricJson: unknown;
      try {
        rubricJson = JSON.parse(typeof rubricRaw === "string" ? rubricRaw : "");
      } catch {
        return NextResponse.json({ error: "Invalid rubric payload." }, { status: 400 });
      }
      const parsedRubric = demoRubricSchema.safeParse(rubricJson);
      if (!parsedRubric.success) {
        return NextResponse.json({ error: "Invalid rubric payload." }, { status: 400 });
      }
      rubric = parsedRubric.data;
      pool = await parseDemoUploads(formData);
      // Cap check comes AFTER upload validation so a bad file (scanned PDF,
      // wrong type) never burns one of the two runs this number gets.
      const perPhone = await checkRateLimit({
        key: `demo-upload-phone:${phone}`,
        limit: 2,
        windowSecs: 86400,
      });
      if (!perPhone.allowed) {
        return NextResponse.json(
          {
            error:
              "You've used both demo runs for this number — reach out to hello@tigerhire.io and we'll run it on your full pile.",
          },
          { status: 429 },
        );
      }
    } else {
      const parsedBody = await parseJsonBody(request, "POST /api/public/demo/score");
      if (parsedBody.errorResponse) return parsedBody.errorResponse;
      const parsed = demoScoreRequestSchema.safeParse(parsedBody.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((issue) => issue.message).join("; ");
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      rubric = parsed.data.rubric;
    }

    const scored = await scoreDemoPool(rubric, pool);
    const minSurvivors = pool ? Math.min(pool.length, 3) : 3;
    if (scored.length < minSurvivors) {
      logger.warn("demo_score_degraded", { survivors: scored.length, uploaded: Boolean(pool) });
      return NextResponse.json({ error: DEGRADED_MESSAGE }, { status: 502 });
    }
    return NextResponse.json({ ok: true, candidates: scored });
  } catch (err) {
    if (err instanceof DemoUploadError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.warn("demo_score_failed", { error: String(err) });
    reportError(err, { route: "POST /api/public/demo/score" });
    return NextResponse.json({ error: DEGRADED_MESSAGE }, { status: 502 });
  }
}
