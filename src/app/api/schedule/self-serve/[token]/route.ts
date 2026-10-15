import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { filterStillFree } from "@/lib/calendar/interviews";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-helpers";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { hashScheduleToken } from "@/lib/interviews/schedule-token-crypto";
import { isSelfServeBookable } from "@/lib/interviews/slot-bookable-by";
import { isSlotEligibleForCandidateSelfServe } from "@/lib/interviews/self-serve-slot-window";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/schedule/self-serve/[token] — public; returns job context and open slots.
 */
export async function GET(
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
      key: `self-serve:get:${hash.slice(0, 16)}:${ip}`,
      ...RATE_LIMIT_PRESETS.apply,
    });
    if (!rl.allowed) {
      return jsonError("Too many requests. Please try again later.", 429);
    }
    const admin = createSupabaseAdmin();
    const { data: row, error } = await admin
      .from("interview_schedule_tokens")
      .select(
        "id, job_id, pipeline_candidate_id, expires_at, booking_done_at, booked_slot_id, reschedule_used",
      )
      .eq("token_hash", hash)
      .maybeSingle();

    if (error) {
      logger.warn("self-serve get token query", { error: String(error.message) });
      return jsonError("Schedule link is unavailable", 503);
    }
    if (!row) {
      return jsonError("Invalid or expired link", 404);
    }
    if (new Date(String(row.expires_at)).getTime() < Date.now()) {
      return jsonError("This schedule link has expired", 410);
    }

    const jobId = row.job_id as string;
    const { data: job } = await admin
      .from("jobs")
      .select("title, organisations!jobs_organisation_id_fkey ( name )")
      .eq("id", jobId)
      .maybeSingle();
    const orgs = job?.organisations as { name?: string } | { name?: string }[] | null | undefined;
    const orgName = Array.isArray(orgs) ? orgs[0]?.name : (orgs?.name ?? null);

    const { data: slots } = await admin
      .from("interview_availability_slots")
      .select("id, user_id, start_at, end_at, timezone, status, pipeline_candidate_id, bookable_by")
      .eq("job_id", jobId)
      .order("start_at", { ascending: true });

    const pipelineCandidateId = (row.pipeline_candidate_id as string | null) ?? null;
    const openScheduleLink = pipelineCandidateId === null;
    const hasBooked = Boolean(row.booking_done_at);
    const canReschedule = hasBooked && !row.reschedule_used;

    let pipelineCandidateOptions: { id: string; label: string }[] = [];
    if (openScheduleLink) {
      const { data: pcs, error: pcListErr } = await admin
        .from("pipeline_candidates")
        .select("id, candidates(name, email)")
        .eq("job_id", jobId)
        .order("id", { ascending: true })
        .limit(200);
      if (pcListErr) {
        logger.warn("self-serve get: pipeline list", { error: String(pcListErr.message) });
      } else {
        // Never return the full applicant roster. Job-wide links are handed to
        // candidates, so emailing/labelling every other applicant here let any
        // one recipient enumerate the whole pipeline (name + email) — a DPDP
        // exposure and a poaching list. First name + last initial only.
        pipelineCandidateOptions = (pcs ?? []).map((pc) => {
          const c = pc.candidates as { name?: string | null } | null;
          const parts = (c?.name ?? "").trim().split(/\s+/).filter(Boolean);
          const label = parts.length
            ? `${parts[0]}${parts.length > 1 && parts[parts.length - 1][0] ? ` ${parts[parts.length - 1][0]}.` : ""}`
            : "Candidate";
          return { id: pc.id as string, label };
        });
      }
    }

    const now = new Date();
    const open =
      hasBooked && !canReschedule
        ? []
        : (slots ?? []).filter(
            (s) =>
              s.status === "available" &&
              s.pipeline_candidate_id == null &&
              isSelfServeBookable((s as { bookable_by?: string }).bookable_by) &&
              isSlotEligibleForCandidateSelfServe(s.start_at as string, now),
          );
    // Drop times that have since filled up on the interviewer's own calendar.
    const available = await filterStillFree(admin, open);
    const booked = row.booking_done_at
      ? ((slots ?? []).find((s) => s.id === row.booked_slot_id) ?? null)
      : null;

    return jsonSuccess({
      jobTitle: (job?.title as string) ?? "Role",
      companyName: orgName,
      openScheduleLink,
      pipelineCandidateOptions,
      state: {
        hasBooked,
        canReschedule,
        pipelineCandidateId,
        jobId,
        bookedStartAt: booked?.start_at ?? null,
        bookedEndAt: booked?.end_at ?? null,
        bookedSlotId: row.booked_slot_id as string | null,
      },
      slots: available.map((s) => ({
        id: s.id,
        start_at: s.start_at,
        end_at: s.end_at,
        timezone: s.timezone ?? "Asia/Kolkata",
      })),
    });
  } catch (e) {
    return handleApiError(e, "Failed to load schedule", {
      route: "GET /api/schedule/self-serve/[token]",
    });
  }
}

// Avoid static optimization caching token-specific responses
export const dynamic = "force-dynamic";
