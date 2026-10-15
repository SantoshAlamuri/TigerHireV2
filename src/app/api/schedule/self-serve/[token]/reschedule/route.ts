import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, jsonSuccess, handleApiError, parseJsonBody } from "@/lib/api-helpers";
import { hashScheduleToken } from "@/lib/interviews/schedule-token-crypto";
import { isSlotEligibleForCandidateSelfServe } from "@/lib/interviews/self-serve-slot-window";
import { isSelfServeBookable } from "@/lib/interviews/slot-bookable-by";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";

const bodySchema = z.object({ new_slot_id: z.string().uuid() }).strict();

/**
 * POST /api/schedule/self-serve/[token]/reschedule — public; one reschedule per token.
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
      key: `self-serve:resched:${hash.slice(0, 16)}:${ip}`,
      ...RATE_LIMIT_PRESETS.apply,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests. Please try again later.", 429);
    }
    const admin = createSupabaseAdmin();

    const { data: row, error: rowErr } = await admin
      .from("interview_schedule_tokens")
      .select(
        "id, job_id, pipeline_candidate_id, expires_at, booking_done_at, booked_slot_id, reschedule_used",
      )
      .eq("token_hash", hash)
      .maybeSingle();

    if (rowErr || !row) {
      return jsonError("Invalid or expired link", 404);
    }
    if (new Date(String(row.expires_at)).getTime() < Date.now()) {
      return jsonError("This schedule link has expired", 410);
    }
    if (!row.booking_done_at || !row.booked_slot_id) {
      return jsonError("Book a time first", 400);
    }
    if (row.reschedule_used) {
      return jsonError("Reschedule was already used for this link", 409);
    }

    const parsed = await parseJsonBody(request, "POST self-serve reschedule");
    if (parsed.errorResponse) return parsed.errorResponse;
    const body = bodySchema.safeParse(parsed.body);
    if (!body.success) {
      return jsonError("new_slot_id (uuid) required", 422);
    }

    const jobId = row.job_id as string;
    const oldId = row.booked_slot_id as string;
    const newId = body.data.new_slot_id;

    const { data: newSlot, error: newSlotErr } = await admin
      .from("interview_availability_slots")
      .select("id, start_at, status, bookable_by, pipeline_candidate_id")
      .eq("id", newId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (newSlotErr || !newSlot) {
      return jsonError("That time is not available", 400);
    }
    if (newSlot.status !== "available" || newSlot.pipeline_candidate_id != null) {
      return jsonError("That time was just taken", 409);
    }
    if (!isSelfServeBookable((newSlot as { bookable_by?: string }).bookable_by)) {
      return jsonError("That time is not available for self-scheduling", 400);
    }
    if (!isSlotEligibleForCandidateSelfServe(newSlot.start_at as string)) {
      return jsonError(
        "That time is outside the booking window — please pick a time in the next few days",
        400,
      );
    }

    const { data: rpcData, error: rpcErr } = await admin.rpc("th_reschedule_interview_slot", {
      p_job_id: jobId,
      p_old_slot_id: oldId,
      p_new_slot_id: newId,
    });

    if (rpcErr) {
      logger.error("th_reschedule_interview_slot failed", { error: String(rpcErr.message) });
      return jsonError("Could not move interview", 400);
    }

    const rows = Array.isArray(rpcData) ? rpcData : [rpcData];
    const r = rows[0] as
      | { success?: boolean; new_start_at?: string; error_code?: string }
      | null
      | undefined;
    if (!r?.success) {
      return jsonError(
        r?.error_code === "new_slot_unavailable"
          ? "That time was just taken"
          : "Could not reschedule",
        409,
      );
    }

    const { error: markErr } = await admin
      .from("interview_schedule_tokens")
      .update({
        reschedule_used: true,
        booked_slot_id: newId,
      })
      .eq("id", row.id as string);
    if (markErr) {
      logger.warn("reschedule: token row update", { error: String(markErr.message) });
    }

    return jsonSuccess({ interview_scheduled_at: r.new_start_at });
  } catch (e) {
    return handleApiError(e, "Reschedule failed", { route: "POST reschedule" });
  }
}

export const dynamic = "force-dynamic";
