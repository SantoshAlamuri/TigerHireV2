import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import {
  type AuthContext,
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import {
  ensureReferralToken,
  getReferralLinkTtlDays,
  publicAppOrigin,
  refreshReferralToken,
} from "@/lib/referrers/referral-link-mint";

const bodySchema = z.object({
  referrer_id: z.string().uuid().optional(),
  job_ids: z.array(z.string().uuid()).min(1).max(50),
  /** When true, existing links get a new expires_at (same token); open jobs only. Missing row falls back to mint. */
  refresh: z.boolean().optional(),
});

type JobOrgRow = {
  id: string;
  title: string;
  status: string;
  organisation_id: string;
  list_on_public_job_board: boolean;
  list_for_internal_referrals: boolean;
  organisations: { slug: string } | { slug: string }[] | null;
};

type GeneratedReferralLink = {
  job_id: string;
  job_title: string;
  token: string;
  apply_url: string;
  /** ISO time after which ?ref= is rejected; null for legacy links with no expiry. */
  expires_at: string | null;
};

function canGenerateReferralLinkForJob(
  ctx: AuthContext,
  job: Pick<
    JobOrgRow,
    "organisation_id" | "list_on_public_job_board" | "list_for_internal_referrals"
  >,
  agencyClientOrgIds: Set<string> | null,
): boolean {
  const pub = job.list_on_public_job_board !== false;
  const intr = job.list_for_internal_referrals !== false;
  const internalOnly = !pub && intr;
  if (!pub && !intr) return false;
  // Internal-only roles are intentionally non-shareable via referral links.
  if (internalOnly) return false;

  if (hasRole(ctx, "employee")) {
    return Boolean(ctx.organisationId) && ctx.organisationId === job.organisation_id;
  }
  if (hasRole(ctx, "leadership", "recruiter", "hiring_manager")) {
    return Boolean(ctx.organisationId) && ctx.organisationId === job.organisation_id;
  }
  if (
    hasRole(ctx, "agency") &&
    ctx.organisationId &&
    agencyClientOrgIds?.has(job.organisation_id)
  ) {
    return intr || pub;
  }
  return pub;
}

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function resolveReferrerIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  // Resolve strictly by the authenticated user_id. Never fall back to matching
  // a referrer by the caller-controlled candidates.phone → referrers.whatsapp_number:
  // a candidate could set their phone to a victim's WhatsApp number and mint
  // referral links as that referrer. Linking a WhatsApp-created referrer to a
  // user account happens only through OTP verification (POST /api/refer/otp/verify).
  const { data: byUser } = await supabase
    .from("referrers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (byUser?.id as string | undefined) ?? null;
}

/**
 * POST /api/refer/links/generate — one referral link per (referrer_id, job_id).
 * - New rows go in `links`; existing rows go in `existing_links` (no duplicate mint).
 * - Body `refresh: true`: extend expires_at for existing links (same token/URL); only when job is open.
 * - Closed jobs are listed in `closed_jobs` with titles (no link created).
 * Auth: logged-in user resolved to referrer (WhatsApp verified).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await checkRateLimit({
    key: `refer-links-generate:${ip}`,
    limit: 30,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return jsonError("Too many requests. Please try again later.", 429);
  }

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const supabase = createSupabaseAdmin();
  const referrer_id = await resolveReferrerIdForUser(supabase, ctx.userId);
  if (!referrer_id) {
    return jsonSuccess({
      needs_setup: true,
      message: "Set up your referrer profile first",
    });
  }

  const parsedBody = await parseJsonBody(request, "POST /api/refer/links/generate");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const parsed = bodySchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);
  const { job_ids, refresh: requestRefresh } = parsed.data;
  const requestRenew = requestRefresh === true;

  const origin = publicAppOrigin(request);

  let agencyClientOrgIds: Set<string> | null = null;
  if (hasRole(ctx, "agency") && ctx.organisationId) {
    const { data: clientRows } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ctx.organisationId);
    agencyClientOrgIds = new Set(
      (clientRows ?? []).map(
        (r) => (r as { client_organisation_id: string }).client_organisation_id,
      ),
    );
  }

  const { data: refRow, error: refErr } = await supabase
    .from("referrers")
    .select("id")
    .eq("id", referrer_id)
    .eq("whatsapp_verified", true)
    .maybeSingle();

  if (refErr || !refRow?.id) {
    return jsonError("Referrer not found or WhatsApp not verified.", 403);
  }

  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      title,
      status,
      organisation_id,
      list_on_public_job_board,
      list_for_internal_referrals,
      organisations!jobs_organisation_id_fkey ( slug )
    `,
    )
    .in("id", job_ids);

  if (jobsErr) {
    return jsonError("Could not load jobs. Please try again.", 500);
  }

  const jobMap = new Map<string, { title: string; orgSlug: string; status: string }>();
  for (const row of (jobs ?? []) as JobOrgRow[]) {
    if (!canGenerateReferralLinkForJob(ctx, row, agencyClientOrgIds)) {
      return jsonError(
        "One or more jobs are not available for your account or listing settings.",
        403,
      );
    }
    const org = unwrapOne(row.organisations);
    const slug = org?.slug?.trim();
    if (!slug) continue;
    jobMap.set(row.id, {
      title: (row.title as string) ?? "Role",
      orgSlug: slug,
      status: (row.status as string) ?? "",
    });
  }

  const missingIds = job_ids.filter((id) => !jobMap.has(id));
  if (missingIds.length > 0) {
    return jsonError("One or more jobs are invalid or not available for referral links.", 400);
  }

  const links: GeneratedReferralLink[] = [];
  const existing_links: GeneratedReferralLink[] = [];
  const refreshed_links: GeneratedReferralLink[] = [];
  const closed_jobs: { job_id: string; job_title: string }[] = [];

  for (const jobId of job_ids) {
    const meta = jobMap.get(jobId)!;
    if (meta.status !== "open") {
      closed_jobs.push({ job_id: jobId, job_title: meta.title });
      continue;
    }

    const buildRow = (token: string, expiresAt: string | null): GeneratedReferralLink => ({
      job_id: jobId,
      job_title: meta.title,
      token,
      apply_url: `${origin}/apply/${encodeURIComponent(meta.orgSlug)}?job=${encodeURIComponent(jobId)}&ref=${encodeURIComponent(token)}`,
      expires_at: expiresAt,
    });

    if (requestRenew) {
      const refOut = await refreshReferralToken(supabase, referrer_id, jobId);
      if (refOut.ok) {
        refreshed_links.push(buildRow(refOut.token, refOut.expiresAt));
        continue;
      }
      if (refOut.reason === "job_not_open") {
        closed_jobs.push({ job_id: jobId, job_title: meta.title });
        continue;
      }
      /* no_link — fall through to mint / ensure */
    }

    const { token, alreadyExisted, expiresAt } = await ensureReferralToken(
      supabase,
      referrer_id,
      jobId,
    );
    if (!token) {
      return jsonError("Could not create a referral link. Please try again.", 500);
    }
    const row = buildRow(token, expiresAt);
    if (alreadyExisted) {
      existing_links.push(row);
    } else {
      links.push(row);
    }
  }

  return jsonSuccess({
    referral_link_ttl_days: getReferralLinkTtlDays(),
    links,
    existing_links,
    refreshed_links,
    closed_jobs,
  });
}
