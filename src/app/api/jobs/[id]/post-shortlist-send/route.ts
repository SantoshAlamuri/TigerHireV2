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
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import {
  previewPostShortlistSend,
  sendPostShortlistToShortlisted,
} from "@/lib/prescreen/bulk-post-shortlist";

const READER_ROLES = ["super_admin", "leadership", "recruiter", "agency"] as const;
const WRITER_ROLES = ["super_admin", "leadership", "recruiter"] as const;

const sendSchema = z
  .object({
    dryRun: z.boolean().optional(),
    forceResend: z.boolean().optional(),
    /** When forceResend is set, only resend to candidates who never replied (awaiting_consent). */
    nonRespondersOnly: z.boolean().optional(),
    candidateIds: z.array(z.string().uuid()).max(500).optional(),
  })
  .strict();

function resendSessionStatesFromQuery(
  forceResend: boolean,
  nonRespondersOnly: boolean,
): "awaiting_consent"[] | undefined {
  if (!forceResend) return undefined;
  if (nonRespondersOnly) return ["awaiting_consent"];
  return undefined;
}

/**
 * GET /api/jobs/[id]/post-shortlist-send
 * Preview counts for bulk post-shortlist WhatsApp send.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...READER_ROLES)) return jsonError("Forbidden", 403);

    const { id: jobId } = await params;
    const url = new URL(request.url);
    const forceResend = url.searchParams.get("forceResend") === "true";
    const nonRespondersOnly = url.searchParams.get("nonRespondersOnly") !== "false";

    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);

    const admin = createSupabaseAdmin();
    const preview = await previewPostShortlistSend(
      admin,
      jobId,
      forceResend,
      resendSessionStatesFromQuery(forceResend, nonRespondersOnly),
    );
    return jsonSuccess(preview);
  } catch (err) {
    return handleApiError(err, "Failed to preview post-shortlist send", {
      route: "GET /api/jobs/[id]/post-shortlist-send",
    });
  }
}

/**
 * POST /api/jobs/[id]/post-shortlist-send
 * Send post-shortlist WhatsApp questions to shortlisted pipeline candidates.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, ...WRITER_ROLES)) return jsonError("Forbidden", 403);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "post-shortlist-send",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 5,
      windowSecs: 300,
    });
    if (!rl.allowed) return jsonError("Too many requests — wait a few minutes and retry.", 429);

    const { id: jobId } = await params;
    const parsedBody = await parseJsonBody(request, "POST /api/jobs/[id]/post-shortlist-send");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = sendSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found", 404);
    if (!job.organisation_id) return jsonError("Job has no organisation", 400);

    const admin = createSupabaseAdmin();
    const nonRespondersOnly = parsed.data.nonRespondersOnly !== false;
    const result = await sendPostShortlistToShortlisted({
      admin,
      jobId,
      organisationId: job.organisation_id,
      dryRun: parsed.data.dryRun,
      forceResend: parsed.data.forceResend,
      resendSessionStates: resendSessionStatesFromQuery(
        parsed.data.forceResend === true,
        nonRespondersOnly,
      ),
      candidateIds: parsed.data.candidateIds,
    });

    return jsonSuccess(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send post-shortlist screening";
    return handleApiError(err, msg, {
      route: "POST /api/jobs/[id]/post-shortlist-send",
    });
  }
}
