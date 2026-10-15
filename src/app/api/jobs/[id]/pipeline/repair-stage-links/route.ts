import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";

const ALLOWED_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

type StageRow = {
  id: string;
  stage_name: string;
  stage_order: number;
  stage_type: string | null;
  is_locked: boolean;
};

type PipelineRow = {
  id: string;
  candidate_id: string;
  status: string | null;
  stage_id: string | null;
};

function pickFallbackStageIds(stages: StageRow[]) {
  const byName = (name: string) =>
    stages.find((stage) => stage.stage_name.toLowerCase() === name.toLowerCase())?.id ?? null;
  const byType = (type: string) => stages.find((stage) => stage.stage_type === type)?.id ?? null;

  const firstNonTerminalUnlocked =
    stages.find(
      (stage) =>
        !stage.is_locked &&
        stage.stage_type !== "terminal_reject" &&
        stage.stage_type !== "terminal_hired",
    )?.id ?? null;
  const firstStage = stages[0]?.id ?? null;

  return {
    shortlisted:
      byName("Shortlisted") ??
      stages.find((stage) => stage.stage_type === "screening")?.id ??
      firstNonTerminalUnlocked ??
      firstStage,
    inProgress: firstNonTerminalUnlocked ?? firstStage,
    hired: byType("terminal_hired") ?? byName("Hired") ?? firstStage,
    rejected:
      byType("terminal_reject") ??
      byName("Rejected") ??
      byName("Withdrawn") ??
      firstNonTerminalUnlocked ??
      firstStage,
  };
}

function targetStageForStatus(
  status: string | null,
  fallback: ReturnType<typeof pickFallbackStageIds>,
): string | null {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "hired") return fallback.hired;
  if (normalized === "rejected") return fallback.rejected;
  if (normalized === "shortlisted") return fallback.shortlisted;
  return fallback.inProgress;
}

/**
 * POST /api/jobs/[id]/pipeline/repair-stage-links
 * Backfills/repairs missing or invalid stage_id links for pipeline candidates in a job.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...ALLOWED_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const admin = createSupabaseAdmin();

    const { data: job } = await admin
      .from("jobs")
      .select("id, organisation_id")
      .eq("id", jobId)
      .single();
    if (!job) return jsonError("Job not found", 404);
    if (ctx.role !== "super_admin" && job.organisation_id !== ctx.organisationId) {
      return jsonError("Forbidden", 403);
    }

    const { data: stages } = await admin
      .from("pipeline_stages")
      .select("id, stage_name, stage_order, stage_type, is_locked")
      .eq("job_id", jobId)
      .order("stage_order", { ascending: true });
    const stageRows = (stages ?? []) as StageRow[];
    if (stageRows.length === 0) {
      return jsonError("No stages configured for this job", 400);
    }

    const stageIdSet = new Set(stageRows.map((stage) => stage.id));
    const fallback = pickFallbackStageIds(stageRows);

    const { data: pipelineRows } = await admin
      .from("pipeline_candidates")
      .select("id, candidate_id, status, stage_id")
      .eq("job_id", jobId);
    const rows = (pipelineRows ?? []) as PipelineRow[];

    const brokenRows = rows.filter((row) => !row.stage_id || !stageIdSet.has(String(row.stage_id)));

    let repaired = 0;
    let skipped = 0;
    const appStageTypeUpdates = new Map<string, string[]>();
    const stageTypeById = new Map(
      stageRows.map((stage) => [stage.id, stage.stage_type ?? "screening"]),
    );

    for (const row of brokenRows) {
      const targetStageId = targetStageForStatus(row.status, fallback);
      if (!targetStageId) {
        skipped += 1;
        continue;
      }
      const { error: updateErr } = await admin
        .from("pipeline_candidates")
        .update({ stage_id: targetStageId })
        .eq("id", row.id)
        .eq("job_id", jobId);
      if (updateErr) {
        skipped += 1;
        continue;
      }
      repaired += 1;
      const stageType = stageTypeById.get(targetStageId) ?? "screening";
      const list = appStageTypeUpdates.get(stageType) ?? [];
      list.push(row.candidate_id);
      appStageTypeUpdates.set(stageType, list);
    }

    for (const [stageType, candidateIds] of appStageTypeUpdates.entries()) {
      const uniqueCandidateIds = [...new Set(candidateIds)];
      if (uniqueCandidateIds.length === 0) continue;
      await admin
        .from("applications")
        .update({ stage_type: stageType, updated_at: new Date().toISOString() })
        .eq("job_id", jobId)
        .in("candidate_id", uniqueCandidateIds);
    }

    return jsonSuccess({
      ok: true,
      repaired,
      skipped,
      examined: brokenRows.length,
      message:
        repaired > 0
          ? `Repaired ${repaired} pipeline candidate stage links.`
          : "No broken stage links found.",
    });
  } catch (err) {
    return handleApiError(err, "Failed to repair pipeline stage links", {
      route: "POST /api/jobs/[id]/pipeline/repair-stage-links",
    });
  }
}
