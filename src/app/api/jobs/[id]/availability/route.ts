import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { slotBookableBySchema } from "@/lib/interviews/slot-bookable-by";
import { assertSlotOwnerForJob } from "@/lib/interviews/validate-slot-owner";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { safeNotifyRecruiterSlotsPublished } from "@/lib/calendar/scheduling-recruiter-notify";
import { isSlotStartInPast } from "@/lib/interviews/self-serve-slot-window";

const slotSourceSchema = z.enum(["recruiter_manual", "interviewer_declared"]);

const createSlotsBodySchema = z.object({
  slots: z
    .array(
      z.object({
        start_at: z.string(),
        end_at: z.string(),
        timezone: z.string().optional(),
        source: slotSourceSchema.optional(),
        /** Optional live-interview join link consumed by the AI notetaker. */
        meeting_url: z.string().url().max(2048).optional(),
        meeting_provider: z.enum(["zoom", "teams", "meet", "other"]).optional(),
      }),
    )
    .min(1, "At least one slot is required"),
  source: slotSourceSchema.optional(),
  /** When set, availability is owned by this user (interviewer on calendar invite). Defaults to the signed-in recruiter. */
  owner_user_id: z.string().uuid().optional(),
  bookable_by: slotBookableBySchema.optional(),
});

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/jobs/[id]/availability
 * List available slots for a job. Query: from (ISO date), to (ISO date). Returns only status=available.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const { searchParams } = request.nextUrl;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const statusFilter = searchParams.get("status");
  // Include recent past (booked interviews) and farther future (bulk-generated slots).
  const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toParam ? new Date(toParam) : new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

  let query = supabase
    .from("interview_availability_slots")
    .select(
      "id, start_at, end_at, timezone, status, pipeline_candidate_id, user_id, source, candidate_email_status, interviewer_email_status, candidate_whatsapp_status, last_delivery_attempt_at",
    )
    .eq("job_id", jobId)
    .gte("start_at", from.toISOString())
    .lte("start_at", to.toISOString())
    .order("start_at", { ascending: true });

  if (statusFilter && (statusFilter === "available" || statusFilter === "booked")) {
    query = query.eq("status", statusFilter);
  }

  const { data: slots, error } = await query;

  if (error) {
    logger.error("Failed to fetch availability slots", {
      error: String(error),
    });
    return jsonError("Failed to fetch availability", 500);
  }

  const list = slots ?? [];
  const ownerIds = [...new Set(list.map((s) => s.user_id).filter(Boolean))] as string[];
  let ownerById = new Map<string, { id: string; display_name: string | null }>();
  if (ownerIds.length > 0) {
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);
    if (!profErr && profiles) {
      ownerById = new Map(
        profiles.map((p) => [p.id as string, { id: p.id as string, display_name: p.full_name }]),
      );
    }
  }

  const enriched = list.map((s) => ({
    ...s,
    slot_owner:
      s.user_id && ownerById.has(s.user_id)
        ? ownerById.get(s.user_id)!
        : s.user_id
          ? { id: s.user_id, display_name: null }
          : null,
  }));

  return jsonSuccess({ slots: enriched });
}

/**
 * POST /api/jobs/[id]/availability
 * Create availability slots. Body: { slots: Array<{ start_at: string (ISO), end_at: string (ISO), timezone?: string }> }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const parsedBody = await parseJsonBody(request, "POST /api/jobs/[id]/availability");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const parsed = createSlotsBodySchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);
  const slots = parsed.data.slots;

  const defaultSource = parsed.data.source ?? "recruiter_manual";
  const orgId = job.organisation_id as string;
  if (!orgId) return jsonError("Job organisation not found", 400);

  const admin = createSupabaseAdmin();
  const ownerUserId = parsed.data.owner_user_id ?? ctx!.userId;
  if (ownerUserId !== ctx!.userId) {
    const ownerCheck = await assertSlotOwnerForJob(admin, orgId, ownerUserId);
    if (!ownerCheck.ok) {
      return jsonError(ownerCheck.message, 400);
    }
  }

  const bookableBy = parsed.data.bookable_by ?? "both";

  const now = new Date();
  const validSlots = slots.filter(
    (s) =>
      s?.start_at &&
      s?.end_at &&
      new Date(s.end_at) > new Date(s.start_at) &&
      !isSlotStartInPast(s.start_at, now),
  );
  if (validSlots.length === 0) {
    return jsonError("Slots must start today or later — past times are not allowed", 400);
  }
  if (validSlots.length < slots.length) {
    return jsonError("One or more slots are in the past — use today or a future time", 400);
  }

  const rows = validSlots.map((s) => {
    const row: Record<string, unknown> = {
      job_id: jobId,
      user_id: ownerUserId,
      start_at: new Date(s.start_at).toISOString(),
      end_at: new Date(s.end_at).toISOString(),
      timezone: s.timezone ?? "Asia/Kolkata",
      status: "available",
      source: s.source ?? defaultSource,
    };
    if (bookableBy !== "both") {
      row.bookable_by = bookableBy;
    }
    if (s.meeting_url) {
      row.meeting_url = s.meeting_url;
      if (s.meeting_provider) row.meeting_provider = s.meeting_provider;
    }
    return row;
  });

  // Service role: RLS insert requires user_id = auth.uid(), but recruiters create slots for interviewers too.
  const { data: inserted, error } = await admin
    .from("interview_availability_slots")
    .insert(rows)
    .select("id, start_at, end_at, timezone, source, user_id");

  if (error) {
    logger.error("Failed to create availability slots", {
      error: String(error),
      code: error.code,
      message: error.message,
    });
    return jsonError("Failed to create slots", 500);
  }

  safeNotifyRecruiterSlotsPublished({
    jobId,
    slotCount: inserted?.length ?? rows.length,
    actorUserId: ctx!.userId,
  });

  return jsonSuccess({ slots: inserted ?? [] }, 201);
}

/**
 * DELETE /api/jobs/[id]/availability
 * Delete an available slot. Body: { slot_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const parsedBody = await parseJsonBody<{ slot_id?: string }>(
    request,
    "DELETE /api/jobs/[id]/availability",
  );
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const body = parsedBody.body;
  if (!body?.slot_id) return jsonError("slot_id is required", 400);

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("interview_availability_slots")
    .delete()
    .eq("id", body.slot_id)
    .eq("job_id", jobId)
    .eq("status", "available");

  if (error) {
    logger.error("Failed to delete availability slot", {
      error: String(error),
    });
    return jsonError("Failed to delete slot", 500);
  }
  return jsonSuccess({ success: true });
}
