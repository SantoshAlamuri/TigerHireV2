import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthContext, requireAuth, hasRole } from "@/lib/api-helpers";
import { normalizeReferrerWhatsapp } from "@/lib/referrers/normalize-whatsapp";
import { publicAppOrigin } from "@/lib/referrers/referral-link-mint";
import { logger } from "@/lib/observability/logger";

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function unwrapFitScore(fitRaw: unknown): number | null {
  if (fitRaw == null) return null;
  if (Array.isArray(fitRaw)) {
    const s = fitRaw[0] as { overall_score?: number | null } | undefined;
    return s?.overall_score ?? null;
  }
  const o = fitRaw as { overall_score?: number | null };
  return o.overall_score ?? null;
}

function appOrigin(request: NextRequest): string {
  return publicAppOrigin(request);
}

type ReferrerPipelineStageKey =
  | "applied"
  | "screened"
  | "shortlisted"
  | "interview"
  | "offer"
  | "rejected";

/**
 * Maps `applications.status` (application_status enum). There is no `pipeline_stage`
 * column on `applications` — see supabase/schema/11_applications.sql.
 */
function referrerStageFromApplicationStatus(status: string): ReferrerPipelineStageKey {
  const s = status.toLowerCase();
  if (s === "rejected" || s === "withdrawn") return "rejected";
  if (s === "hired") return "offer";
  if (s === "shortlisted") return "shortlisted";
  if (s === "viewed") return "screened";
  return "applied";
}

function normalizeReferrerPipelineStage(
  stageName: string | undefined,
  pipelineCandidateStatus: string | undefined,
  applicationStatus: string,
): ReferrerPipelineStageKey {
  const pc = pipelineCandidateStatus?.toLowerCase();
  if (pc === "rejected") return "rejected";
  if (pc === "hired") return "offer";
  if (pc === "in_progress") return "interview";

  if (stageName) {
    const n = stageName.toLowerCase();
    if (n.includes("reject")) return "rejected";
    if (n.includes("hired") || n.includes("offer")) return "offer";
    if (n.includes("interview")) return "interview";
    if (n.includes("shortlist")) return "shortlisted";
    if (n.includes("screen")) return "screened";
    if (n.includes("applied")) return "applied";
  }

  return referrerStageFromApplicationStatus(applicationStatus);
}

type ReferrerRow = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  whatsapp_number: string | null;
  work_email: string | null;
  linkedin_url: string | null;
  verified_org_id: string | null;
  org_verified: boolean;
};

async function leaderboardForOrg(
  admin: SupabaseClient,
  organisationId: string,
  currentReferrerId: string,
): Promise<
  {
    rank: number;
    referrer_id: string;
    name: string;
    city: string;
    total_paid: number;
    is_current: boolean;
  }[]
> {
  const { data: orgJobs, error: jErr } = await admin
    .from("jobs")
    .select("id")
    .eq("organisation_id", organisationId);
  if (jErr || !orgJobs?.length) return [];

  const orgJobIds = [...new Set(orgJobs.map((j) => j.id as string))];
  const { data: orgLinks, error: lErr } = await admin
    .from("referral_links")
    .select("referrer_id")
    .in("job_id", orgJobIds);
  if (lErr || !orgLinks?.length) return [];

  const refSet = new Set((orgLinks as { referrer_id: string }[]).map((x) => x.referrer_id));
  const { data: paidRows } = await admin
    .from("payout_ledger")
    .select("referrer_id, amount")
    .eq("status", "paid")
    .limit(20_000);

  const sums = new Map<string, number>();
  for (const row of paidRows ?? []) {
    const rid = row.referrer_id as string;
    if (!refSet.has(rid)) continue;
    const amt = Number((row as { amount: unknown }).amount ?? 0);
    if (!Number.isFinite(amt)) continue;
    sums.set(rid, (sums.get(rid) ?? 0) + amt);
  }

  const sorted = [...sums.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const ids = sorted.map(([id]) => id);
  if (ids.length === 0) return [];

  const { data: refMeta } = await admin.from("referrers").select("id, name, city").in("id", ids);
  const metaById = new Map((refMeta ?? []).map((r) => [r.id as string, r]));

  return sorted.map(([id, total], i) => {
    const m = metaById.get(id);
    const full = (m?.name ?? "").trim() || "Referrer";
    const parts = full.split(/\s+/).filter(Boolean);
    const first = parts[0] ?? "Referrer";
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    const initial = last ? `${last.charAt(0).toUpperCase()}.` : "";
    const displayName = last ? `${first} ${initial}` : first;
    return {
      rank: i + 1,
      referrer_id: id,
      name: displayName,
      city: (m?.city ?? "").trim(),
      total_paid: total,
      is_current: id === currentReferrerId,
    };
  });
}

/**
 * Total of all `paid` payout_ledger amounts (the global referral pool), computed
 * in the DB rather than streaming every paid row into memory to reduce in JS.
 */
async function paidPoolTotalInr(admin: SupabaseClient): Promise<number> {
  // Fast path: push SUM(amount) into Postgres via the PostgREST aggregate.
  const { data: agg, error: aggError } = await admin
    .from("payout_ledger")
    .select("total:amount.sum()")
    .eq("status", "paid")
    .maybeSingle();

  if (!aggError && agg) {
    const total = Number((agg as { total: unknown }).total ?? 0);
    if (Number.isFinite(total)) return total;
  }

  // Fallback: aggregate unsupported. Page in 1k windows, summing as we go, with a
  // hard cap so this can never become an unbounded full-table scan.
  const PAGE = 1_000;
  const HARD_CAP = 50_000;
  let total = 0;
  for (let offset = 0; offset < HARD_CAP; offset += PAGE) {
    const { data: rows, error } = await admin
      .from("payout_ledger")
      .select("amount")
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error || !rows?.length) break;
    for (const r of rows) {
      const n = Number((r as { amount: unknown }).amount ?? 0);
      if (Number.isFinite(n)) total += n;
    }
    if (rows.length < PAGE) break;
  }
  return total;
}

async function resolveReferrerIdForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  // Resolve strictly by the authenticated user_id. Never fall back to matching
  // a referrer by the caller-controlled candidates.phone → referrers.whatsapp_number:
  // a candidate can set their phone to a victim's WhatsApp number and read the
  // victim's referrer dashboard. Linking a WhatsApp-created referrer to a user
  // account happens only through OTP verification (POST /api/refer/otp/verify).
  const { data: byUser } = await admin
    .from("referrers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (byUser?.id as string | undefined) ?? null;
}

/**
 * GET /api/refer/dashboard/profile — referrer_session cookie.
 * Primary data loads in one Promise.all; leaderboard + link application counts follow (depend on link ids / org).
 * Payout rows include `pipeline_stage` from `applications.status` (see referrerStageFromApplicationStatus), refined by pipeline when present.
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createSupabaseAdmin();
  const referrerId = await resolveReferrerIdForUser(admin, ctx.userId);
  if (!referrerId) return NextResponse.json({ needs_setup: true });

  const [referrerRes, linksRes, payoutsRes, appsForRefRes, poolTotalInr] = await Promise.all([
    admin
      .from("referrers")
      .select(
        "id, name, type, city, whatsapp_number, work_email, linkedin_url, verified_org_id, org_verified",
      )
      .eq("id", referrerId)
      .maybeSingle(),
    admin
      .from("referral_links")
      .select(
        `
        id,
        token,
        job_id,
        expires_at,
        jobs (
          id,
          title,
          status,
          organisation_id,
          organisations!jobs_organisation_id_fkey ( name, slug ),
            job_referral_config ( direct_bonus_amount, parent_bonus_amount, bonus_currency )
        )
      `,
      )
      .eq("referrer_id", referrerId),
    admin
      .from("payout_ledger")
      .select(
        `
        id,
        amount,
        currency,
        status,
        trigger_event,
        created_at,
        candidate_id,
        candidates ( full_name, name )
      `,
      )
      .eq("referrer_id", referrerId)
      .order("created_at", { ascending: false }),
    admin
      .from("applications")
      .select(
        `
        candidate_id,
        job_id,
        status,
        created_at,
        jobs ( title )
      `,
      )
      .eq("direct_referrer_id", referrerId),
    paidPoolTotalInr(admin),
  ]);

  if (referrerRes.error || !referrerRes.data) {
    logger.warn("refer/dashboard/profile: referrer missing", {
      referrerId,
      message: referrerRes.error?.message,
    });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (linksRes.error) {
    logger.warn("refer/dashboard/profile: links failed", { message: linksRes.error.message });
  }

  const referrer = referrerRes.data as ReferrerRow;
  let verifiedOrgName: string | null = null;
  if (referrer.verified_org_id) {
    const { data: verifiedOrg } = await admin
      .from("organisations")
      .select("name")
      .eq("id", referrer.verified_org_id)
      .maybeSingle();
    verifiedOrgName = (verifiedOrg?.name as string | undefined) ?? null;
  }

  const linkRows = (linksRes.data ?? []) as {
    id: string;
    token: string;
    job_id: string;
    expires_at: string | null;
    jobs: unknown;
  }[];

  const linkIds = linkRows.map((l) => l.id);

  const orgCount = new Map<string, number>();
  for (const row of linkRows) {
    const j = unwrapOne(row.jobs as { organisation_id?: string } | null);
    const oid = j?.organisation_id;
    if (oid) orgCount.set(oid, (orgCount.get(oid) ?? 0) + 1);
  }
  let dominantOrgId: string | null = null;
  let best = 0;
  for (const [oid, n] of orgCount) {
    if (n > best) {
      best = n;
      dominantOrgId = oid;
    }
  }
  if (!dominantOrgId && orgCount.size > 0) {
    dominantOrgId = [...orgCount.keys()][0] ?? null;
  }

  const appsRows = (appsForRefRes.data ?? []) as {
    candidate_id: string;
    job_id: string;
    status: string;
    created_at: string;
    jobs: { title: string | null } | { title: string | null }[] | null;
  }[];

  const jobTitleByCandJob = new Map<string, string>();
  for (const a of appsRows) {
    const j = unwrapOne(a.jobs);
    const title = j?.title?.trim() || "Role";
    jobTitleByCandJob.set(`${a.candidate_id}:${a.job_id}`, title);
  }

  type LatestApp = { jobId: string; title: string; status: string; created_at: string };
  const latestAppByCandidate = new Map<string, LatestApp>();
  for (const a of appsRows) {
    const title = jobTitleByCandJob.get(`${a.candidate_id}:${a.job_id}`) ?? "Role";
    const prev = latestAppByCandidate.get(a.candidate_id);
    const t = new Date(a.created_at).getTime();
    if (!prev || t > new Date(prev.created_at).getTime()) {
      latestAppByCandidate.set(a.candidate_id, {
        jobId: a.job_id,
        title,
        status: a.status,
        created_at: a.created_at,
      });
    }
  }

  const candIdsForPipeline = [...latestAppByCandidate.keys()];
  const jobIdsForPipeline = [...new Set([...latestAppByCandidate.values()].map((v) => v.jobId))];

  const pipelineMetaByPair = new Map<
    string,
    { stageName: string | undefined; pcStatus: string | undefined }
  >();
  if (candIdsForPipeline.length > 0 && jobIdsForPipeline.length > 0) {
    const { data: pcData, error: pcErr } = await admin
      .from("pipeline_candidates")
      .select(
        `
        candidate_id,
        job_id,
        status,
        pipeline_stages ( stage_name )
      `,
      )
      .in("candidate_id", candIdsForPipeline)
      .in("job_id", jobIdsForPipeline);
    if (pcErr) {
      logger.warn("refer/dashboard/profile: pipeline_candidates failed", {
        message: pcErr.message,
      });
    } else {
      for (const row of pcData ?? []) {
        const r = row as {
          candidate_id: string;
          job_id: string;
          status: string;
          pipeline_stages: { stage_name: string | null } | { stage_name: string | null }[] | null;
        };
        const ps = unwrapOne(r.pipeline_stages);
        const sn = ps?.stage_name?.trim() || undefined;
        pipelineMetaByPair.set(`${r.candidate_id}:${r.job_id}`, {
          stageName: sn,
          pcStatus: r.status,
        });
      }
    }
  }

  const payoutRowsRaw = (payoutsRes.data ?? []) as {
    id: string;
    amount: number | null;
    currency: string;
    status: string;
    trigger_event: string;
    created_at: string;
    candidate_id: string;
    candidates:
      | { full_name: string | null; name: string | null }
      | { full_name: string | null; name: string | null }[]
      | null;
  }[];

  let pendingSum = 0;
  let paidSum = 0;
  const payoutsOut = payoutRowsRaw.map((p) => {
    const amt = Number(p.amount ?? 0);
    if (Number.isFinite(amt)) {
      if (p.status === "pending" || p.status === "confirmed") pendingSum += amt;
      if (p.status === "paid") paidSum += amt;
    }
    const cand = unwrapOne(p.candidates);
    const candName = (cand?.full_name ?? cand?.name ?? "Candidate").trim() || "Candidate";
    const latestApp = latestAppByCandidate.get(p.candidate_id);
    const jobTitle = latestApp?.title ?? "—";
    const pairKey = latestApp ? `${p.candidate_id}:${latestApp.jobId}` : "";
    const pipe = pairKey ? pipelineMetaByPair.get(pairKey) : undefined;
    const pipeline_stage = normalizeReferrerPipelineStage(
      pipe?.stageName,
      pipe?.pcStatus,
      latestApp?.status ?? "applied",
    );
    return {
      id: p.id,
      candidate_name: candName,
      job_title: jobTitle,
      trigger_event: p.trigger_event,
      amount: amt,
      currency: p.currency || "INR",
      status: p.status,
      created_at: p.created_at,
      /** From applications.status via referrerStageFromApplicationStatus, refined by pipeline_candidates + pipeline_stages when present. */
      pipeline_stage,
      applied_at: latestApp?.created_at ?? null,
    };
  });

  const [appCountRes, leaderboard] = await Promise.all([
    linkIds.length > 0
      ? admin.from("applications").select("referral_link_id").in("referral_link_id", linkIds)
      : Promise.resolve({ data: [] as { referral_link_id: string | null }[] }),
    dominantOrgId ? leaderboardForOrg(admin, dominantOrgId, referrerId) : Promise.resolve([]),
  ]);

  const appliedByLink = new Map<string, number>();
  for (const r of appCountRes.data ?? []) {
    const id = r.referral_link_id as string | null;
    if (!id) continue;
    appliedByLink.set(id, (appliedByLink.get(id) ?? 0) + 1);
  }

  const base = appOrigin(request);
  const myLinks = linkRows.map((row) => {
    const j = unwrapOne(
      row.jobs as {
        title?: string;
        status?: string;
        organisations?: { slug?: string } | { slug?: string }[] | null;
        job_referral_config?: {
          direct_bonus_amount?: number | string;
          bonus_currency?: string | null;
        } | null;
      } | null,
    );
    const org = unwrapOne(j?.organisations as { slug?: string; name?: string } | null);
    const slug = org?.slug?.trim() ?? "";
    const company_name = (org?.name ?? "").trim() || "Company";
    const cfg = unwrapOne(
      j?.job_referral_config as {
        direct_bonus_amount?: number | string;
        parent_bonus_amount?: number | string;
        bonus_currency?: string | null;
      } | null,
    );
    const directBonusRaw = cfg?.direct_bonus_amount;
    const directBonus =
      directBonusRaw === undefined || directBonusRaw === null
        ? 0
        : typeof directBonusRaw === "string"
          ? Number(directBonusRaw)
          : directBonusRaw;
    const parentBonusRaw = cfg?.parent_bonus_amount;
    const parentBonus =
      parentBonusRaw === undefined || parentBonusRaw === null
        ? 0
        : typeof parentBonusRaw === "string"
          ? Number(parentBonusRaw)
          : parentBonusRaw;
    const direct_bonus_amount = Number.isFinite(directBonus) ? directBonus : 0;
    const parent_bonus_amount = Number.isFinite(parentBonus) ? parentBonus : 0;
    const bonus_currency =
      typeof cfg?.bonus_currency === "string" && cfg.bonus_currency.trim()
        ? cfg.bonus_currency.trim()
        : "INR";
    const jobTitle = j?.title?.trim() || "Role";
    const tok = encodeURIComponent(row.token);
    const jid = encodeURIComponent(row.job_id);
    const apply_url = slug
      ? `${base}/apply/${encodeURIComponent(slug)}?job=${jid}&ref=${tok}`
      : `${base}/apply?job=${jid}&ref=${tok}`;
    return {
      link_id: row.id,
      job_id: row.job_id,
      job_title: jobTitle,
      job_status: (j?.status as string | undefined) ?? "unknown",
      company_name,
      token: row.token,
      apply_url,
      expires_at: row.expires_at ?? null,
      direct_bonus_amount,
      parent_bonus_amount,
      bonus_currency,
      applied_count: appliedByLink.get(row.id) ?? 0,
    };
  });

  const phoneNorm = normalizeReferrerWhatsapp((referrer.whatsapp_number ?? "") as string);
  const candidateApplications: {
    id: string;
    status: string;
    created_at: string;
    job_title: string;
    company_name: string;
    fit_score: number | null;
  }[] = [];

  if (phoneNorm.length >= 8) {
    const { data: candNorm } = await admin
      .from("candidates")
      .select("id")
      .eq("phone", phoneNorm)
      .limit(1);
    let candId = (candNorm?.[0]?.id as string | undefined) ?? null;
    if (!candId) {
      const { data: candPlus } = await admin
        .from("candidates")
        .select("id")
        .eq("phone", `+${phoneNorm}`)
        .limit(1);
      candId = (candPlus?.[0]?.id as string | undefined) ?? null;
    }
    if (candId) {
      const { data: candApps, error: candAppsErr } = await admin
        .from("applications")
        .select(
          `
          id,
          status,
          created_at,
          jobs (
            title,
            organisations!jobs_organisation_id_fkey ( name )
          ),
          fit_scores ( overall_score )
        `,
        )
        .eq("candidate_id", candId)
        .order("created_at", { ascending: false });
      if (candAppsErr) {
        logger.warn("refer/dashboard/profile: candidate applications failed", {
          message: candAppsErr.message,
        });
      } else {
        for (const row of candApps ?? []) {
          const r = row as {
            id: string;
            status: string;
            created_at: string;
            jobs: unknown;
            fit_scores: unknown;
          };
          const job = unwrapOne(
            r.jobs as { title?: string | null; organisations?: unknown } | null,
          );
          const org = unwrapOne(job?.organisations as { name?: string | null } | null);
          candidateApplications.push({
            id: r.id,
            status: r.status,
            created_at: r.created_at,
            job_title: job?.title?.trim() || "Role",
            company_name: org?.name?.trim() || "",
            fit_score: unwrapFitScore(r.fit_scores),
          });
        }
      }
    }
  }

  const employeeWhatsappReferrals: {
    id: string;
    candidate_name: string;
    candidate_phone: string;
    status: string;
    created_at: string;
    referral_bonus_eligible: boolean;
    referral_bonus_paid_at: string | null;
    job_title: string | null;
  }[] = [];

  if (hasRole(ctx, "employee")) {
    const { data: erData, error: erErr } = await admin
      .from("employee_referrals")
      .select(
        `
        id,
        candidate_name,
        candidate_phone,
        status,
        created_at,
        referral_bonus_eligible,
        referral_bonus_paid_at,
        jobs ( title )
      `,
      )
      .eq("referrer_id", ctx.userId)
      .order("created_at", { ascending: false });
    if (erErr) {
      logger.warn("refer/dashboard/profile: employee_referrals failed", {
        message: erErr.message,
      });
    } else {
      for (const row of erData ?? []) {
        const r = row as {
          id: string;
          candidate_name: string;
          candidate_phone: string;
          status: string;
          created_at: string;
          referral_bonus_eligible: boolean;
          referral_bonus_paid_at: string | null;
          jobs: { title: string | null } | { title: string | null }[] | null;
        };
        const j = unwrapOne(r.jobs);
        employeeWhatsappReferrals.push({
          id: r.id,
          candidate_name: r.candidate_name,
          candidate_phone: r.candidate_phone,
          status: r.status,
          created_at: r.created_at,
          referral_bonus_eligible: Boolean(r.referral_bonus_eligible),
          referral_bonus_paid_at: r.referral_bonus_paid_at,
          job_title: j?.title?.trim() ?? null,
        });
      }
    }
  }

  return NextResponse.json({
    referrer: {
      id: referrer.id,
      name: referrer.name,
      type: referrer.type,
      city: referrer.city,
      whatsapp_number: referrer.whatsapp_number,
      work_email: referrer.work_email,
      linkedin_url: referrer.linkedin_url,
      verified_org_id: referrer.verified_org_id,
      verified_org_name: verifiedOrgName,
      org_verified: Boolean(referrer.org_verified),
    },
    earnings: {
      pending_inr: pendingSum,
      paid_inr: paidSum,
    },
    payouts: payoutsOut,
    links: myLinks,
    leaderboard,
    pool: {
      total_paid_inr: poolTotalInr,
    },
    candidate_applications: candidateApplications,
    employee_whatsapp_referrals: employeeWhatsappReferrals,
  });
}
