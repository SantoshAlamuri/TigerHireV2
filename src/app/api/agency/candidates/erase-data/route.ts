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
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { CandidateService } from "@/lib/services/CandidateService";
import { ConsentService } from "@/lib/services/ConsentService";
import { logger } from "@/lib/observability/logger";

const bodySchema = z
  .object({
    candidateId: z.string().uuid(),
  })
  .strict();

async function agencyPortfolioOrganisationIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  agencyOrganisationId: string,
): Promise<Set<string>> {
  const { data: links } = await supabase
    .from("agency_clients")
    .select("client_organisation_id")
    .eq("agency_organisation_id", agencyOrganisationId);
  const clientIds = (links ?? []).map(
    (r: { client_organisation_id: string }) => r.client_organisation_id,
  );
  return new Set([agencyOrganisationId, ...clientIds]);
}

/**
 * POST /api/agency/candidates/erase-data
 * Agency-only: GDPR-style erase of candidate PII via CandidateService.
 * Allowed only when every job tied to this candidate (applications + pipeline) belongs to
 * the agency's own organisation or one of its linked clients — avoids deleting profiles that
 * also exist outside the agency portfolio.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "agency")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "agency-candidate-erase",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 10,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Too many erase requests. Please wait.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/agency/candidates/erase-data");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { candidateId } = parsed.data;
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const portfolio = await agencyPortfolioOrganisationIds(supabase, ctx.organisationId);

    const [{ data: pcRows }, { data: appRows }] = await Promise.all([
      admin.from("pipeline_candidates").select("job_id").eq("candidate_id", candidateId),
      admin.from("applications").select("job_id").eq("candidate_id", candidateId),
    ]);

    const jobIds = [
      ...new Set([
        ...((pcRows ?? []) as { job_id: string }[]).map((r) => r.job_id),
        ...((appRows ?? []) as { job_id: string }[]).map((r) => r.job_id),
      ]),
    ];

    if (jobIds.length === 0) {
      return jsonError(
        "This candidate has no applications or pipeline rows in TigerHire. Erasure is not available from this action.",
        404,
      );
    }

    const { data: jobs, error: jobsErr } = await admin
      .from("jobs")
      .select("id, organisation_id")
      .in("id", jobIds);

    if (jobsErr || !jobs?.length) {
      logger.error("agency erase-data: jobs lookup failed", {
        candidateId,
        error: jobsErr?.message,
      });
      return jsonError("Could not verify candidate roles", 500);
    }

    const jobOrgById = new Map(
      (jobs as { id: string; organisation_id: string | null }[]).map((j) => [
        j.id,
        j.organisation_id,
      ]),
    );
    for (const jid of jobIds) {
      const orgId = jobOrgById.get(jid);
      if (!orgId || !portfolio.has(orgId)) {
        return jsonError(
          "Cannot erase: this candidate is linked to jobs outside your agency portfolio (another client or organisation). Use a super-admin erasure request if appropriate.",
          403,
        );
      }
    }

    const { data: cand } = await admin
      .from("candidates")
      .select("id, phone")
      .eq("id", candidateId)
      .maybeSingle();

    if (!cand) return jsonError("Candidate not found", 404);

    const phone = (cand.phone as string | null) ?? undefined;

    const erasureRequest = await ConsentService.requestErasure(admin, candidateId, phone, "web");
    await CandidateService.eraseData(admin, candidateId);

    await admin
      .from("erasure_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", erasureRequest.id);

    logger.info("Agency candidate erasure completed", {
      candidate_id: candidateId,
      agency_org: ctx.organisationId,
      user_id: ctx.userId,
    });

    return jsonSuccess({
      message: "Candidate personal data has been erased.",
      requestId: erasureRequest.id,
    });
  } catch (err) {
    return handleApiError(err, "Failed to erase candidate data", {
      route: "POST /api/agency/candidates/erase-data",
    });
  }
}
