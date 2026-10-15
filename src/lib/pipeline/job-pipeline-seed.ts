import type { SupabaseClient } from "@supabase/supabase-js";
import { TIGERHIRE_DEFAULT_ORG_PIPELINE } from "@/lib/pipeline/default-org-template";
import { logger } from "@/lib/observability/logger";

type OrgDefaultRow = {
  stage_name: string;
  stage_order: number;
  stage_type: string;
  sla_days: number | null;
  is_locked: boolean;
  notify_candidate: boolean;
  color: string | null;
  notify_email_body: string | null;
  interviewer_email: string | null;
  interviewer_name: string | null;
};

const PIPELINE_SYSTEM_LOCKED_STAGE_NAMES = [
  "Applied",
  "FitScore Review",
  "Hired",
  "Rejected",
  "Withdrawn",
] as const;
const PIPELINE_SYSTEM_LOCKED_STAGE_SET = new Set<string>(PIPELINE_SYSTEM_LOCKED_STAGE_NAMES);

function toOrgDefaultRow(
  row: Omit<OrgDefaultRow, "notify_email_body" | "interviewer_email" | "interviewer_name">,
): OrgDefaultRow {
  return {
    ...row,
    notify_email_body: null,
    interviewer_email: null,
    interviewer_name: null,
  };
}

/**
 * After a job is created: copy org defaults into pipeline_stages, or the TigerHire template
 * when the org has not configured defaults yet.
 */
export async function seedPipelineStagesForNewJob(
  admin: SupabaseClient,
  organisationId: string,
  jobId: string,
): Promise<void> {
  const { data: orgRows, error: orgErr } = await admin
    .from("org_pipeline_stage_defaults")
    .select(
      "stage_name, stage_order, stage_type, sla_days, is_locked, notify_candidate, color, notify_email_body, interviewer_email, interviewer_name",
    )
    .eq("organisation_id", organisationId)
    .order("stage_order", { ascending: true });

  if (orgErr) {
    logger.error("seedPipelineStagesForNewJob: failed to read org defaults", {
      error: orgErr.message,
      organisationId,
      jobId,
    });
  }

  const sourceRows: OrgDefaultRow[] =
    orgRows && orgRows.length > 0
      ? (orgRows as OrgDefaultRow[])
      : TIGERHIRE_DEFAULT_ORG_PIPELINE.map(toOrgDefaultRow);

  const sourceByName = new Map(sourceRows.map((r) => [r.stage_name, r]));
  const canonicalLockedByName = new Map(
    TIGERHIRE_DEFAULT_ORG_PIPELINE.filter((r) => r.is_locked).map((r) => [
      r.stage_name,
      toOrgDefaultRow(r),
    ]),
  );

  const pickLockedStage = (name: (typeof PIPELINE_SYSTEM_LOCKED_STAGE_NAMES)[number]) => {
    const fromSource = sourceByName.get(name);
    if (fromSource?.is_locked) return fromSource;
    return canonicalLockedByName.get(name)!;
  };

  const unlockedRows = sourceRows.filter(
    (r) => !r.is_locked && !PIPELINE_SYSTEM_LOCKED_STAGE_SET.has(r.stage_name),
  );
  const extraLockedRows = sourceRows.filter(
    (r) => r.is_locked && !PIPELINE_SYSTEM_LOCKED_STAGE_SET.has(r.stage_name),
  );

  const finalRows: OrgDefaultRow[] = [];
  finalRows.push({ ...pickLockedStage("Applied"), stage_order: 0 });
  finalRows.push({ ...pickLockedStage("FitScore Review"), stage_order: 1 });

  let order = 2;
  for (const r of unlockedRows) {
    finalRows.push({ ...r, stage_order: order++ });
  }
  for (const lockedName of PIPELINE_SYSTEM_LOCKED_STAGE_NAMES.slice(2)) {
    finalRows.push({ ...pickLockedStage(lockedName), stage_order: order++ });
  }
  for (const r of extraLockedRows) {
    finalRows.push({ ...r, stage_order: order++ });
  }

  const insertPayload = finalRows.map((r) => ({
    job_id: jobId,
    stage_name: r.stage_name,
    stage_order: r.stage_order,
    stage_type: r.stage_type,
    sla_days: r.sla_days,
    is_locked: r.is_locked,
    notify_candidate: r.notify_candidate,
    color: r.color ?? "#6366f1",
    notify_email_body: r.notify_email_body,
    interviewer_email: r.interviewer_email,
    interviewer_name: r.interviewer_name,
  }));

  const { error: insErr } = await admin.from("pipeline_stages").insert(insertPayload);
  if (insErr) {
    logger.error("seedPipelineStagesForNewJob: insert failed", {
      error: insErr.message,
      jobId,
      organisationId,
    });
    throw insErr;
  }
}
