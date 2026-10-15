import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarEventHref } from "@/lib/calendar/scheduling-hrefs";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";

export type CalendarEventKind = "interview" | "assessment_deadline" | "offer_expiry";

export type OrgCalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  startAt: string;
  endAt: string | null;
  jobId: string;
  jobTitle: string;
  candidateName: string | null;
  interviewerLabel: string | null;
  href: string;
};

function firstJoined<T extends Record<string, unknown>>(
  value: T | T[] | null | undefined,
): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listOrgCalendarEvents(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: string;
    from: Date;
    to: Date;
    jobId?: string | null;
    interviewerUserId?: string | null;
  },
): Promise<OrgCalendarEvent[]> {
  const events: OrgCalendarEvent[] = [];

  let hmJobIds: string[] | null = null;
  if (params.role === "hiring_manager") {
    hmJobIds = await listHiringManagerJobIds(supabase, params.organisationId, params.userId);
    if (hmJobIds.length === 0) return [];
  }

  let slotQuery = supabase
    .from("interview_availability_slots")
    .select(
      `id, start_at, end_at, job_id,
       jobs!inner(id, title, organisation_id),
       pipeline_candidates(
         candidates(name, full_name),
         pipeline_stages(interviewer_name, interviewer_user_id)
       )`,
    )
    .eq("status", "booked")
    .eq("jobs.organisation_id", params.organisationId)
    .gte("start_at", params.from.toISOString())
    .lte("start_at", params.to.toISOString())
    .order("start_at", { ascending: true })
    .limit(200);

  if (hmJobIds) slotQuery = slotQuery.in("job_id", hmJobIds);
  if (params.jobId) slotQuery = slotQuery.eq("job_id", params.jobId);

  const { data: slots } = await slotQuery;
  for (const raw of slots ?? []) {
    const slot = raw as {
      id: string;
      start_at: string;
      end_at: string;
      job_id: string;
      jobs: unknown;
      pipeline_candidates: unknown;
    };
    const job = firstJoined(slot.jobs as Record<string, unknown>);
    const pc = firstJoined(slot.pipeline_candidates as Record<string, unknown>);
    const candidate = pc
      ? firstJoined(pc.candidates as Record<string, unknown> | Record<string, unknown>[])
      : null;
    const stage = pc
      ? firstJoined(pc.pipeline_stages as Record<string, unknown> | Record<string, unknown>[])
      : null;
    const interviewerUserId = (stage?.interviewer_user_id as string | null) ?? null;
    if (params.interviewerUserId && interviewerUserId !== params.interviewerUserId) continue;

    const candidateName =
      (candidate?.full_name as string | null) ?? (candidate?.name as string | null) ?? null;
    const interviewerLabel = (stage?.interviewer_name as string | null) ?? null;

    events.push({
      id: `interview:${slot.id}`,
      kind: "interview",
      startAt: slot.start_at,
      endAt: slot.end_at,
      jobId: slot.job_id,
      jobTitle: (job?.title as string) ?? "Role",
      candidateName,
      interviewerLabel,
      href: calendarEventHref("interview", slot.job_id),
    });
  }

  let assessmentQuery = supabase
    .from("assessments")
    .select(
      `id, deadline_at,
       applications!inner(job_id, candidate_id, candidates(name, full_name), jobs!inner(id, title, organisation_id))`,
    )
    .eq("organisation_id", params.organisationId)
    .not("deadline_at", "is", null)
    .gte("deadline_at", params.from.toISOString())
    .lte("deadline_at", params.to.toISOString())
    .limit(100);

  const { data: assessments } = await assessmentQuery;
  for (const row of assessments ?? []) {
    const a = row as {
      id: string;
      deadline_at: string;
      applications: unknown;
    };
    const app = firstJoined(a.applications as Record<string, unknown>);
    const job = app
      ? firstJoined(app.jobs as Record<string, unknown> | Record<string, unknown>[])
      : null;
    const candidate = app
      ? firstJoined(app.candidates as Record<string, unknown> | Record<string, unknown>[])
      : null;
    const jobId = (app?.job_id as string | null) ?? null;
    if (!jobId) continue;
    if (hmJobIds && !hmJobIds.includes(jobId)) continue;
    if (params.jobId && jobId !== params.jobId) continue;

    events.push({
      id: `assessment:${a.id}`,
      kind: "assessment_deadline",
      startAt: a.deadline_at,
      endAt: null,
      jobId,
      jobTitle: (job?.title as string) ?? "Role",
      candidateName:
        (candidate?.full_name as string | null) ?? (candidate?.name as string | null) ?? null,
      interviewerLabel: null,
      href: calendarEventHref("assessment_deadline", jobId),
    });
  }

  // offers has no job_id and no relationship to jobs — it hangs off the
  // application, which carries the job. Selecting job_id and embedding
  // jobs!inner made this query fail outright, so offer expiries have never
  // appeared on the org calendar.
  let offersQuery = supabase
    .from("offers")
    .select("id, expires_at, applications!inner(job_id, jobs!inner(id, title, organisation_id))")
    .eq("organisation_id", params.organisationId)
    .not("expires_at", "is", null)
    .gte("expires_at", params.from.toISOString())
    .lte("expires_at", params.to.toISOString())
    .limit(100);

  // Filter on the embedded column, since job_id is not on offers itself.
  if (hmJobIds) offersQuery = offersQuery.in("applications.job_id", hmJobIds);
  if (params.jobId) offersQuery = offersQuery.eq("applications.job_id", params.jobId);

  const { data: offers } = await offersQuery;
  for (const row of offers ?? []) {
    const o = row as { id: string; expires_at: string; applications: unknown };
    const application = firstJoined(o.applications as Record<string, unknown>);
    const job = firstJoined(application?.jobs as Record<string, unknown>);
    const jobId = (application?.job_id as string | null) ?? (job?.id as string | null);
    if (!jobId) continue;
    events.push({
      id: `offer:${o.id}`,
      kind: "offer_expiry",
      startAt: o.expires_at,
      endAt: null,
      jobId,
      jobTitle: (job?.title as string) ?? "Role",
      candidateName: null,
      interviewerLabel: null,
      href: calendarEventHref("offer_expiry", jobId),
    });
  }

  return events.sort((a, b) => a.startAt.localeCompare(b.startAt));
}
