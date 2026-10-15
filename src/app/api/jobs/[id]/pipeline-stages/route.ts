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
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { pipelineStageTypeSchema } from "@/lib/pipeline/stage-types";
import { env } from "@/lib/config/env";
import {
  enrichPipelineStagesWithInterviewers,
  type PipelineStageRowBase,
} from "@/lib/pipeline/enrich-pipeline-stages-response";
import { fetchStagesWithCompat } from "@/lib/pipeline/fetch-stages-with-compat";
import { hasInterviewerAssignment, isInterviewLikeStage } from "@/lib/pipeline/stage-interviewer";
import { notifyNewJobInterviewers } from "@/lib/interviews/notify-interviewer-availability";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

const stageWriteSchema = z
  .object({
    id: z.string().uuid().optional(),
    stage_name: z.string().min(1).max(100),
    stage_order: z.number().int().min(0),
    stage_type: pipelineStageTypeSchema.optional(),
    sla_days: z.number().int().min(0).max(365).nullable().optional(),
    is_locked: z.boolean().optional(),
    notify_candidate: z.boolean().optional(),
    color: z.string().max(32).optional(),
    notify_email_body: z.string().max(8000).nullable().optional(),
    interviewer_user_id: z.string().uuid().optional().nullable(),
    interviewer_email: z.string().email().optional().nullable(),
    interviewer_name: z.string().max(200).optional().nullable(),
    feedback_template_id: z.string().uuid().optional().nullable(),
  })
  .strict();

const upsertBodySchema = z
  .object({
    stages: z.array(stageWriteSchema).min(1).max(30),
  })
  .strict();

type StageWrite = z.infer<typeof stageWriteSchema>;

async function resolveInterviewerForWrite(
  admin: ReturnType<typeof createSupabaseAdmin>,
  organisationId: string,
  s: StageWrite,
): Promise<
  | {
      ok: true;
      interviewer_user_id: string | null;
      interviewer_email: string | null;
      interviewer_name: string | null;
    }
  | { ok: false; message: string }
> {
  const uidRaw = (s.interviewer_user_id ?? "").trim();
  if (uidRaw) {
    const { data: pr, error } = await admin
      .from("profiles")
      .select("id, organisation_id, is_active")
      .eq("id", uidRaw)
      .maybeSingle();
    if (error || !pr) return { ok: false, message: "Interviewer profile not found" };
    if (pr.organisation_id !== organisationId) {
      return {
        ok: false,
        message: "Interviewer must belong to the same organisation as this job",
      };
    }
    if (!pr.is_active) return { ok: false, message: "Interviewer profile is inactive" };
    return {
      ok: true,
      interviewer_user_id: uidRaw,
      interviewer_email: null,
      interviewer_name: null,
    };
  }
  return {
    ok: true,
    interviewer_user_id: null,
    interviewer_email: s.interviewer_email?.trim() || null,
    interviewer_name: s.interviewer_name?.trim() || null,
  };
}

/**
 * GET /api/jobs/[id]/pipeline-stages
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const { rows: stages, error } = await fetchStagesWithCompat(supabase, jobId);

  if (error) {
    logger.error("Failed to fetch pipeline stages", {
      error: error.message,
      code: error.code,
    });
    return jsonError("Failed to fetch pipeline stages", 500);
  }

  const admin = createSupabaseAdmin();
  const enriched = await enrichPipelineStagesWithInterviewers(
    admin,
    (stages ?? []) as PipelineStageRowBase[],
  );
  return jsonSuccess({ stages: enriched });
}

/**
 * POST /api/jobs/[id]/pipeline-stages
 * Upsert stages (admin). Locked system stages cannot be reordered or renamed.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const parsedBody = await parseJsonBody(request, "POST /api/jobs/[id]/pipeline-stages");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const parsed = upsertBodySchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

  const admin = createSupabaseAdmin();
  const { data: existingRows } = await admin
    .from("pipeline_stages")
    .select(
      "id, stage_name, stage_order, stage_type, is_locked, sla_days, notify_candidate, color, interviewer_user_id",
    )
    .eq("job_id", jobId);

  const byId = new Map((existingRows ?? []).map((r) => [r.id as string, r]));

  const previousInterviewerIds = new Set<string>();
  for (const row of existingRows ?? []) {
    if (!isInterviewLikeStage(row.stage_type as string)) continue;
    const uid = String(row.interviewer_user_id ?? "").trim();
    if (uid) previousInterviewerIds.add(uid);
  }
  const requestedTemplateIds = [
    ...new Set(
      parsed.data.stages
        .map((stage) => stage.feedback_template_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let allowedTemplateIds = new Set<string>();
  if (requestedTemplateIds.length > 0) {
    const { data: templateRows, error: templateErr } = await admin
      .from("feedback_form_templates")
      .select("id")
      .eq("job_id", jobId)
      .in("id", requestedTemplateIds);
    if (templateErr) {
      logger.error("pipeline-stages feedback template lookup failed", {
        error: templateErr.message,
      });
      return jsonError("Failed to validate feedback templates", 500);
    }
    allowedTemplateIds = new Set((templateRows ?? []).map((row) => row.id as string));
    for (const templateId of requestedTemplateIds) {
      if (!allowedTemplateIds.has(templateId)) {
        return jsonError("Feedback template must belong to this job", 422);
      }
    }
  }

  for (const s of parsed.data.stages) {
    if (!s.id) continue;
    const ex = byId.get(s.id);
    if (!ex?.is_locked) continue;
    const name = ex.stage_name as string;
    const expectedOrder =
      name === "Applied" ? 0 : name === "FitScore Review" ? 1 : (ex.stage_order as number);
    if (s.stage_order !== expectedOrder || s.stage_name !== name) {
      return jsonError("System stages cannot be reordered or renamed", 403);
    }
    if (s.stage_type && s.stage_type !== ex.stage_type) {
      return jsonError("System stage type cannot be changed", 403);
    }
  }

  if (env.ffInterviewerIdentityV1) {
    for (const s of parsed.data.stages) {
      const ex = s.id ? byId.get(s.id) : undefined;
      const effectiveType = String(s.stage_type ?? ex?.stage_type ?? "screening");
      if (
        isInterviewLikeStage(effectiveType) &&
        !hasInterviewerAssignment({
          interviewer_user_id: s.interviewer_user_id,
          interviewer_email: s.interviewer_email,
          interviewer_name: s.interviewer_name,
        })
      ) {
        return jsonError(
          "Interview stages require an internal interviewer or external email and name",
          422,
        );
      }
    }
  }

  const resolvedCache = new Map<string, Awaited<ReturnType<typeof resolveInterviewerForWrite>>>();
  const getResolved = async (s: StageWrite) => {
    const key = JSON.stringify({
      rowId: s.id ?? "new",
      uid: s.interviewer_user_id,
      em: s.interviewer_email,
      nm: s.interviewer_name,
    });
    const hit = resolvedCache.get(key);
    if (hit) return hit;
    const r = await resolveInterviewerForWrite(admin, job.organisation_id, s);
    resolvedCache.set(key, r);
    return r;
  };

  for (const s of parsed.data.stages) {
    const resolved = await getResolved(s);
    if (!resolved.ok) return jsonError(resolved.message, 422);
  }

  for (const s of parsed.data.stages) {
    const ex = s.id ? byId.get(s.id) : undefined;
    const locked = Boolean(ex?.is_locked);
    const resolved = (await getResolved(s)) as Extract<
      Awaited<ReturnType<typeof resolveInterviewerForWrite>>,
      { ok: true }
    >;

    if (locked) {
      const { error: upErr } = await admin
        .from("pipeline_stages")
        .update({
          interviewer_user_id: resolved.interviewer_user_id,
          interviewer_email: resolved.interviewer_email,
          interviewer_name: resolved.interviewer_name,
          notify_email_body: s.notify_email_body ?? null,
          feedback_template_id: s.feedback_template_id ?? null,
        })
        .eq("id", s.id!)
        .eq("job_id", jobId);
      if (upErr) {
        logger.error("pipeline-stages locked update failed", { error: upErr.message });
        return jsonError("Failed to save pipeline stages", 500);
      }
      continue;
    }

    const payload = {
      stage_name: s.stage_name,
      stage_order: s.stage_order,
      stage_type: s.stage_type ?? "screening",
      sla_days: s.sla_days ?? null,
      is_locked: s.is_locked ?? false,
      notify_candidate: s.notify_candidate ?? false,
      color: s.color ?? "#6366f1",
      notify_email_body: s.notify_email_body ?? null,
      interviewer_user_id: resolved.interviewer_user_id,
      interviewer_email: resolved.interviewer_email,
      interviewer_name: resolved.interviewer_name,
      feedback_template_id: s.feedback_template_id ?? null,
    };

    if (s.id) {
      const { error: upErr } = await admin
        .from("pipeline_stages")
        .update({ ...payload })
        .eq("id", s.id)
        .eq("job_id", jobId);
      if (upErr) {
        logger.error("pipeline-stages update failed", { error: upErr.message });
        return jsonError("Failed to save pipeline stages", 500);
      }
    } else {
      const { error: insErr } = await admin.from("pipeline_stages").insert({
        job_id: jobId,
        ...payload,
      });
      if (insErr) {
        logger.error("pipeline-stages insert failed", { error: insErr.message });
        return jsonError("Failed to save pipeline stages", 500);
      }
    }
  }

  const { rows: out, error: outErr } = await fetchStagesWithCompat(admin, jobId);
  if (outErr) {
    logger.error("pipeline-stages refetch failed", {
      error: outErr.message,
      code: outErr.code,
    });
    return jsonError("Failed to load saved pipeline stages", 500);
  }

  const enriched = await enrichPipelineStagesWithInterviewers(
    admin,
    (out ?? []) as PipelineStageRowBase[],
  );

  const nextInterviewerIds = new Set<string>();
  for (const stage of out ?? []) {
    if (!isInterviewLikeStage(stage.stage_type as string)) continue;
    const uid = String(stage.interviewer_user_id ?? "").trim();
    if (uid) nextInterviewerIds.add(uid);
  }

  const jobTitle = String((job as { title?: string }).title ?? "this job");
  void notifyNewJobInterviewers({
    jobId,
    jobTitle,
    previousInterviewerIds,
    nextInterviewerIds,
  }).catch((e) => {
    logger.warn("interviewer availability nudge failed", { error: String(e), jobId });
  });

  return jsonSuccess({ stages: enriched });
}
