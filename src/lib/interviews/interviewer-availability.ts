import type { SupabaseClient } from "@supabase/supabase-js";

export const AVAILABILITY_DECLARER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
  "interviewer",
] as const;

export type InterviewerAvailabilityWindow = {
  id: string;
  user_id: string;
  organisation_id: string;
  starts_at: string;
  ends_at: string;
  recurring_pattern: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function isFutureWindow(startsAt: string): boolean {
  return new Date(startsAt).getTime() > Date.now();
}

export async function listUserAvailabilityWindows(
  supabase: SupabaseClient,
  params: {
    userId: string;
    organisationId: string;
    from?: Date;
    to?: Date;
    activeOnly?: boolean;
  },
): Promise<InterviewerAvailabilityWindow[]> {
  let query = supabase
    .from("interviewer_availability_windows")
    .select(
      "id, user_id, organisation_id, starts_at, ends_at, recurring_pattern, notes, is_active, created_at, updated_at",
    )
    .eq("user_id", params.userId)
    .eq("organisation_id", params.organisationId)
    .order("starts_at", { ascending: true });

  if (params.activeOnly !== false) {
    query = query.eq("is_active", true);
  }
  if (params.from) {
    query = query.gte("ends_at", params.from.toISOString());
  }
  if (params.to) {
    query = query.lte("starts_at", params.to.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InterviewerAvailabilityWindow[];
}

export async function listJobInterviewerAvailability(
  admin: SupabaseClient,
  params: {
    jobId: string;
    organisationId: string;
    interviewerUserIds: string[];
    from: Date;
    to: Date;
  },
): Promise<
  Array<
    InterviewerAvailabilityWindow & {
      interviewer: { id: string; display_name: string | null };
    }
  >
> {
  const ids = [...new Set(params.interviewerUserIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data: windows, error } = await admin
    .from("interviewer_availability_windows")
    .select(
      "id, user_id, organisation_id, starts_at, ends_at, recurring_pattern, notes, is_active, created_at, updated_at",
    )
    .eq("organisation_id", params.organisationId)
    .eq("is_active", true)
    .in("user_id", ids)
    .gte("ends_at", params.from.toISOString())
    .lte("starts_at", params.to.toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw error;
  const list = ((windows ?? []) as InterviewerAvailabilityWindow[]).filter((w) =>
    isFutureWindow(w.starts_at),
  );
  if (list.length === 0) return [];

  const profileIds = [...new Set(list.map((w) => w.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", profileIds);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
  );

  return list.map((w) => ({
    ...w,
    interviewer: {
      id: w.user_id,
      display_name: nameById.get(w.user_id) ?? null,
    },
  }));
}

export async function collectJobInterviewerUserIds(
  admin: SupabaseClient,
  jobId: string,
): Promise<string[]> {
  const [{ data: job, error: jobErr }, { data: stages, error: stagesErr }] = await Promise.all([
    admin.from("jobs").select("hiring_manager_id").eq("id", jobId).maybeSingle(),
    admin.from("pipeline_stages").select("stage_type, interviewer_user_id").eq("job_id", jobId),
  ]);

  if (jobErr) throw jobErr;
  if (stagesErr) throw stagesErr;

  const ids = new Set<string>();
  const hiringManagerId = String(job?.hiring_manager_id ?? "").trim();
  if (hiringManagerId) ids.add(hiringManagerId);

  for (const row of stages ?? []) {
    const uid = String(row.interviewer_user_id ?? "").trim();
    if (uid) ids.add(uid);
  }
  return [...ids];
}

/**
 * When no job-assigned interviewer has declared windows, fall back to anyone in the org
 * who has active declared availability (recruiter can still pick real times).
 */
export async function listOrganisationDeclaredAvailability(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    from: Date;
    to: Date;
  },
): Promise<
  Array<
    InterviewerAvailabilityWindow & {
      interviewer: { id: string; display_name: string | null };
    }
  >
> {
  const { data: windows, error } = await admin
    .from("interviewer_availability_windows")
    .select(
      "id, user_id, organisation_id, starts_at, ends_at, recurring_pattern, notes, is_active, created_at, updated_at",
    )
    .eq("organisation_id", params.organisationId)
    .eq("is_active", true)
    .gte("ends_at", params.from.toISOString())
    .lte("starts_at", params.to.toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw error;

  const list = ((windows ?? []) as InterviewerAvailabilityWindow[]).filter((w) =>
    isFutureWindow(w.starts_at),
  );
  if (list.length === 0) return [];

  const userIds = [...new Set(list.map((w) => w.user_id))];
  const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", userIds);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
  );

  return list.map((w) => ({
    ...w,
    interviewer: {
      id: w.user_id,
      display_name: nameById.get(w.user_id) ?? null,
    },
  }));
}
