import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { isEnabled } from "@/lib/feature-flags";
import {
  FEATURE_FLAG_HYBRID_V2,
  findBestIndiaTemplate,
  generateJdBaseDocument,
  getJdBaseByJobId,
  upsertJdBaseFromTemplate,
} from "@/lib/fitscore/hybrid";
import { loadJobForHybridPipeline } from "@/lib/fitscore/hybrid/api-access";
import { buildJdText } from "@/lib/fitscore/job-text";
import { generateCompetenciesFromRubric } from "@/lib/feedback/scorecard-from-rubric";
import { ANTHROPIC_CREDIT_ERROR_MESSAGE } from "@/lib/services/anthropic";
import { logger } from "@/lib/observability/logger";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * POST /api/jobs/[id]/scoring-setup/auto
 *
 * One-click "scoring setup" for a job: chains the existing building blocks into a single
 * draft-for-review pass — JD → scoring rubric + Ideal Candidate Profile → interview scorecard.
 *
 * Everything is left as a DRAFT: the rubric is created unapproved (the existing FitScore
 * approval gate is the review step) and the scorecard is a template the recruiter can edit.
 * Idempotent: an existing rubric or scorecard is reused, never overwritten.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return jsonError("Scoring (Hybrid FitScore v2) is not enabled for your workspace.", 403);
    }

    const { id: jobId } = await params;
    const server = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();

    const job = await loadJobForHybridPipeline(server, admin, ctx, jobId);
    if (!job) return jsonError("Job not found or access denied", 404);

    // Step 1 — scoring rubric + ICP (draft, unapproved). Reuse if it already exists.
    let doc = await getJdBaseByJobId(admin, jobId);
    const rubricCreated = !doc;
    if (!doc) {
      const jdBlob = `${job.title}\n${buildJdText(job)}`;
      const match = findBestIndiaTemplate(jdBlob);
      doc = match
        ? await upsertJdBaseFromTemplate(admin, job, match.template)
        : await generateJdBaseDocument(admin, job);
    }
    if (!doc) return jsonError("Could not create the scoring rubric for this job.", 500);

    // Step 2 — interview scorecard from the rubric + ICP (draft template). Reuse if one exists.
    const { data: existingTemplates } = await server
      .from("feedback_form_templates")
      .select("id, name")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    let scorecard = (existingTemplates ?? [])[0] ?? null;
    const scorecardCreated = !scorecard;
    if (!scorecard) {
      const icp = (doc.idealCandidateProfile ?? null) as {
        summary?: string;
        must_haves?: string[];
      } | null;
      const fields = await generateCompetenciesFromRubric({
        roleTitle: doc.roleTitle ?? job.title ?? "this role",
        context: doc.context ?? null,
        weights: doc.weights ?? null,
        idealSummary: icp?.summary ?? null,
        mustHaves: Array.isArray(icp?.must_haves) ? icp.must_haves : null,
        attribution: { jobId, organisationId: ctx.organisationId ?? undefined },
      });

      const name = `${(doc.roleTitle ?? job.title ?? "Interview").trim()} Scorecard`;
      const { data: created, error } = await server
        .from("feedback_form_templates")
        .insert({ job_id: jobId, name, fields, created_by: ctx.userId })
        .select("id, name")
        .single();
      if (error) {
        logger.error("Auto scoring setup: failed to create scorecard", { error: String(error) });
        return jsonError("Created the scoring rubric, but couldn't create the scorecard.", 500);
      }
      scorecard = created;
    }

    return jsonSuccess({
      rubric: { id: doc.id, created: rubricCreated, approved: Boolean(doc.approvedBy) },
      scorecard: {
        id: scorecard?.id ?? null,
        name: scorecard?.name ?? null,
        created: scorecardCreated,
      },
      needsApproval: !doc.approvedBy,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === ANTHROPIC_CREDIT_ERROR_MESSAGE || /credit balance|Plans & Billing/i.test(msg)) {
      return jsonError(ANTHROPIC_CREDIT_ERROR_MESSAGE, 402);
    }
    return handleApiError(err, "Failed to auto-create scoring setup", {
      route: "POST /api/jobs/[id]/scoring-setup/auto",
    });
  }
}
