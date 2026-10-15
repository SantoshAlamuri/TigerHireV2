import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { assertSlotOwnerForJob } from "@/lib/interviews/validate-slot-owner";
import { panelAvailability } from "@/lib/calendar/interviews";
import {
  clashes,
  findPanelSlots,
  mergeIntervals,
  DEFAULT_WORKING_HOURS,
} from "@/lib/calendar/slots";

const ROLES = ["super_admin", "leadership", "recruiter", "agency", "hiring_manager"] as const;
const DAY = 86_400_000;

const querySchema = z.object({
  panel: z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().uuid()).min(1).max(6)),
  duration: z.coerce.number().int().min(15).max(240).default(45),
  buffer: z.coerce.number().int().min(0).max(60).default(10),
  days: z.coerce.number().int().min(1).max(14).default(14),
  perDay: z.coerce.number().int().min(1).max(12).default(4),
});

const openSchema = z
  .object({
    panel: z.array(z.string().uuid()).min(1).max(6),
    duration: z.number().int().min(15).max(240),
    slots: z
      .array(z.object({ start_at: z.string().datetime(), end_at: z.string().datetime() }))
      .min(1)
      .max(40),
    meeting_url: z.string().url().max(2048).optional(),
  })
  .strict();

/**
 * GET /api/jobs/[id]/calendar-slots?panel=a,b&duration=45
 * Times the whole panel is free, read from their connected calendars (or the
 * hours they declared), minus interviews already booked in TigerHire.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ROLES)) return jsonError("Forbidden", 403);
    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return handleZodError(parsed.error);
    const q = parsed.data;

    const admin = createSupabaseAdmin();
    const now = Date.now();
    const from = now;
    const to = now + q.days * DAY;
    const members = await panelAvailability(admin, {
      organisationId: job.organisation_id,
      userIds: q.panel,
      from,
      to,
    });
    const slots = findPanelSlots(members, {
      from,
      to,
      durationMinutes: q.duration,
      bufferMinutes: q.buffer,
      stepMinutes: 30,
      minNoticeMinutes: 4 * 60,
      now,
      maxPerDay: q.perDay,
      timeZone: DEFAULT_WORKING_HOURS.timeZone,
    });

    return jsonSuccess({
      panel: members.map((m) => ({
        user_id: m.userId,
        name: m.name,
        email: m.email,
        source: m.source,
        calendar: m.calendar,
        calendar_provider: m.calendarProvider,
        message: m.message,
        busy_count: m.busy.length,
      })),
      // People whose free time could not be checked against a real calendar.
      unchecked: members.filter((m) => m.source !== "calendar").map((m) => m.name),
      // When anyone on the panel is busy (times only, never event details).
      busy: mergeIntervals(members.flatMap((m) => m.busy)).map((b) => ({
        start_at: new Date(b.start).toISOString(),
        end_at: new Date(b.end).toISOString(),
      })),
      slots: slots.map((s) => ({
        start_at: new Date(s.start).toISOString(),
        end_at: new Date(s.end).toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to find free times", {
      route: "GET /api/jobs/[id]/calendar-slots",
    });
  }
}

/**
 * POST /api/jobs/[id]/calendar-slots
 * Open chosen free times for candidates to pick (or for you to book). Each is
 * rechecked against everyone's calendar first; clashes are skipped, not opened.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ROLES)) return jsonError("Forbidden", 403);
    const { id: jobId } = await params;
    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const body = await parseJsonBody(request, "POST /api/jobs/[id]/calendar-slots");
    if (body.errorResponse) return body.errorResponse;
    const parsed = openSchema.safeParse(body.body);
    if (!parsed.success) return handleZodError(parsed.error);
    const { panel, slots, meeting_url } = parsed.data;

    const admin = createSupabaseAdmin();
    for (const uid of panel) {
      const ok = await assertSlotOwnerForJob(admin, job.organisation_id, uid);
      if (!ok.ok) return jsonError(ok.message, 400);
    }

    const now = Date.now();
    const times = slots
      .map((s) => ({ start: Date.parse(s.start_at), end: Date.parse(s.end_at) }))
      .filter((s) => s.end > s.start && s.start > now);
    if (!times.length) return jsonError("Pick times in the future", 400);

    const members = await panelAvailability(admin, {
      organisationId: job.organisation_id,
      userIds: panel,
      from: Math.min(...times.map((t) => t.start)),
      to: Math.max(...times.map((t) => t.end)),
    });
    const fresh = times.filter((t) => !members.some((m) => clashes(t, m.busy)));
    const skipped = times.length - fresh.length;
    if (!fresh.length) {
      return jsonError("Those times are no longer free for everyone. Find times again.", 409);
    }

    const [owner, ...others] = panel;
    const rows = fresh.map((t) => ({
      job_id: jobId,
      user_id: owner,
      start_at: new Date(t.start).toISOString(),
      end_at: new Date(t.end).toISOString(),
      timezone: DEFAULT_WORKING_HOURS.timeZone,
      status: "available",
      source: "recruiter_manual",
      ...(meeting_url ? { meeting_url } : {}),
    }));

    let insert = await admin
      .from("interview_availability_slots")
      .insert(rows.map((r) => ({ ...r, panel_user_ids: others })))
      .select("id, start_at, end_at, user_id");
    if (insert.error && /panel_user_ids/.test(insert.error.message)) {
      // The panel column isn't migrated yet: open the slots for the organiser alone.
      logger.warn("calendar_panel_column_missing", { jobId });
      insert = await admin
        .from("interview_availability_slots")
        .insert(rows)
        .select("id, start_at, end_at, user_id");
    }
    if (insert.error) {
      logger.error("calendar_slots_open_failed", { jobId, error: insert.error.message });
      return jsonError("Couldn't open those times. Try again.", 500);
    }
    return jsonSuccess({ slots: insert.data ?? [], skipped }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to open times", {
      route: "POST /api/jobs/[id]/calendar-slots",
    });
  }
}
