import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureReferralToken } from "@/lib/referrers/referral-link-mint";

export type ReferralCampaignStatus = "draft" | "active" | "paused" | "ended";
export type ReferralCampaignObjective = "more_referrals" | "urgent_role_fill";
export type ReferralCampaignAudienceFilter = "all_referrers" | "org_verified_only" | "city_match";
export type ReferralCampaignRecipientStatus = "pending" | "queued" | "sent" | "failed" | "skipped";

export type ReferralCampaignEventType =
  | "launch_started"
  | "launch_completed"
  | "launch_scheduled"
  | "send_attempted"
  | "send_succeeded"
  | "send_failed"
  | "paused"
  | "resumed"
  | "ended"
  | "auto_ended"
  | "application_attributed"
  | "shortlisted_attributed"
  | "offer_attributed"
  | "hire_attributed";

type CampaignRow = {
  id: string;
  organisation_id: string;
  name: string;
  objective: ReferralCampaignObjective;
  audience_filter: ReferralCampaignAudienceFilter;
  status: ReferralCampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  launched_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignJobRow = {
  id: string;
  campaign_id: string;
  job_id: string;
  jobs: { title: string | null; status: string | null } | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function canManageReferralCampaigns(role: string): boolean {
  return role === "leadership" || role === "recruiter" || role === "super_admin";
}

export function assertCanManageReferralCampaigns(role: string): boolean {
  return canManageReferralCampaigns(role);
}

export async function getCampaignById(
  admin: SupabaseClient,
  campaignId: string,
  organisationId: string,
) {
  const { data, error } = await admin
    .from("referral_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (error) throw error;
  return (data as CampaignRow | null) ?? null;
}

export async function listCampaigns(
  admin: SupabaseClient,
  organisationId: string,
  pagination: { limit: number; offset: number },
) {
  const { limit, offset } = pagination;
  const { data, error, count } = await admin
    .from("referral_campaigns")
    .select("*", { count: "exact" })
    .eq("organisation_id", organisationId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const campaigns = ((data ?? []) as CampaignRow[]).map((row) => ({
    ...row,
  }));

  const ids = campaigns.map((row) => row.id);
  if (ids.length === 0) {
    return {
      campaigns: [] as Array<Record<string, unknown>>,
      pagination: {
        limit,
        offset,
        total: count ?? 0,
        hasMore: false,
      },
    };
  }

  const [{ data: jobs }, { data: recipients }] = await Promise.all([
    admin
      .from("referral_campaign_jobs")
      .select("campaign_id, job_id, jobs(title)")
      .in("campaign_id", ids),
    admin.from("referral_campaign_recipients").select("campaign_id, status").in("campaign_id", ids),
  ]);

  const jobsByCampaign = new Map<string, Array<{ job_id: string; job_title: string }>>();
  for (const row of jobs ?? []) {
    const rid = (row as { campaign_id: string }).campaign_id;
    const j = (row as { jobs?: { title?: string | null } | null }).jobs;
    const title = (j?.title ?? "Role").trim() || "Role";
    const arr = jobsByCampaign.get(rid) ?? [];
    arr.push({ job_id: (row as { job_id: string }).job_id, job_title: title });
    jobsByCampaign.set(rid, arr);
  }

  const recipientCounts = new Map<string, Record<string, number>>();
  for (const row of recipients ?? []) {
    const rid = (row as { campaign_id: string }).campaign_id;
    const status = (row as { status: string }).status;
    const prev = recipientCounts.get(rid) ?? {};
    prev[status] = (prev[status] ?? 0) + 1;
    recipientCounts.set(rid, prev);
  }

  const total = count ?? 0;
  return {
    campaigns: campaigns.map((row) => ({
      ...row,
      jobs: jobsByCampaign.get(row.id) ?? [],
      recipient_counts: recipientCounts.get(row.id) ?? {},
    })),
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + campaigns.length < total,
    },
  };
}

export async function replaceCampaignJobs(
  admin: SupabaseClient,
  campaignId: string,
  organisationId: string,
  jobIds: string[],
) {
  const uniqJobIds = [...new Set(jobIds)];
  const { data: jobs, error: jobsErr } = await admin
    .from("jobs")
    .select("id, organisation_id, title, status")
    .in("id", uniqJobIds)
    .eq("organisation_id", organisationId);
  if (jobsErr) throw jobsErr;
  if ((jobs ?? []).length !== uniqJobIds.length) {
    throw new Error("One or more jobs are invalid for this organisation.");
  }

  const { error: delErr } = await admin
    .from("referral_campaign_jobs")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("organisation_id", organisationId);
  if (delErr) throw delErr;

  const rows = uniqJobIds.map((jobId) => ({
    campaign_id: campaignId,
    organisation_id: organisationId,
    job_id: jobId,
  }));
  const { error: insErr } = await admin.from("referral_campaign_jobs").insert(rows);
  if (insErr) throw insErr;
}

export async function getCampaignDetail(
  admin: SupabaseClient,
  campaignId: string,
  organisationId: string,
) {
  const campaign = await getCampaignById(admin, campaignId, organisationId);
  if (!campaign) return null;

  const [{ data: jobs }, { data: recipients }, { data: recentEvents }] = await Promise.all([
    admin
      .from("referral_campaign_jobs")
      .select("id, campaign_id, job_id, jobs(title, status)")
      .eq("campaign_id", campaignId)
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: true }),
    admin
      .from("referral_campaign_recipients")
      .select("status, attempt_count, created_at, updated_at")
      .eq("campaign_id", campaignId)
      .eq("organisation_id", organisationId),
    admin
      .from("referral_campaign_events")
      .select("id, event_type, event_payload, created_at")
      .eq("campaign_id", campaignId)
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const recipientCounts: Record<string, number> = {};
  for (const row of recipients ?? []) {
    const status = (row as { status: string }).status;
    recipientCounts[status] = (recipientCounts[status] ?? 0) + 1;
  }

  return {
    campaign,
    jobs: (jobs ?? []).map((rawRow) => {
      const row = rawRow as {
        id: string;
        job_id: string;
        jobs?:
          | { title?: string | null; status?: string | null }
          | { title?: string | null; status?: string | null }[]
          | null;
      };
      const job = unwrapOne(row.jobs ?? null);
      return {
        id: row.id,
        job_id: row.job_id,
        job_title: (job?.title ?? "Role").trim() || "Role",
        job_status: (job?.status ?? "unknown").trim() || "unknown",
      };
    }),
    recipient_counts: recipientCounts,
    recent_events: recentEvents ?? [],
  };
}

async function filterReferrersWithRecentSuccess(
  admin: SupabaseClient,
  referrerIds: string[],
  jobIds: string[],
): Promise<Set<string>> {
  if (referrerIds.length === 0 || jobIds.length === 0) return new Set();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("applications")
    .select("direct_referrer_id")
    .in("direct_referrer_id", referrerIds)
    .in("job_id", jobIds)
    .in("status", ["shortlisted", "hired"])
    .gte("created_at", since);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((row) => (row as { direct_referrer_id: string | null }).direct_referrer_id)
      .filter((id): id is string => Boolean(id)),
  );
}

export async function upsertCampaignRecipients(
  admin: SupabaseClient,
  campaignId: string,
  organisationId: string,
  audienceFilter: ReferralCampaignAudienceFilter,
  objective: ReferralCampaignObjective = "more_referrals",
) {
  const { data: jobs, error: jobsErr } = await admin
    .from("referral_campaign_jobs")
    .select("job_id")
    .eq("campaign_id", campaignId)
    .eq("organisation_id", organisationId);
  if (jobsErr) throw jobsErr;

  const jobIds = [...new Set((jobs ?? []).map((row) => (row as { job_id: string }).job_id))];
  if (jobIds.length === 0) {
    return { inserted: 0, total: 0 };
  }

  const { data: linkRows, error: linkErr } = await admin
    .from("referral_links")
    .select("referrer_id")
    .in("job_id", jobIds);
  if (linkErr) throw linkErr;

  const referrerIds = [
    ...new Set((linkRows ?? []).map((row) => (row as { referrer_id: string }).referrer_id)),
  ];
  if (referrerIds.length === 0) {
    return { inserted: 0, total: 0 };
  }

  let refQuery = admin
    .from("referrers")
    .select("id")
    .in("id", referrerIds)
    .eq("status", "active")
    .eq("whatsapp_verified", true);

  if (audienceFilter === "org_verified_only") {
    refQuery = refQuery.eq("org_verified", true).eq("verified_org_id", organisationId);
  } else if (audienceFilter === "city_match") {
    // MVP: use city-match as "has a city set" guard.
    refQuery = refQuery.not("city", "is", null);
  }

  const { data: refs, error: refErr } = await refQuery;
  if (refErr) throw refErr;

  let eligibleRefs = (refs ?? []) as Array<{ id: string }>;
  if (objective === "urgent_role_fill" && eligibleRefs.length > 0) {
    const recentSuccess = await filterReferrersWithRecentSuccess(
      admin,
      eligibleRefs.map((r) => r.id),
      jobIds,
    );
    const narrowed = eligibleRefs.filter((r) => recentSuccess.has(r.id));
    if (narrowed.length > 0) eligibleRefs = narrowed;
  }

  const rows = eligibleRefs.map((row) => ({
    campaign_id: campaignId,
    organisation_id: organisationId,
    referrer_id: (row as { id: string }).id,
    status: "pending" as ReferralCampaignRecipientStatus,
  }));
  if (rows.length === 0) return { inserted: 0, total: 0 };

  const { error: upsertErr } = await admin
    .from("referral_campaign_recipients")
    .upsert(rows, { onConflict: "campaign_id,referrer_id" });
  if (upsertErr) throw upsertErr;

  const { count } = await admin
    .from("referral_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("organisation_id", organisationId);

  return { inserted: rows.length, total: count ?? rows.length };
}

export async function createCampaignEvent(
  admin: SupabaseClient,
  input: {
    campaignId: string;
    organisationId: string;
    eventType: ReferralCampaignEventType;
    eventPayload?: Record<string, unknown>;
    recipientId?: string | null;
    referrerId?: string | null;
    jobId?: string | null;
  },
) {
  const { error } = await admin.from("referral_campaign_events").insert({
    campaign_id: input.campaignId,
    organisation_id: input.organisationId,
    event_type: input.eventType,
    event_payload: input.eventPayload ?? {},
    recipient_id: input.recipientId ?? null,
    referrer_id: input.referrerId ?? null,
    job_id: input.jobId ?? null,
  });
  if (error) throw error;
}

export async function buildCampaignMetrics(
  admin: SupabaseClient,
  campaignId: string,
  organisationId: string,
) {
  const campaign = await getCampaignById(admin, campaignId, organisationId);
  if (!campaign) return null;

  const [{ data: recipients }, { data: jobRows }] = await Promise.all([
    admin
      .from("referral_campaign_recipients")
      .select("referrer_id, status")
      .eq("campaign_id", campaignId)
      .eq("organisation_id", organisationId),
    admin
      .from("referral_campaign_jobs")
      .select("job_id")
      .eq("campaign_id", campaignId)
      .eq("organisation_id", organisationId),
  ]);

  const sent = (recipients ?? []).filter((r) => (r as { status: string }).status === "sent").length;
  const failed = (recipients ?? []).filter(
    (r) => (r as { status: string }).status === "failed",
  ).length;
  const referrerIds = [
    ...new Set((recipients ?? []).map((r) => (r as { referrer_id: string }).referrer_id)),
  ];
  const jobIds = [...new Set((jobRows ?? []).map((r) => (r as { job_id: string }).job_id))];

  if (referrerIds.length === 0 || jobIds.length === 0) {
    return {
      campaign,
      metrics: {
        recipients_total: recipients?.length ?? 0,
        sent,
        failed,
        applications: 0,
        shortlisted: 0,
        offers: 0,
        hires: 0,
      },
    };
  }

  const fromTs = campaign.launched_at ?? campaign.starts_at ?? campaign.created_at;

  const { data: durableApps, error: durableErr } = await admin
    .from("applications")
    .select("id, status, created_at, direct_referrer_id, job_id, candidate_id")
    .eq("referral_campaign_id", campaignId);
  if (durableErr) throw durableErr;

  let appRows = (durableApps ?? []) as Array<{
    id: string;
    status: string;
    created_at?: string;
    candidate_id?: string | null;
    job_id?: string | null;
  }>;

  if (appRows.length === 0) {
    let appQuery = admin
      .from("applications")
      .select("id, status, created_at, direct_referrer_id, job_id, candidate_id")
      .in("direct_referrer_id", referrerIds)
      .in("job_id", jobIds);
    if (fromTs) appQuery = appQuery.gte("created_at", fromTs);
    if (campaign.ends_at) appQuery = appQuery.lte("created_at", campaign.ends_at);
    const { data: apps, error: appErr } = await appQuery;
    if (appErr) throw appErr;
    appRows = (apps ?? []) as typeof appRows;
  }

  const applications = appRows.length;
  const shortlisted = appRows.filter((r) => r.status === "shortlisted").length;
  const offers = appRows.filter((r) => r.status === "hired").length;
  const hires = appRows.filter((r) => r.status === "hired").length;

  const appRowsWithKeys = appRows;
  const pairs = appRowsWithKeys
    .map((row) => ({
      candidate_id: row.candidate_id ?? null,
      job_id: row.job_id ?? null,
    }))
    .filter(
      (row): row is { candidate_id: string; job_id: string } =>
        Boolean(row.candidate_id) && Boolean(row.job_id),
    );
  let referralQualityScore: number | null = null;
  if (pairs.length > 0) {
    const pairJobIds = [...new Set(pairs.map((row) => row.job_id))];
    const pairCandidateIds = [...new Set(pairs.map((row) => row.candidate_id))];
    const { data: fitScores } = await admin
      .from("fit_scores")
      .select("job_id, candidate_id, overall_score, is_test_run")
      .in("job_id", pairJobIds)
      .in("candidate_id", pairCandidateIds)
      .or("is_test_run.eq.false,is_test_run.is.null");
    const pairKeySet = new Set(pairs.map((row) => `${row.job_id}:${row.candidate_id}`));
    const scores = (fitScores ?? [])
      .filter((row) => pairKeySet.has(`${row.job_id as string}:${row.candidate_id as string}`))
      .map((row) => Number(row.overall_score))
      .filter((value) => Number.isFinite(value));
    if (scores.length > 0) {
      referralQualityScore = Math.round(
        scores.reduce((sum, value) => sum + value, 0) / scores.length,
      );
    }
  }

  return {
    campaign,
    metrics: {
      recipients_total: recipients?.length ?? 0,
      sent,
      failed,
      applications,
      shortlisted,
      offers,
      hires,
      referral_quality_score: referralQualityScore,
    },
  };
}

export type CampaignMessageContext = {
  jobs: Array<{
    jobId: string;
    jobTitle: string;
  }>;
  companyName: string;
  organisationSlug: string | null;
  objective: ReferralCampaignObjective;
};

export async function loadCampaignMessageContext(
  admin: SupabaseClient,
  campaignId: string,
  organisationId: string,
): Promise<CampaignMessageContext | null> {
  const { data: campaign, error: campErr } = await admin
    .from("referral_campaigns")
    .select("objective")
    .eq("id", campaignId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (campErr) throw campErr;
  if (!campaign) return null;

  const { data, error } = await admin
    .from("referral_campaign_jobs")
    .select("job_id, jobs(title, organisations!jobs_organisation_id_fkey(name, slug))")
    .eq("campaign_id", campaignId)
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!data?.length) return null;

  const jobs: CampaignMessageContext["jobs"] = [];
  let companyName = "Company";
  let organisationSlug: string | null = null;
  for (const rawRow of data) {
    const row = rawRow as {
      job_id: string;
      jobs?: Record<string, unknown> | Record<string, unknown>[] | null;
    };
    const jobRaw = unwrapOne(row.jobs ?? null);
    const orgRaw = unwrapOne(
      (jobRaw?.organisations as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null
        | undefined) ?? null,
    );
    if (orgRaw?.name) companyName = String(orgRaw.name).trim() || companyName;
    if (orgRaw?.slug) organisationSlug = String(orgRaw.slug).trim() || organisationSlug;
    jobs.push({
      jobId: row.job_id,
      jobTitle: ((jobRaw?.title as string | undefined) ?? "Open role").trim() || "Open role",
    });
  }

  return {
    jobs,
    companyName,
    organisationSlug,
    objective: (campaign.objective as ReferralCampaignObjective) ?? "more_referrals",
  };
}

/** @deprecated Use loadCampaignMessageContext — kept for single-job fallbacks. */
export async function pickCampaignMessageJob(
  admin: SupabaseClient,
  campaignId: string,
  organisationId: string,
) {
  const ctx = await loadCampaignMessageContext(admin, campaignId, organisationId);
  if (!ctx?.jobs[0]) return null;
  return {
    jobId: ctx.jobs[0].jobId,
    jobTitle: ctx.jobs[0].jobTitle,
    companyName: ctx.companyName,
    organisationSlug: ctx.organisationSlug,
  };
}

export function formatCampaignJobTitles(jobs: Array<{ jobTitle: string }>, max = 3): string {
  const titles = jobs.map((j) => j.jobTitle).filter(Boolean);
  if (titles.length === 0) return "open roles";
  if (titles.length <= max) return titles.join(", ");
  return `${titles.slice(0, max).join(", ")}, and more`;
}

export function buildCampaignHubPath(campaignId: string, refToken: string): string {
  return `/refer/campaign/${encodeURIComponent(campaignId)}?ref=${encodeURIComponent(refToken)}`;
}

export function buildCampaignHubUrl(campaignId: string, refToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://tigerhire.io";
  return `${baseUrl}${buildCampaignHubPath(campaignId, refToken)}`;
}

export async function resolveRecipientPhoneAndName(admin: SupabaseClient, referrerId: string) {
  const { data, error } = await admin
    .from("referrers")
    .select("id, name, whatsapp_number")
    .eq("id", referrerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const phone = ((data as { whatsapp_number?: string | null }).whatsapp_number ?? "").trim();
  if (!phone) return null;
  const name = ((data as { name?: string | null }).name ?? "Referrer").trim() || "Referrer";
  const first = name.split(/\s+/).filter(Boolean)[0] ?? "Referrer";
  return { phone, firstName: first };
}

export async function buildReferralLinkForCampaignSend(
  admin: SupabaseClient,
  referrerId: string,
  jobId: string,
  organisationSlug: string | null,
) {
  const out = await ensureReferralToken(admin, referrerId, jobId);
  if (!out.token) return null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://tigerhire.io";
  const applyPath = organisationSlug
    ? `/apply/${encodeURIComponent(organisationSlug)}?job=${encodeURIComponent(jobId)}&ref=${encodeURIComponent(out.token)}`
    : `/apply?job=${encodeURIComponent(jobId)}&ref=${encodeURIComponent(out.token)}`;
  return `${baseUrl}${applyPath}`;
}
