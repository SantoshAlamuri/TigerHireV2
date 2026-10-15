import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, jsonSuccess, handleApiError, parseJsonBody } from "@/lib/api-helpers";
import { hashScheduleToken } from "@/lib/interviews/schedule-token-crypto";
import { bookSelfServeInterviewSlot } from "@/lib/interviews/self-serve-book";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";

const bodySchema = z
  .object({
    slot_id: z.string().uuid(),
    /** Required when the schedule link is job-wide (token has no pipeline_candidate_id). */
    pipeline_candidate_id: z.string().uuid().optional(),
  })
  .strict();

/**
 * POST /api/schedule/self-serve/[token]/book — public; books one interview per token (first claim wins).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: raw } = await params;
    if (!raw || raw.length < 16) {
      return jsonError("Invalid link", 400);
    }
    const hash = hashScheduleToken(raw);
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const rl = await checkRateLimit({
      key: `self-serve:book:${hash.slice(0, 16)}:${ip}`,
      ...RATE_LIMIT_PRESETS.apply,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests. Please try again later.", 429);
    }
    const admin = createSupabaseAdmin();

    const parsed = await parseJsonBody(request, "POST self-serve book");
    if (parsed.errorResponse) return parsed.errorResponse;
    const body = bodySchema.safeParse(parsed.body);
    if (!body.success) {
      return jsonError(body.error.issues.map((i) => i.message).join("; "), 422);
    }

    const { data: row, error: rowErr } = await admin
      .from("interview_schedule_tokens")
      .select("id, job_id, pipeline_candidate_id, expires_at, booking_done_at")
      .eq("token_hash", hash)
      .maybeSingle();

    if (rowErr || !row) {
      return jsonError("Invalid or expired link", 404);
    }
    if (row.booking_done_at) {
      return jsonError("A time is already booked for this link", 409);
    }
    if (new Date(String(row.expires_at)).getTime() < Date.now()) {
      return jsonError("This schedule link has expired", 410);
    }

    const tokenPcId = (row.pipeline_candidate_id as string | null) ?? null;
    const effectivePcId = tokenPcId ?? body.data.pipeline_candidate_id ?? null;
    if (!effectivePcId) {
      return jsonError(
        "This link asks who is booking — choose your name on the page, then pick a time.",
        422,
      );
    }
    if (
      tokenPcId &&
      body.data.pipeline_candidate_id &&
      body.data.pipeline_candidate_id !== tokenPcId
    ) {
      return jsonError("This link is not valid for that selection", 400);
    }

    const jobId = row.job_id as string;
    const { data: jobRow } = await admin
      .from("jobs")
      .select("organisation_id")
      .eq("id", jobId)
      .maybeSingle();
    const { data: pcRow, error: pcErr } = await admin
      .from("pipeline_candidates")
      .select("id")
      .eq("id", effectivePcId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (pcErr || !pcRow) {
      return jsonError("That booking target is not valid for this job", 400);
    }

    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimErr } = await admin
      .from("interview_schedule_tokens")
      .update({
        booking_done_at: claimedAt,
        booked_slot_id: body.data.slot_id,
      })
      .eq("token_hash", hash)
      .is("booking_done_at", null)
      .select("id")
      .maybeSingle();

    if (claimErr) {
      logger.error("self-serve: claim token failed", { error: String(claimErr.message) });
      return jsonError("Could not complete booking", 500);
    }
    if (!claimed) {
      return jsonError("A time is already booked for this link", 409);
    }

    const result = await bookSelfServeInterviewSlot(admin, {
      jobId,
      slotId: body.data.slot_id,
      pipelineCandidateId: effectivePcId,
      organisationId: (jobRow?.organisation_id as string | undefined) ?? null,
    });

    if (!result.ok) {
      const { error: revertErr } = await admin
        .from("interview_schedule_tokens")
        .update({
          booking_done_at: null,
          booked_slot_id: null,
        })
        .eq("id", claimed.id as string);
      if (revertErr) {
        logger.error("self-serve: failed to revert token after book failure", {
          error: String(revertErr.message),
        });
      }
      if (result.code === "conflict") {
        return jsonError(result.error, 409);
      }
      return jsonError(result.error, 400);
    }

    return jsonSuccess({ interview_scheduled_at: result.interview_scheduled_at });
  } catch (e) {
    return handleApiError(e, "Failed to book", { route: "POST /api/schedule/self-serve/.../book" });
  }
}

export const dynamic = "force-dynamic";
