// Allow up to 5 min so CV parse + per-job fit scoring can finish (Vercel Pro).
export const maxDuration = 300;

import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { cacheDel } from "@/lib/redis/cache";
import { myPipelineKey } from "@/lib/redis/keys";
import {
  AgencyReprocessJdNotApprovedError,
  reprocessAgencyCandidate,
} from "@/lib/agency/reprocess-candidate";

/**
 * POST /api/company/reprocess-candidates
 *
 * Re-processes a recruiter-uploaded candidate by downloading their stored CV
 * from Supabase Storage, extracting text, parsing with Claude, and FitScoring
 * against the caller's own org jobs.
 *
 * Body: JSON { candidateIds: [string] } — exactly one id per request to avoid timeouts.
 * No file re-upload needed — CVs are read from the candidate-cvs bucket.
 *
 * Mirrors POST /api/agency/reprocess-candidates but scopes scoring to the
 * caller's own organisation (passed as the single accessible org id).
 */
// Body: { candidateIds: [string] } — exactly one id per request to avoid timeouts.
const bodySchema = z.object({ candidateIds: z.array(z.string()).optional() });

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "recruiter")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation linked", 400);

    const parsedBody = await parseJsonBody<{ candidateIds?: string[] }>(
      request,
      "POST /api/company/reprocess-candidates",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const validated = bodySchema.safeParse(parsedBody.body);
    if (!validated.success) return jsonError("candidateIds must be an array of strings", 400);

    const candidateIds = validated.data.candidateIds;
    if (!Array.isArray(candidateIds) || candidateIds.length === 0)
      return jsonError("candidateIds array is required", 400);
    if (candidateIds.length > 1)
      return jsonError(
        "Only 1 candidate per request is supported to avoid timeouts. Call the endpoint once per candidate.",
        400,
      );

    const admin = createSupabaseAdmin();
    const orgId = ctx.organisationId;
    const results = [];

    for (const candidateId of candidateIds) {
      try {
        // Ownership gate: only reprocess candidates that are actually in this org's
        // pipeline or applications. Candidate reads are cross-org (marketplace), but
        // reprocess RE-PARSES + MUTATES the row and costs a Claude call, so it must
        // not be triggerable for arbitrary candidates outside the caller's org.
        const [{ data: pc }, { data: app }] = await Promise.all([
          admin
            .from("pipeline_candidates")
            .select("id, jobs!inner(organisation_id)")
            .eq("candidate_id", candidateId)
            .eq("jobs.organisation_id", orgId)
            .limit(1),
          admin
            .from("applications")
            .select("id, jobs!inner(organisation_id)")
            .eq("candidate_id", candidateId)
            .eq("jobs.organisation_id", orgId)
            .limit(1),
        ]);
        if ((pc?.length ?? 0) === 0 && (app?.length ?? 0) === 0) {
          results.push({
            candidateId,
            success: false,
            error: "Candidate is not in your organisation's pipeline.",
          });
          continue;
        }

        const result = await reprocessAgencyCandidate(admin, {
          candidateId,
          // The caller's own org is the single accessible org for scoping jobs.
          agencyOrganisationId: ctx.organisationId,
          clientOrgIds: [ctx.organisationId],
          triggeredByUserId: ctx.userId,
          // Uploads are NOT exempt from the always-on canonical screening gate. The
          // recruiter's questions are sent over WhatsApp at upload time; this pass only
          // scores candidates whose answers are on file (others stay held until they reply).
        });
        results.push(result);
      } catch (err) {
        if (err instanceof AgencyReprocessJdNotApprovedError) {
          return jsonError(err.message, 428);
        }
        throw err;
      }
    }

    await cacheDel(myPipelineKey(ctx.userId));

    return jsonSuccess({ results });
  } catch (err) {
    return handleApiError(err, "Failed to reprocess candidates", {
      route: "POST /api/company/reprocess-candidates",
    });
  }
}
