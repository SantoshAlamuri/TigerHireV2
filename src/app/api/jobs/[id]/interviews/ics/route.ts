import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth, hasRole, jsonError } from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/** Format date for ICS (UTC): YYYYMMDDTHHmmssZ */
function icsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

/** Escape text for ICS (line folds, comma/semicolon/backslash) */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * GET /api/jobs/[id]/interviews/ics?slot_id=xxx
 * Returns a text/calendar ICS file for the given interview slot.
 * Used for "Add to Calendar" / "Download .ics" after booking.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const slotId = request.nextUrl.searchParams.get("slot_id");
  if (!slotId) return jsonError("slot_id is required", 400);

  const { data: slot, error: slotErr } = await supabase
    .from("interview_availability_slots")
    .select("id, job_id, start_at, end_at, status, pipeline_candidate_id")
    .eq("id", slotId)
    .eq("job_id", jobId)
    .single();

  if (slotErr || !slot) return jsonError("Slot not found", 404);

  const { data: jobRow } = await supabase.from("jobs").select("title").eq("id", jobId).single();

  const title = jobRow?.title ?? "Interview";
  const summary = `Interview - ${title}`;

  let description = `Interview for role: ${title}.`;
  if (slot.pipeline_candidate_id) {
    const { data: pc } = await supabase
      .from("pipeline_candidates")
      .select("candidates(name)")
      .eq("id", slot.pipeline_candidate_id)
      .single();
    const candidate = (pc as { candidates?: { name?: string } | null })?.candidates;
    if (candidate?.name) {
      description += ` Candidate: ${candidate.name}.`;
    }
  }

  const start = new Date(slot.start_at);
  const end = new Date(slot.end_at);
  const now = new Date();
  const uid = `tigerhire-slot-${slot.id}@tigerhire`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TigerHire//Interview//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interview.ics"',
      "Cache-Control": "private, no-cache",
    },
  });
}
