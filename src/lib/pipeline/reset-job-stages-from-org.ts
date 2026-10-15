import type { SupabaseClient } from "@supabase/supabase-js";
import { seedPipelineStagesForNewJob } from "@/lib/pipeline/job-pipeline-seed";
import { TIGERHIRE_DEFAULT_ORG_PIPELINE } from "@/lib/pipeline/default-org-template";
import { logger } from "@/lib/observability/logger";

const PIPELINE_SYSTEM_LOCKED_STAGE_NAMES = [
  "Applied",
  "FitScore Review",
  "Hired",
  "Rejected",
  "Withdrawn",
] as const;
const PIPELINE_SYSTEM_LOCKED_STAGE_SET = new Set<string>(PIPELINE_SYSTEM_LOCKED_STAGE_NAMES);

type StageTemplateRow = {
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

function toTemplateRow(
  row: Omit<StageTemplateRow, "notify_email_body" | "interviewer_email" | "interviewer_name">,
): StageTemplateRow {
  return {
    ...row,
    notify_email_body: null,
    interviewer_email: null,
    interviewer_name: null,
  };
}

/**
 * Keeps locked stages, removes unlocked stages, moves affected candidates to FitScore Review,
 * then inserts unlocked rows from org defaults (TigerHire template when org has none).
 */
export async function resetJobPipelineStagesFromOrg(
  admin: SupabaseClient,
  organisationId: string,
  jobId: string,
): Promise<void> {
  const { data: fitRow } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("job_id", jobId)
    .eq("stage_name", "FitScore Review")
    .maybeSingle();

  if (!fitRow?.id) {
    await admin.from("pipeline_stages").delete().eq("job_id", jobId);
    await seedPipelineStagesForNewJob(admin, organisationId, jobId);
    return;
  }
  const fitScoreStageId = fitRow.id as string;

  const { data: unlockedRows } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("job_id", jobId)
    .eq("is_locked", false);

  const unlockedIds = (unlockedRows ?? []).map((r) => r.id as string);
  if (unlockedIds.length > 0) {
    await admin
      .from("pipeline_candidates")
      .update({ stage_id: fitScoreStageId })
      .eq("job_id", jobId)
      .in("stage_id", unlockedIds);

    await admin.from("pipeline_stages").delete().eq("job_id", jobId).in("id", unlockedIds);
  }

  const { data: orgRows } = await admin
    .from("org_pipeline_stage_defaults")
    .select(
      "stage_name, stage_order, stage_type, sla_days, is_locked, notify_candidate, color, notify_email_body, interviewer_email, interviewer_name",
    )
    .eq("organisation_id", organisationId)
    .order("stage_order", { ascending: true });

  const sourceTemplate: StageTemplateRow[] =
    orgRows && orgRows.length > 0
      ? (orgRows as StageTemplateRow[])
      : TIGERHIRE_DEFAULT_ORG_PIPELINE.map(toTemplateRow);

  const sourceByName = new Map(sourceTemplate.map((r) => [r.stage_name, r]));
  const canonicalLockedByName = new Map(
    TIGERHIRE_DEFAULT_ORG_PIPELINE.filter((r) => r.is_locked).map((r) => [
      r.stage_name,
      toTemplateRow(r),
    ]),
  );
  const pickLockedStage = (name: (typeof PIPELINE_SYSTEM_LOCKED_STAGE_NAMES)[number]) => {
    const fromSource = sourceByName.get(name);
    if (fromSource?.is_locked) return fromSource;
    return canonicalLockedByName.get(name)!;
  };

  const mergedTemplate: StageTemplateRow[] = [
    { ...pickLockedStage("Applied"), stage_order: 0 },
    { ...pickLockedStage("FitScore Review"), stage_order: 1 },
  ];
  let mergedOrder = 2;

  for (const row of sourceTemplate) {
    if (row.is_locked) continue;
    if (PIPELINE_SYSTEM_LOCKED_STAGE_SET.has(row.stage_name)) continue;
    mergedTemplate.push({ ...row, stage_order: mergedOrder++ });
  }
  for (const lockedName of PIPELINE_SYSTEM_LOCKED_STAGE_NAMES.slice(2)) {
    mergedTemplate.push({ ...pickLockedStage(lockedName), stage_order: mergedOrder++ });
  }
  for (const row of sourceTemplate) {
    if (!row.is_locked) continue;
    if (PIPELINE_SYSTEM_LOCKED_STAGE_SET.has(row.stage_name)) continue;
    mergedTemplate.push({ ...row, stage_order: mergedOrder++ });
  }

  const { data: existingRows } = await admin
    .from("pipeline_stages")
    .select("id, stage_name")
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  const existingByName = new Map(
    (existingRows ?? []).map((row) => [String(row.stage_name), String(row.id)]),
  );

  const rowsToInsert = mergedTemplate.filter((r) => {
    const row = r as { stage_name?: string; is_locked?: boolean };
    if (!row.is_locked) return true;
    if (row.stage_name === "Applied" || row.stage_name === "FitScore Review") return false;
    return !existingByName.has(String(row.stage_name));
  });

  // Start immediately after FitScore Review so unlocked stages stay between
  // the two system intake stages and terminal locked stages.
  let nextOrder = 2;

  const insertPayload = rowsToInsert.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      job_id: jobId,
      stage_name: row.stage_name as string,
      stage_order: nextOrder++,
      stage_type: row.stage_type as string,
      sla_days: row.sla_days as number | null,
      is_locked: Boolean(row.is_locked),
      notify_candidate: Boolean(row.notify_candidate),
      color: (row.color as string) ?? "#6366f1",
      notify_email_body: (row.notify_email_body as string | null) ?? null,
      interviewer_email: (row.interviewer_email as string | null) ?? null,
      interviewer_name: (row.interviewer_name as string | null) ?? null,
    };
  });

  if (insertPayload.length > 0) {
    const { error: insErr } = await admin.from("pipeline_stages").insert(insertPayload);
    if (insErr) {
      logger.error("resetJobPipelineStagesFromOrg: insert failed", {
        error: insErr.message,
        jobId,
      });
      throw insErr;
    }
  }

  const { data: all } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  let i = 0;
  for (const row of all ?? []) {
    await admin
      .from("pipeline_stages")
      .update({ stage_order: i++ })
      .eq("id", row.id as string);
  }
}
