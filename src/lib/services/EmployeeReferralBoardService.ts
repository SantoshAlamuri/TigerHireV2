import type { SupabaseClient } from "@supabase/supabase-js";
import { filterReferrableOpenJobs } from "@/lib/jobs/filter-referrable-open-jobs";
import {
  applicationStatusToStage,
  employeeInviteStatusToStage,
  stageLabel,
  type ReferralStageKey,
} from "@/lib/referrals/employee-referral-stages";
import { resolveReferrerIdForUser } from "@/lib/referrers/resolve-referrer-id";

export type EmployeeReferralRow = {
  id: string;
  candidate_name: string;
  candidate_phone: string | null;
  job_id: string;
  job_title: string;
  channel: "whatsapp" | "link";
  stage_key: ReferralStageKey;
  stage_label: string;
  status_raw: string;
  referred_at: string;
  delivery_status: "sent" | "delivered" | "read" | "failed" | null;
  delivery_error: string | null;
  delivery_updated_at: string | null;
};

type DeliverySnapshot = {
  status: "sent" | "delivered" | "read" | "failed" | null;
  error: string | null;
  updatedAt: string | null;
};

type JobRow = {
  id: string;
  title: string;
  location: string | null;
  list_on_public_job_board: boolean | null;
  list_for_internal_referrals: boolean | null;
  organisations: { name: string; slug: string } | { name: string; slug: string }[] | null;
  job_referral_config:
    | {
        direct_bonus_amount: number | string;
        parent_bonus_amount: number | string;
        employee_bonus_amount?: number | string | null;
      }
    | {
        direct_bonus_amount: number | string;
        parent_bonus_amount: number | string;
        employee_bonus_amount?: number | string | null;
      }[]
    | null;
};

function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function parseBonus(raw: number | string | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return Number.isFinite(n) ? n : 0;
}

function buildApplyUrl(base: string, slug: string | null, jobId: string, token: string): string {
  const jid = encodeURIComponent(jobId);
  const tok = encodeURIComponent(token);
  return slug
    ? `${base}/apply/${encodeURIComponent(slug)}?job=${jid}&ref=${tok}`
    : `${base}/apply?job=${jid}&ref=${tok}`;
}

export const EmployeeReferralBoardService = {
  async getBoard(admin: SupabaseClient, userId: string, organisationId: string, appOrigin: string) {
    const referrerId = await resolveReferrerIdForUser(admin, userId);

    const { data: rawJobs, error: jobsErr } = await admin
      .from("jobs")
      .select(
        `
        id,
        title,
        location,
        list_on_public_job_board,
        list_for_internal_referrals,
        organisations!jobs_organisation_id_fkey ( name, slug ),
        job_referral_config ( direct_bonus_amount, parent_bonus_amount, employee_bonus_amount )
      `,
      )
      .eq("organisation_id", organisationId)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (jobsErr) throw jobsErr;

    let referrerOrgVerified = false;
    let referrerName: string | null = null;
    if (referrerId) {
      const { data: referrer } = await admin
        .from("referrers")
        .select("name, org_verified")
        .eq("id", referrerId)
        .maybeSingle();
      referrerName = (referrer?.name as string | undefined)?.trim() ?? null;
      referrerOrgVerified = Boolean(referrer?.org_verified);
    }

    const jobs = filterReferrableOpenJobs(rawJobs ?? []).map((row: JobRow) => {
      const org = unwrapOne(row.organisations);
      const cfg = unwrapOne(row.job_referral_config);
      const directBonus = parseBonus(cfg?.direct_bonus_amount);
      const employeeBonus = parseBonus(cfg?.employee_bonus_amount);
      const displayBonus = referrerOrgVerified && employeeBonus > 0 ? employeeBonus : directBonus;
      return {
        id: row.id,
        title: row.title,
        location: row.location,
        organisation_name: org?.name ?? "Your company",
        direct_bonus_amount: displayBonus,
        parent_bonus_amount: parseBonus(cfg?.parent_bonus_amount),
        link: null as {
          link_id: string;
          apply_url: string;
          created_at: string;
          expires_at: string | null;
          applied_count: number;
        } | null,
        whatsapp_invites: [] as {
          id: string;
          candidate_name: string;
          candidate_phone: string;
          status: string;
          created_at: string;
        }[],
      };
    });

    const { data: invites } = await admin
      .from("employee_referrals")
      .select("id, job_id, candidate_id, candidate_name, candidate_phone, status, created_at")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false });

    const inviteRows = invites ?? [];
    const deliveryByPhone = new Map<string, DeliverySnapshot>();
    const phoneDigitsList = Array.from(
      new Set(
        inviteRows
          .map((inv) => String(inv.candidate_phone ?? "").replace(/\D/g, ""))
          .filter((p) => p.length >= 8),
      ),
    );
    if (phoneDigitsList.length > 0) {
      const { data: outboundLogs } = await admin
        .from("whatsapp_message_log")
        .select("phone, delivery_status, delivery_error, delivery_updated_at, created_at")
        .eq("direction", "outbound")
        .in("phone", phoneDigitsList)
        .order("created_at", { ascending: false });
      for (const row of outboundLogs ?? []) {
        const phone = String(row.phone ?? "");
        if (deliveryByPhone.has(phone)) continue;
        deliveryByPhone.set(phone, {
          status: (row.delivery_status as "sent" | "delivered" | "read" | "failed" | null) ?? null,
          error: (row.delivery_error as string | null) ?? null,
          updatedAt: (row.delivery_updated_at as string | null) ?? null,
        });
      }
    }

    for (const inv of inviteRows) {
      const job = jobs.find((j) => j.id === inv.job_id);
      if (!job) continue;
      job.whatsapp_invites.push({
        id: inv.id as string,
        candidate_name: inv.candidate_name as string,
        candidate_phone: inv.candidate_phone as string,
        status: inv.status as string,
        created_at: inv.created_at as string,
      });
    }

    let earnings = { pending_inr: 0, paid_inr: 0 };

    if (referrerId) {
      const { data: links } = await admin
        .from("referral_links")
        .select(
          `
          id,
          job_id,
          token,
          created_at,
          expires_at,
          jobs ( organisations!jobs_organisation_id_fkey ( slug ) )
        `,
        )
        .eq("referrer_id", referrerId);

      const { data: apps } = await admin
        .from("applications")
        .select("referral_link_id")
        .eq("direct_referrer_id", referrerId);

      const appliedByLink = new Map<string, number>();
      for (const a of apps ?? []) {
        const lid = a.referral_link_id as string | null;
        if (!lid) continue;
        appliedByLink.set(lid, (appliedByLink.get(lid) ?? 0) + 1);
      }

      for (const row of links ?? []) {
        const job = jobs.find((j) => j.id === row.job_id);
        if (!job) continue;
        const linkJobRaw = (row as { jobs?: unknown }).jobs;
        const linkJob = unwrapOne(
          linkJobRaw as { organisations?: { slug: string } | { slug: string }[] | null } | null,
        );
        const slug = unwrapOne(linkJob?.organisations)?.slug ?? null;
        job.link = {
          link_id: row.id as string,
          apply_url: buildApplyUrl(appOrigin, slug, row.job_id as string, row.token as string),
          created_at: row.created_at as string,
          expires_at: (row.expires_at as string | null) ?? null,
          applied_count: appliedByLink.get(row.id as string) ?? 0,
        };
      }

      const { data: payouts } = await admin
        .from("payout_ledger")
        .select("amount, status")
        .eq("referrer_id", referrerId);

      for (const p of payouts ?? []) {
        const amt = Number(p.amount ?? 0);
        if (!Number.isFinite(amt)) continue;
        if (p.status === "paid") earnings.paid_inr += amt;
        else if (p.status === "pending") earnings.pending_inr += amt;
      }
    }

    const applicationStatusByCandidateJob = new Map<string, string>();
    if (referrerId) {
      const { data: linkAppsForStatus } = await admin
        .from("applications")
        .select("candidate_id, job_id, status")
        .eq("direct_referrer_id", referrerId);
      for (const row of linkAppsForStatus ?? []) {
        const cid = row.candidate_id as string;
        const jid = row.job_id as string;
        applicationStatusByCandidateJob.set(`${jid}:${cid}`, String(row.status));
      }
    }

    const referrals: EmployeeReferralRow[] = [];
    const coveredApplicationKeys = new Set<string>();

    for (const inv of inviteRows) {
      const job = jobs.find((j) => j.id === inv.job_id);
      const candidateId = (inv.candidate_id as string | null) ?? null;
      const appStatus =
        candidateId != null
          ? applicationStatusByCandidateJob.get(`${inv.job_id as string}:${candidateId}`)
          : undefined;
      const statusRaw = appStatus ?? String(inv.status);
      const stageKey = appStatus
        ? applicationStatusToStage(appStatus)
        : employeeInviteStatusToStage(String(inv.status));
      if (candidateId) {
        coveredApplicationKeys.add(`${inv.job_id as string}:${candidateId}`);
      }
      const phoneDigits = String(inv.candidate_phone ?? "").replace(/\D/g, "");
      const delivery = deliveryByPhone.get(phoneDigits) ?? null;
      referrals.push({
        id: `wa-${inv.id}`,
        candidate_name: inv.candidate_name as string,
        candidate_phone: inv.candidate_phone as string,
        job_id: inv.job_id as string,
        job_title: job?.title ?? "Role",
        channel: "whatsapp",
        stage_key: stageKey,
        stage_label: stageLabel(stageKey),
        status_raw: statusRaw,
        referred_at: inv.created_at as string,
        delivery_status: delivery?.status ?? null,
        delivery_error: delivery?.error ?? null,
        delivery_updated_at: delivery?.updatedAt ?? null,
      });
    }

    if (referrerId) {
      const { data: linkApps } = await admin
        .from("applications")
        .select(
          `
          id,
          candidate_id,
          status,
          created_at,
          job_id,
          jobs ( title ),
          candidates ( full_name, name, phone )
        `,
        )
        .eq("direct_referrer_id", referrerId)
        .order("created_at", { ascending: false });

      for (const app of linkApps ?? []) {
        const candidateId = app.candidate_id as string;
        const jobId = app.job_id as string;
        if (coveredApplicationKeys.has(`${jobId}:${candidateId}`)) continue;

        const job = unwrapOne(
          (app as { jobs: { title: string } | { title: string }[] | null }).jobs,
        );
        const cand = unwrapOne(
          (app as { candidates?: unknown }).candidates as
            | { full_name: string | null; name: string | null; phone: string | null }
            | { full_name: string | null; name: string | null; phone: string | null }[]
            | null,
        );
        const stageKey = applicationStatusToStage(String(app.status));
        const name = (cand?.full_name ?? cand?.name ?? "Candidate").trim() || "Candidate";
        referrals.push({
          id: `link-${app.id}`,
          candidate_name: name,
          candidate_phone: cand?.phone ?? null,
          delivery_status: null,
          delivery_error: null,
          delivery_updated_at: null,
          job_id: jobId,
          job_title: job?.title ?? "Role",
          channel: "link",
          stage_key: stageKey,
          stage_label: stageLabel(stageKey),
          status_raw: String(app.status),
          referred_at: app.created_at as string,
        });
      }
    }

    const hiredCount = referrals.filter((r) => r.stage_key === "offer").length;

    referrals.sort((a, b) => new Date(b.referred_at).getTime() - new Date(a.referred_at).getTime());

    const invitesSent = invites?.length ?? 0;
    const linksCreated = jobs.filter((j) => j.link).length;
    const inPipeline = referrals.filter(
      (r) => r.stage_key !== "offer" && r.stage_key !== "rejected",
    ).length;

    return {
      needs_setup: !referrerId,
      referrer_name: referrerName,
      earnings,
      hired_count: hiredCount,
      summary: {
        open_roles: jobs.length,
        links_created: linksCreated,
        invites_sent: invitesSent,
        in_pipeline: inPipeline,
      },
      jobs,
      referrals,
      app_public_origin: appOrigin.replace(/\/$/, ""),
    };
  },
};
