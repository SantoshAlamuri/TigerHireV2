import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
  parseJsonBody,
} from "@/lib/api-helpers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateOrigin } from "@/lib/security/csrf";
import { assertJobAccess } from "@/lib/job-access";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";

const bulkActionSchema = z
  .object({
    pipelineCandidateIds: z.array(z.string().uuid()).min(1).max(100),
    action: z.enum(["move", "reject_with_template", "tag"]),
    status: z.enum(["shortlisted", "in_progress", "hired", "rejected"]).optional(),
    template: z.string().trim().max(1000).optional(),
    tag: z.string().trim().max(100).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "hiring_manager", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "pipeline-bulk",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 20,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Too many requests", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/pipeline/bulk");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = bulkActionSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues.map((issue) => issue.message).join("; "), 422);
    }

    const payload = parsed.data;
    const admin = createSupabaseAdmin();
    const { data: rows, error: fetchErr } = await admin
      .from("pipeline_candidates")
      .select("id, job_id, candidate_id, status, jobs(organisation_id)")
      .in("id", payload.pipelineCandidateIds);
    if (fetchErr) return jsonError("Failed to load pipeline rows", 500);

    const supabase = await createSupabaseServerClient();
    const jobIds = new Set(
      (rows ?? []).map((row) => (row as { job_id?: string }).job_id).filter(Boolean) as string[],
    );
    if (jobIds.size === 0) return jsonError("Forbidden", 403);
    for (const jobId of jobIds) {
      const { job } = await assertJobAccess(supabase, ctx, jobId);
      if (!job) return jsonError("Forbidden", 403);
    }

    let updated = 0;
    const actionMetadata: Record<string, unknown> = {
      action: payload.action,
      candidateCount: payload.pipelineCandidateIds.length,
      organisationId: ctx.organisationId ?? null,
    };
    if (payload.action === "move") {
      if (!payload.status) return jsonError("status is required for move action", 422);
      const { error: updateErr } = await admin
        .from("pipeline_candidates")
        .update({ status: payload.status, updated_at: new Date().toISOString() })
        .in("id", payload.pipelineCandidateIds);
      if (updateErr) return jsonError("Failed to apply bulk status move", 500);
      updated = payload.pipelineCandidateIds.length;
      actionMetadata.status = payload.status;
    } else if (payload.action === "reject_with_template") {
      const template = payload.template?.trim();
      if (!template) return jsonError("template is required for reject_with_template", 422);
      const { error: updateErr } = await admin
        .from("pipeline_candidates")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .in("id", payload.pipelineCandidateIds);
      if (updateErr) return jsonError("Failed to reject selected candidates", 500);
      const noteRows = (rows ?? []).map((row) => ({
        candidate_id: row.candidate_id as string,
        job_id: row.job_id as string,
        author_id: ctx.userId,
        body: `Bulk reject template: ${template}`,
      }));
      if (noteRows.length > 0) {
        await admin.from("candidate_notes").insert(noteRows);
      }
      updated = payload.pipelineCandidateIds.length;
      actionMetadata.template = template;
    } else if (payload.action === "tag") {
      const tag = payload.tag?.trim();
      if (!tag) return jsonError("tag is required for tag action", 422);
      const noteRows = (rows ?? []).map((row) => ({
        candidate_id: row.candidate_id as string,
        job_id: row.job_id as string,
        author_id: ctx.userId,
        body: `[tag:${tag}]`,
      }));
      if (noteRows.length > 0) {
        const { error: noteErr } = await admin.from("candidate_notes").insert(noteRows);
        if (noteErr) return jsonError("Failed to apply bulk tag", 500);
      }
      updated = payload.pipelineCandidateIds.length;
      actionMetadata.tag = tag;
    }

    const { error: auditError } = await admin.from("audit_log").insert({
      organisation_id: ctx.organisationId,
      actor_user_id: ctx.userId,
      actor_email: null,
      event_type: "pipeline.bulk_action",
      resource_type: "pipeline_candidates",
      resource_id: payload.pipelineCandidateIds.join(","),
      metadata: actionMetadata,
    });

    return jsonSuccess({ ok: true, updated, auditLogged: !auditError });
  } catch (err) {
    return handleApiError(err, "Failed bulk pipeline action", {
      route: "POST /api/pipeline/bulk",
    });
  }
}
