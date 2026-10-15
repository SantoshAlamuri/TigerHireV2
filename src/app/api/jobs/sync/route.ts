import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { runJobsSync } from "@/lib/jobs/sync/runner";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { withCorrelation } from "@/lib/observability/with-correlation";
import { withRouteSpan } from "@/lib/observability/route-span";
import { JOB_SOURCES } from "@/lib/jobs/types";

type SyncSource = "all" | (typeof JOB_SOURCES)[number];

export const POST = withCorrelation(async (request: NextRequest) =>
  withRouteSpan("POST /api/jobs/sync", async () => {
    try {
      const sourceParam = request.nextUrl.searchParams.get("source") ?? "all";
      const source = isSyncSource(sourceParam) ? sourceParam : "all";

      const authorized = await isAuthorizedSyncRequest(request);
      if (!authorized) return jsonError("Unauthorized", 401);

      const result = await runJobsSync(source);
      return NextResponse.json(result, { status: 200 });
    } catch (error) {
      return handleApiError(error, "Jobs sync failed", {
        route: "POST /api/jobs/sync",
      });
    }
  }),
);

export { POST as GET };

async function isAuthorizedSyncRequest(request: NextRequest): Promise<boolean> {
  const viaCron = await validateCronSecret(request);
  if (viaCron) return true;

  const configuredSyncSecret = env.syncSecret;
  if (!configuredSyncSecret) return false;

  const headerSecret = request.headers.get("x-sync-secret");
  if (headerSecret && headerSecret === configuredSyncSecret) return true;

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return bearer === configuredSyncSecret;
}

function isSyncSource(value: string): value is SyncSource {
  return value === "all" || JOB_SOURCES.includes(value as (typeof JOB_SOURCES)[number]);
}
