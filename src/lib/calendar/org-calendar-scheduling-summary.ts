import type { SupabaseClient } from "@supabase/supabase-js";
import { jobSchedulingHref } from "@/lib/calendar/scheduling-hrefs";
import { listHiringManagerJobIds } from "@/lib/jobs/hiring-manager-job-ids";

export type JobSchedulingSummary = {
  jobId: string;
  jobTitle: string;
  availableCount: number;
  bookedCount: number;
  href: string;
};

/**
 * Per-job open vs booked slot counts in the visible range (scheduling gaps).
 */
export async function listJobSchedulingSummaries(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: string;
    from: Date;
    to: Date;
    jobId?: string | null;
  },
): Promise<JobSchedulingSummary[]> {
  let hmJobIds: string[] | null = null;
  if (params.role === "hiring_manager") {
    hmJobIds = await listHiringManagerJobIds(supabase, params.organisationId, params.userId);
    if (hmJobIds.length === 0) return [];
  }

  let slotQuery = supabase
    .from("interview_availability_slots")
    .select("job_id, status, jobs!inner(id, title, organisation_id, status)")
    .eq("jobs.organisation_id", params.organisationId)
    .gte("start_at", params.from.toISOString())
    .lte("start_at", params.to.toISOString());

  if (hmJobIds) slotQuery = slotQuery.in("job_id", hmJobIds);
  if (params.jobId) slotQuery = slotQuery.eq("job_id", params.jobId);

  const { data: slotRows, error } = await slotQuery;
  if (error) throw error;

  const byJob = new Map<
    string,
    { jobTitle: string; availableCount: number; bookedCount: number }
  >();

  for (const raw of slotRows ?? []) {
    const row = raw as {
      job_id: string;
      status: string;
      jobs:
        | { id: string; title: string | null; status?: string | null }
        | { id: string; title: string | null; status?: string | null }[];
    };
    const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
    if (!job?.id) continue;
    const jobId = row.job_id;
    const title = (job.title as string | null)?.trim() || "Untitled role";
    const existing = byJob.get(jobId) ?? { jobTitle: title, availableCount: 0, bookedCount: 0 };
    if (row.status === "booked") existing.bookedCount += 1;
    else if (row.status === "available") existing.availableCount += 1;
    byJob.set(jobId, existing);
  }

  let jobsQuery = supabase
    .from("jobs")
    .select("id, title")
    .eq("organisation_id", params.organisationId)
    .eq("status", "open")
    .order("title", { ascending: true })
    .limit(80);

  if (hmJobIds) jobsQuery = jobsQuery.in("id", hmJobIds);
  if (params.jobId) jobsQuery = jobsQuery.eq("id", params.jobId);

  const { data: openJobs } = await jobsQuery;
  for (const j of openJobs ?? []) {
    const jobId = j.id as string;
    if (!byJob.has(jobId)) {
      byJob.set(jobId, {
        jobTitle: ((j.title as string | null) ?? "").trim() || "Untitled role",
        availableCount: 0,
        bookedCount: 0,
      });
    }
  }

  return [...byJob.entries()]
    .map(([jobId, counts]) => ({
      jobId,
      jobTitle: counts.jobTitle,
      availableCount: counts.availableCount,
      bookedCount: counts.bookedCount,
      href: jobSchedulingHref(jobId),
    }))
    .sort((a, b) => {
      if (a.availableCount !== b.availableCount) return a.availableCount - b.availableCount;
      return a.jobTitle.localeCompare(b.jobTitle);
    });
}
