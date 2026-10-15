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
import { countApplications, countOfferOutcomes } from "@/lib/v2/portfolio-counts";
import {
  loadOpenJobs,
  loadOwnerNames,
  loadRubrics,
  PortfolioQueryError,
  toPayloadJob,
  type PortfolioPayload,
} from "@/lib/v2/portfolio-query";

/**
 * GET /api/portfolio — every open job with its true applicant counts.
 *
 * The page this serves used to build itself from three list endpoints and count
 * the rows that came back, one of which (`/api/applications`) hard-caps at 100
 * — so "47 waiting" was the size of a first page, presented as a total. It also
 * had no way to resolve an owner's name and no offer data at all.
 *
 * The counting lives in `lib/v2/portfolio-query`; this route is the tenant
 * boundary and the shape of the response. Scoping is explicit in the queries
 * rather than left to RLS, because the reads go through the admin client to
 * avoid a policy round-trip per job.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    // Matches `viewPortfolio` in lib/v2/seat-capabilities — the seats whose own
    // work this rolls up. An agency has no business reading the client's board,
    // and a hiring manager's seat is their own jobs, not the portfolio.
    if (!hasRole(ctx, "recruiter", "leadership", "super_admin")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const db = createSupabaseAdmin();
    const orgId = ctx.organisationId;

    const jobs = await loadOpenJobs(db, orgId);
    if (jobs.length === 0) {
      const empty: PortfolioPayload = {
        jobs: [],
        offers: { accepted: 0, declined: 0, expired: 0 },
        complete: true,
      };
      return jsonSuccess(empty);
    }

    const jobIds = jobs.map((j) => j.id);
    const [ownerNames, rubrics] = await Promise.all([
      loadOwnerNames(db, orgId, jobs),
      loadRubrics(db, orgId, jobIds),
    ]);
    const { counts, complete } = await countApplications(db, orgId, jobIds, rubrics);
    const offers = await countOfferOutcomes(db, orgId);

    const payload: PortfolioPayload = {
      jobs: jobs.map((j) => toPayloadJob(j, ownerNames, rubrics, counts)),
      offers,
      complete,
    };
    return jsonSuccess(payload);
  } catch (err) {
    if (err instanceof PortfolioQueryError) return jsonError("Failed to load portfolio", 500);
    return handleApiError(err, "Failed to load portfolio", { route: "GET /api/portfolio" });
  }
}
