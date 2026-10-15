import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationApplyError } from "@/lib/applications/application-apply-error";

const DEFAULT_COOLING_DAYS = 90;

/** Days after a rejected/withdrawn application at the same company before new applies are allowed. Set env to `0` to disable. */
export function getApplicationCoolingOffDays(): number {
  const raw = process.env.APPLICATION_COOLING_OFF_DAYS;
  if (raw === undefined || raw === "") return DEFAULT_COOLING_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_COOLING_DAYS;
  return n;
}

/** Exposed on GET /api/apply/[slug] so the apply UI can explain re-apply rules before POST (A3 / Sprint 1). */
export function getPublicReapplyPolicyPayload(): {
  coolingOffDays: number;
  active: boolean;
} {
  const d = getApplicationCoolingOffDays();
  return { coolingOffDays: d, active: d > 0 };
}

export function coolingOffEndMs(lastTerminalUpdatedAt: string, days: number): number {
  const t = new Date(lastTerminalUpdatedAt).getTime();
  return t + days * 86_400_000;
}

export function isCoolingOffActive(
  lastTerminalUpdatedAt: string,
  nowMs: number,
  days: number,
): boolean {
  if (days <= 0) return false;
  return nowMs < coolingOffEndMs(lastTerminalUpdatedAt, days);
}

export async function fetchLatestTerminalApplicationAtOrg(
  supabase: SupabaseClient,
  candidateId: string,
  organisationId: string,
): Promise<{ updated_at: string } | null> {
  const { data, error } = await supabase
    .from("applications")
    .select("updated_at, jobs!inner(organisation_id)")
    .eq("candidate_id", candidateId)
    .in("status", ["rejected", "withdrawn"])
    .eq("jobs.organisation_id", organisationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { updated_at: data.updated_at as string };
}

export async function fetchApplicationForJob(
  supabase: SupabaseClient,
  candidateId: string,
  jobId: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase
    .from("applications")
    .select("id, status")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string, status: data.status as string };
}

export async function assertNotInOrgCoolingOff(
  supabase: SupabaseClient,
  candidateId: string,
  organisationId: string,
): Promise<void> {
  const days = getApplicationCoolingOffDays();
  if (days <= 0) return;

  const terminal = await fetchLatestTerminalApplicationAtOrg(supabase, candidateId, organisationId);
  if (!terminal) return;

  const now = Date.now();
  if (!isCoolingOffActive(terminal.updated_at, now, days)) return;

  const retry = new Date(coolingOffEndMs(terminal.updated_at, days)).toISOString();
  throw new ApplicationApplyError(
    `Applications to this company are paused until ${new Date(retry).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}.`,
    "cooling_off",
    retry,
  );
}
