import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { embedAllCandidates, embedAllJobs } from "@/lib/services/embeddings";

/**
 * POST /api/cron/embed
 * Batch generate embeddings for candidates and jobs missing them.
 * Auth: CRON_SECRET or CRON_SECRET_HASH (SHA-256 hex) in Bearer header.
 */
export async function POST(request: NextRequest) {
  if (!(await validateCronSecret(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [candidateResults, jobResults] = await Promise.all([
      embedAllCandidates(50),
      embedAllJobs(50),
    ]);

    return NextResponse.json({
      candidates: candidateResults,
      jobs: jobResults,
    });
  } catch (err) {
    reportError(err, { route: "POST /api/cron/embed" });
    return NextResponse.json({ error: "Embedding batch failed" }, { status: 500 });
  }
}

export { POST as GET };
