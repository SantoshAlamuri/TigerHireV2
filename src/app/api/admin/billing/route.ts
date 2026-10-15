import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { jsonError, jsonSuccess, handleApiError } from "@/lib/api-helpers";
import { requirePlatformAdmin } from "@/lib/security/platform-admin";
import { logger } from "@/lib/observability/logger";
import {
  getRangeFromDays,
  getUtcMonthKeyFromIso,
  getUtcMonthStartIso,
  listRecentUtcMonthKeys,
} from "@/lib/costs/query";
import { fetchAllSupabasePages } from "@/lib/analytics/fetch-paged";

const LLM_MONTH_HISTORY = 24;

type BillingSubRow = {
  organisation_id: string;
  status?: string | null;
  provider?: string | null;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  stripe_subscription_id?: string | null;
};

function isMissingColumnError(message: string): boolean {
  return /column .* does not exist|Could not find/i.test(message);
}

function normalizeAgencyClientRow(row: Record<string, unknown>) {
  return {
    agency_organisation_id: String(row.agency_organisation_id ?? ""),
    client_organisation_id: String(row.client_organisation_id ?? ""),
    is_active: row.is_active as boolean | null | undefined,
  };
}

async function fetchAgencyClientLinks(admin: SupabaseClient): Promise<
  Array<{
    agency_organisation_id: string;
    client_organisation_id: string;
    is_active?: boolean | null;
  }>
> {
  const full = await admin
    .from("agency_clients")
    .select("agency_organisation_id, client_organisation_id, is_active");
  if (!full.error) {
    return (full.data ?? [])
      .map((row) => normalizeAgencyClientRow(row as Record<string, unknown>))
      .filter((r) => r.agency_organisation_id && r.client_organisation_id);
  }

  const msg = full.error.message ?? "";
  if (!isMissingColumnError(msg)) {
    logger.warn("GET /api/admin/billing: agency_clients query failed", { message: msg });
    return [];
  }
  const legacy = await admin
    .from("agency_clients")
    .select("agency_organisation_id, client_organisation_id");
  if (legacy.error) {
    logger.warn("GET /api/admin/billing: agency_clients legacy select failed", {
      message: legacy.error.message ?? "",
    });
    return [];
  }
  return (legacy.data ?? [])
    .map((row) => normalizeAgencyClientRow(row as Record<string, unknown>))
    .filter((r) => r.agency_organisation_id && r.client_organisation_id);
}

type MainCostCategory = "llm" | "whatsapp" | "bolna_voice";

const VOICE_SCREENING_METER_ID = "voice_screening_session";

function classifyMainCostRow(row: {
  provider?: string | null;
  service?: string | null;
  metadata?: unknown;
}): MainCostCategory | null {
  const provider = String(row.provider ?? "").toLowerCase();
  const service = String(row.service ?? "").toLowerCase();
  if (provider === "anthropic") return "llm";
  if (provider === "meta") {
    // WhatsApp Cloud COGS only — never infer from Bolna/voice; require explicit whatsapp service label.
    if (service.includes("whatsapp")) return "whatsapp";
    return null;
  }
  if (provider === "bolna") return "bolna_voice";
  if (provider === "tigerhire") {
    const meta = row.metadata as Record<string, unknown> | null | undefined;
    if (String(meta?.meter_id ?? "") === VOICE_SCREENING_METER_ID) return "bolna_voice";
  }
  return null;
}

type MainCostBucket = {
  ledger30dByOrg: Map<string, number>;
  ledgerByOrgMonth: Map<string, Map<string, number>>;
  agencyFromClients30dByOrg: Map<string, number>;
  agencyFromClientsByOrgMonth: Map<string, Map<string, number>>;
};

function createMainCostBucket(): MainCostBucket {
  return {
    ledger30dByOrg: new Map(),
    ledgerByOrgMonth: new Map(),
    agencyFromClients30dByOrg: new Map(),
    agencyFromClientsByOrgMonth: new Map(),
  };
}

function bumpOrgAmount(map: Map<string, number>, orgId: string, delta: number) {
  map.set(orgId, (map.get(orgId) ?? 0) + delta);
}

function bumpOrgMonth(
  outer: Map<string, Map<string, number>>,
  orgId: string,
  monthKey: string,
  delta: number,
) {
  if (!outer.has(orgId)) outer.set(orgId, new Map());
  const inner = outer.get(orgId)!;
  inner.set(monthKey, (inner.get(monthKey) ?? 0) + delta);
}

const BILLING_ORG_TYPES = ["company", "agency"] as const;

async function fetchBillingOrganisations(admin: SupabaseClient) {
  const full = await admin
    .from("organisations")
    .select("id, name, slug, type, company_plan, stripe_customer_id, created_at")
    .in("type", [...BILLING_ORG_TYPES])
    .order("created_at", { ascending: false });
  if (!full.error) return full;

  const msg = full.error.message ?? "";
  if (!isMissingColumnError(msg)) return full;

  logger.warn("GET /api/admin/billing: organisations select fell back (missing column)", {
    message: msg,
  });
  return admin
    .from("organisations")
    .select("id, name, slug, type, company_plan, created_at")
    .in("type", [...BILLING_ORG_TYPES])
    .order("created_at", { ascending: false });
}

async function fetchSubscriptionsBilling(admin: SupabaseClient): Promise<{
  data: BillingSubRow[] | null;
  error: { message: string } | null;
}> {
  const full = await admin
    .from("subscriptions")
    .select(
      "id, organisation_id, company_plan, status, provider, provider_customer_id, provider_subscription_id, stripe_subscription_id, created_at",
    )
    .not("organisation_id", "is", null);

  if (!full.error) {
    return { data: (full.data ?? []) as BillingSubRow[], error: null };
  }

  const msg = full.error.message ?? "";
  if (!isMissingColumnError(msg)) {
    logger.error("GET /api/admin/billing: subscriptions query failed", { message: msg });
    return { data: null, error: full.error };
  }

  logger.warn("GET /api/admin/billing: subscriptions extended select fell back to legacy columns", {
    message: msg,
  });

  const legacy = await admin
    .from("subscriptions")
    .select("id, organisation_id, company_plan, status, stripe_subscription_id, created_at")
    .not("organisation_id", "is", null);

  if (legacy.error) {
    logger.error("GET /api/admin/billing: subscriptions legacy select failed", {
      message: legacy.error.message ?? "",
    });
    return { data: null, error: legacy.error };
  }

  const padded = (legacy.data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    provider: "stripe",
    provider_customer_id: null as string | null,
    provider_subscription_id: null as string | null,
  })) as BillingSubRow[];

  return { data: padded, error: null };
}

/**
 * GET /api/admin/billing — company + agency orgs: subscriptions, wallets, and main COGS
 * (LLM / Anthropic, WhatsApp / Meta, Bolna voice) from platform_cost_events with agency_client rollups.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;

    const supabase = createSupabaseAdmin();

    const { data: orgs, error: orgsError } = await fetchBillingOrganisations(supabase);
    if (orgsError) {
      logger.error("GET /api/admin/billing: organisations failed", {
        message: orgsError.message ?? "",
      });
      return jsonError("Failed to fetch organisations", 500);
    }

    const { data: subs, error: subsError } = await fetchSubscriptionsBilling(supabase);
    if (subsError || subs == null) {
      return jsonError("Failed to fetch subscriptions", 500);
    }

    const { data: billingProfiles } = await supabase
      .from("organisation_billing_profiles")
      .select(
        "organisation_id, billing_mode, customer_type, unlock_credits_monthly, job_credits_monthly, allow_negative_balance",
      );
    const { data: wallets } = await supabase
      .from("organisation_credit_wallets")
      .select("organisation_id, unlock_balance, job_balance");

    const subByOrgId = new Map<string, BillingSubRow>(
      subs.map((s) => [s.organisation_id as string, s]),
    );
    const profileByOrgId = new Map(
      (billingProfiles ?? []).map((row) => [row.organisation_id as string, row]),
    );
    const walletByOrgId = new Map(
      (wallets ?? []).map((row) => [row.organisation_id as string, row]),
    );

    const agencyClientRows = await fetchAgencyClientLinks(supabase);
    const clientOrgToAgencyIds = new Map<string, string[]>();
    for (const link of agencyClientRows) {
      const active = link.is_active;
      if (active === false) continue;
      const clientId = link.client_organisation_id;
      const agencyId = link.agency_organisation_id;
      if (!clientId || !agencyId || clientId === agencyId) continue;
      const list = clientOrgToAgencyIds.get(clientId) ?? [];
      list.push(agencyId);
      clientOrgToAgencyIds.set(clientId, list);
    }

    const spendRange30 = getRangeFromDays("30");
    const llmReportMonths = listRecentUtcMonthKeys(LLM_MONTH_HISTORY);
    const oldestMonthKey = llmReportMonths[llmReportMonths.length - 1] ?? llmReportMonths[0];
    const ledgerFromIso = oldestMonthKey
      ? getUtcMonthStartIso(oldestMonthKey)
      : spendRange30.fromIso;
    const mainCosts: Record<MainCostCategory, MainCostBucket> = {
      llm: createMainCostBucket(),
      whatsapp: createMainCostBucket(),
      bolna_voice: createMainCostBucket(),
    };
    const t30From = new Date(spendRange30.fromIso).getTime();
    const t30To = new Date(spendRange30.toIso).getTime();

    const unassigned30d: Record<MainCostCategory, number> = {
      llm: 0,
      whatsapp: 0,
      bolna_voice: 0,
    };
    const unassignedByMonth: Record<MainCostCategory, Map<string, number>> = {
      llm: new Map(),
      whatsapp: new Map(),
      bolna_voice: new Map(),
    };

    const { data: costAggRows, error: costAggError } = await fetchAllSupabasePages((from, to) =>
      supabase
        .from("platform_cost_events")
        .select("organisation_id, amount_usd, occurred_at, provider, service, metadata")
        .in("provider", ["anthropic", "meta", "bolna", "tigerhire"])
        .gte("occurred_at", ledgerFromIso)
        .order("occurred_at", { ascending: true })
        .range(from, to),
    );
    if (costAggError) {
      logger.warn("GET /api/admin/billing: platform_cost_events aggregate skipped", {
        message: String(costAggError),
      });
    } else {
      for (const row of costAggRows) {
        const amt = Number((row as { amount_usd?: unknown }).amount_usd ?? 0);
        if (!Number.isFinite(amt)) continue;
        const category = classifyMainCostRow(row as Record<string, unknown>);
        if (!category) continue;
        const occurredAt = (row as { occurred_at?: string }).occurred_at;
        if (!occurredAt) continue;
        const t = new Date(occurredAt).getTime();
        if (Number.isNaN(t)) continue;
        const monthKey = getUtcMonthKeyFromIso(occurredAt);
        const oid = row.organisation_id as string | null;

        if (!oid) {
          if (t >= t30From && t < t30To) {
            unassigned30d[category] += amt;
          }
          const uMap = unassignedByMonth[category];
          uMap.set(monthKey, (uMap.get(monthKey) ?? 0) + amt);
          continue;
        }

        const bucket = mainCosts[category];
        if (t >= t30From && t < t30To) {
          bumpOrgAmount(bucket.ledger30dByOrg, oid, amt);
        }
        bumpOrgMonth(bucket.ledgerByOrgMonth, oid, monthKey, amt);
        const linkedAgencies = clientOrgToAgencyIds.get(oid);
        if (linkedAgencies?.length) {
          const share = amt / linkedAgencies.length;
          for (const agencyId of linkedAgencies) {
            if (agencyId === oid) continue;
            if (t >= t30From && t < t30To) {
              bumpOrgAmount(bucket.agencyFromClients30dByOrg, agencyId, share);
            }
            bumpOrgMonth(bucket.agencyFromClientsByOrgMonth, agencyId, monthKey, share);
          }
        }
      }
    }

    const buildUnassignedMonthSeries = (cat: MainCostCategory) => {
      const inner = unassignedByMonth[cat];
      const series: { month: string; amount_usd: number }[] = [];
      for (const mk of llmReportMonths) {
        const raw = inner.get(mk) ?? 0;
        if (raw <= 0) continue;
        series.push({ month: mk, amount_usd: Number(raw.toFixed(6)) });
      }
      return series.sort((a, b) => b.month.localeCompare(a.month));
    };

    const buildMonthSeries = (orgId: string, isAgency: boolean, bucket: MainCostBucket) => {
      const ledgerInner = bucket.ledgerByOrgMonth.get(orgId);
      const fromClientsInner = isAgency ? bucket.agencyFromClientsByOrgMonth.get(orgId) : undefined;
      const series: { month: string; amount_usd: number }[] = [];
      for (const mk of llmReportMonths) {
        let raw = ledgerInner?.get(mk) ?? 0;
        if (isAgency) raw += fromClientsInner?.get(mk) ?? 0;
        if (raw <= 0) continue;
        series.push({ month: mk, amount_usd: Number(raw.toFixed(6)) });
      }
      return series.sort((a, b) => b.month.localeCompare(a.month));
    };

    const merged30d = (bucket: MainCostBucket, orgId: string, isAgency: boolean) => {
      const direct = bucket.ledger30dByOrg.get(orgId) ?? 0;
      const fromClients = isAgency ? (bucket.agencyFromClients30dByOrg.get(orgId) ?? 0) : 0;
      return isAgency ? direct + fromClients : direct;
    };

    const rows = (orgs ?? []).map((org: Record<string, unknown>) => {
      const orgId = org.id as string;
      const sub = subByOrgId.get(orgId);
      const profile = profileByOrgId.get(orgId);
      const wallet = walletByOrgId.get(orgId);
      const stripeCustomerId = (org.stripe_customer_id as string | null | undefined) ?? null;
      const isAgency = (org.type as string) === "agency";
      const llmBucket = mainCosts.llm;
      const directLlm30 = llmBucket.ledger30dByOrg.get(orgId) ?? 0;
      const fromClientsLlm30 = isAgency ? (llmBucket.agencyFromClients30dByOrg.get(orgId) ?? 0) : 0;
      const anthropic30Total = merged30d(llmBucket, orgId, isAgency);
      const whatsapp30Total = merged30d(mainCosts.whatsapp, orgId, isAgency);
      const bolnaVoice30Total = merged30d(mainCosts.bolna_voice, orgId, isAgency);
      return {
        id: orgId,
        name: org.name as string,
        slug: org.slug as string | null,
        organisation_type: isAgency ? "agency" : "company",
        company_plan: (org.company_plan as string | null) ?? "starter",
        subscription_status: sub?.status ?? null,
        stripe_customer_id: stripeCustomerId,
        billing_customer_id: sub?.provider_customer_id || stripeCustomerId || null,
        provider: sub?.provider === "razorpay" ? "razorpay" : "stripe",
        provider_subscription_id: sub?.provider_subscription_id ?? null,
        stripe_subscription_id: sub?.stripe_subscription_id ?? null,
        billing_mode: (profile?.billing_mode as string) ?? "automated",
        customer_type: (profile?.customer_type as string) ?? "standard",
        unlock_balance: Number((wallet as { unlock_balance?: number })?.unlock_balance ?? 0),
        job_balance: Number((wallet as { job_balance?: number })?.job_balance ?? 0),
        created_at: org.created_at as string,
        anthropic_spend_usd_30d: Number(anthropic30Total.toFixed(6)),
        anthropic_spend_usd_30d_ledger_direct: Number(directLlm30.toFixed(6)),
        anthropic_spend_usd_30d_from_linked_clients: Number(fromClientsLlm30.toFixed(6)),
        anthropic_spend_by_month: buildMonthSeries(orgId, isAgency, llmBucket),
        whatsapp_spend_usd_30d: Number(whatsapp30Total.toFixed(6)),
        whatsapp_spend_by_month: buildMonthSeries(orgId, isAgency, mainCosts.whatsapp),
        bolna_voice_spend_usd_30d: Number(bolnaVoice30Total.toFixed(6)),
        bolna_voice_spend_by_month: buildMonthSeries(orgId, isAgency, mainCosts.bolna_voice),
      };
    });

    const byPlan: Record<string, number> = {};
    rows.forEach((r) => {
      const p = r.company_plan ?? "starter";
      byPlan[p] = (byPlan[p] ?? 0) + 1;
    });

    const activeSubscriptions = subs.filter((s) => (s.status as string) === "active").length;

    return jsonSuccess({
      organisations: rows,
      totals: {
        totalOrgs: rows.length,
        activeSubscriptions,
        byPlan,
        llm_report_months: llmReportMonths,
        llm_ledger_from_iso: ledgerFromIso,
        llm_note:
          "These are our main variable costs from our internal ledger: AI (Anthropic), WhatsApp (Meta), and voice (Bolna / voice screening). Months are in UTC; the current month is still in progress. Each company or agency only shows spend we can tie to that customer; agencies also include a fair share from clients they are linked to. Anything we only receive as one vendor-level total—with no customer breakdown—appears under Not attributed. Every line is included so the totals stay complete.",
        main_costs_unassigned: {
          llm_usd_30d: Number(unassigned30d.llm.toFixed(6)),
          whatsapp_usd_30d: Number(unassigned30d.whatsapp.toFixed(6)),
          bolna_voice_usd_30d: Number(unassigned30d.bolna_voice.toFixed(6)),
          llm_by_month: buildUnassignedMonthSeries("llm"),
          whatsapp_by_month: buildUnassignedMonthSeries("whatsapp"),
          bolna_voice_by_month: buildUnassignedMonthSeries("bolna_voice"),
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch billing data", {
      route: "GET /api/admin/billing",
    });
  }
}
