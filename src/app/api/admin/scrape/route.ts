import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { scrapeNaukriCandidates, scrapeIndeedJobs, getApifyUsage } from "@/lib/services/apify";
import { runTalentScoutAgent } from "@/lib/agents/talent-scout";
import { runHiringSignalAgent } from "@/lib/agents/hiring-signal";
import { validateOrigin } from "@/lib/security/csrf";

/**
 * GET /api/admin/scrape — check Apify usage/credits
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const usage = await getApifyUsage();
    return jsonSuccess({ usage });
  } catch (err) {
    return handleApiError(err, "Failed to check Apify usage", {
      route: "GET /api/admin/scrape",
    });
  }
}

/**
 * POST /api/admin/scrape — trigger a scraping run
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "admin-scrape",
        userId: ctx.userId,
      }),
      limit: 5,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Scrape rate limit exceeded. Please wait.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/admin/scrape");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.body as Record<string, unknown>;
    const source = body.source as string;

    switch (source) {
      case "naukri": {
        const keywords = (body.keywords as string[]) ?? ["software engineer", "product manager"];
        const location = (body.location as string) ?? "Bengaluru";
        const maxResults = (body.maxResults as number) ?? 100;

        const signals = await scrapeNaukriCandidates({
          keywords,
          location,
          maxResults,
        });
        const result = await runTalentScoutAgent(signals);

        return jsonSuccess({
          source: "naukri",
          signalsFound: signals.length,
          processed: result.recordsProcessed,
          created: result.recordsCreated,
          errors: result.errors.length,
        });
      }

      case "indeed": {
        const query = (body.query as string) ?? "software engineer";
        const location = (body.location as string) ?? "Bengaluru";
        const maxResults = (body.maxResults as number) ?? 50;

        const jobs = await scrapeIndeedJobs({ query, location, maxResults });
        const result = await runHiringSignalAgent(
          jobs.map((j) => ({
            companyName: j.companyName,
            source: j.source,
            jobTitle: j.jobTitle,
            jobDescription: j.jobDescription,
            location: j.location,
            sourceUrl: j.sourceUrl,
          })),
        );

        return jsonSuccess({
          source: "indeed",
          jobsFound: jobs.length,
          processed: result.recordsProcessed,
          created: result.recordsCreated,
          errors: result.errors.length,
        });
      }

      default:
        return jsonError(`Unknown source: ${source}. Supported: naukri, indeed`, 400);
    }
  } catch (err) {
    return handleApiError(err, "Scraping failed", {
      route: "POST /api/admin/scrape",
    });
  }
}
