"use client";

import { useState } from "react";
import {
  CreditCard,
  Building2,
  TrendingUp,
  Search,
  Filter,
  SlidersHorizontal,
  Loader2,
  Save,
  Download,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/Toast";

interface BillingOrg {
  id: string;
  name: string;
  slug: string | null;
  organisation_type: "company" | "agency";
  company_plan: string;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  billing_customer_id: string | null;
  provider: "stripe" | "razorpay";
  provider_subscription_id: string | null;
  stripe_subscription_id: string | null;
  billing_mode: "automated" | "manual";
  customer_type: string;
  unlock_balance: number;
  job_balance: number;
  created_at: string;
  /** Sum of platform_cost_events (Anthropic) last 30d rolling (UTC window). */
  anthropic_spend_usd_30d: number;
  /** Ledger rows whose organisation_id is this org (hiring company or rare direct agency call). */
  anthropic_spend_usd_30d_ledger_direct: number;
  /** Agency only: share of client orgs' ledger spend via active agency_clients (split if multiple agencies per client). */
  anthropic_spend_usd_30d_from_linked_clients: number;
  /** Non-zero UTC calendar months (YYYY-MM) for the last 24 months from the ledger. */
  anthropic_spend_by_month: { month: string; amount_usd: number }[];
  /** Meta / WhatsApp Cloud (USD). */
  whatsapp_spend_usd_30d: number;
  whatsapp_spend_by_month: { month: string; amount_usd: number }[];
  /** Bolna provider or tigerhire voice_screening_session meter (USD). */
  bolna_voice_spend_usd_30d: number;
  bolna_voice_spend_by_month: { month: string; amount_usd: number }[];
}

interface MainCostsUnassignedTotals {
  llm_usd_30d: number;
  whatsapp_usd_30d: number;
  bolna_voice_usd_30d: number;
  llm_by_month: { month: string; amount_usd: number }[];
  whatsapp_by_month: { month: string; amount_usd: number }[];
  bolna_voice_by_month: { month: string; amount_usd: number }[];
}

interface BillingResponse {
  organisations: BillingOrg[];
  totals: {
    totalOrgs: number;
    activeSubscriptions: number;
    byPlan: Record<string, number>;
    llm_report_months: string[];
    llm_ledger_from_iso: string;
    llm_note: string;
    main_costs_unassigned?: MainCostsUnassignedTotals;
  };
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  free: "Free",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-zinc-500/15 text-zinc-400",
  starter: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  growth: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  scale: "bg-purple-500/15 text-purple-400",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  canceled: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  past_due: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
};

const ORG_TYPE_LABELS: Record<BillingOrg["organisation_type"], string> = {
  company: "Company",
  agency: "Agency",
};

const ORG_TYPE_COLORS: Record<BillingOrg["organisation_type"], string> = {
  company: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  agency: "bg-amber-500/15 text-amber-300",
};

function formatUsd4(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function currentUtcMonthKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function formatUtcMonthLabel(monthKey: string): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m0 = Number(ms) - 1;
  if (!Number.isFinite(y) || m0 < 0 || m0 > 11) return monthKey;
  return new Date(Date.UTC(y, m0, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

type MainCostKind = "llm" | "whatsapp" | "bolna_voice";

function unassignedMainCostForPeriod(
  u: MainCostsUnassignedTotals | undefined,
  period: "rolling_30d" | string,
  kind: MainCostKind,
): number {
  if (!u) return 0;
  if (period === "rolling_30d") {
    if (kind === "llm") return u.llm_usd_30d;
    if (kind === "whatsapp") return u.whatsapp_usd_30d;
    return u.bolna_voice_usd_30d;
  }
  const series =
    kind === "llm"
      ? u.llm_by_month
      : kind === "whatsapp"
        ? u.whatsapp_by_month
        : u.bolna_voice_by_month;
  return series.find((row) => row.month === period)?.amount_usd ?? 0;
}

function mainCostSpendForPeriod(
  org: BillingOrg,
  period: "rolling_30d" | string,
  kind: MainCostKind,
): number {
  if (period === "rolling_30d") {
    if (kind === "llm") return org.anthropic_spend_usd_30d;
    if (kind === "whatsapp") return org.whatsapp_spend_usd_30d;
    return org.bolna_voice_spend_usd_30d;
  }
  const series =
    kind === "llm"
      ? org.anthropic_spend_by_month
      : kind === "whatsapp"
        ? org.whatsapp_spend_by_month
        : org.bolna_voice_spend_by_month;
  return series.find((row) => row.month === period)?.amount_usd ?? 0;
}

function mainCostCellTitle(
  kind: MainCostKind,
  org: BillingOrg,
  period: "rolling_30d" | string,
): string {
  if (kind === "llm") return llmCellTitle(org, period);
  const base =
    period === "rolling_30d"
      ? "Rolling last 30 days (UTC), summed on ledger organisation_id"
      : `UTC calendar month ${period} (partial if current month)`;
  if (kind === "whatsapp") {
    return `${base}. Meta provider (WhatsApp Cloud / pricing sync). Agency rows include linked-client attribution.`;
  }
  return `${base}. provider bolna or tigerhire meter voice_screening_session. Agency rows include linked-client attribution.`;
}

function llmCellTitle(org: BillingOrg, period: "rolling_30d" | string): string {
  if (period === "rolling_30d") {
    if (org.organisation_type === "agency") {
      return `Rolling last 30 days (UTC). Total = ledger on this agency + linked clients (agency_clients). Direct: ${formatUsd4(org.anthropic_spend_usd_30d_ledger_direct)} · From clients: ${formatUsd4(org.anthropic_spend_usd_30d_from_linked_clients)}.`;
    }
    return "Rolling last 30 days (UTC), sum of platform_cost_events (Anthropic) with this organisation_id (hiring company on job).";
  }
  if (org.organisation_type === "agency") {
    return `UTC calendar month ${period}. Includes Anthropic on this agency plus client-attributed share for that month.`;
  }
  return `UTC calendar month ${period} (starts 00:00 UTC; partial if current month). Ledger organisation_id = this org.`;
}

function downloadBillingMainCostsCsv(orgs: BillingOrg[], period: "rolling_30d" | string) {
  const periodSlug = period === "rolling_30d" ? "rolling_30d" : `utc_${period}`;
  const header = [
    "organisation_id",
    "organisation_name",
    "organisation_type",
    "slug",
    "company_plan",
    "llm_usd",
    "whatsapp_usd",
    "bolna_voice_usd",
    "billing_period",
  ];
  const lines = [
    header.join(","),
    ...orgs.map((org) =>
      [
        org.id,
        org.name,
        org.organisation_type,
        org.slug ?? "",
        org.company_plan,
        String(mainCostSpendForPeriod(org, period, "llm")),
        String(mainCostSpendForPeriod(org, period, "whatsapp")),
        String(mainCostSpendForPeriod(org, period, "bolna_voice")),
        periodSlug,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  const csv = `\ufeff${lines.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `billing-main-cogs-${periodSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const ALL_PLANS = ["all", "free", "starter", "growth", "scale"] as const;
const ORG_TYPE_FILTERS = ["all", "company", "agency"] as const;

interface OrgBillingDetailsResponse {
  profile: {
    billing_mode: "automated" | "manual";
    customer_type: string;
    unlock_credits_monthly: number;
    job_credits_monthly: number;
    allow_negative_balance: boolean;
    notes: string | null;
  };
  wallet: {
    unlock_balance: number;
    job_balance: number;
  };
}

export default function AdminBillingPage() {
  const { data: access } = useApiQuery<{ is_platform_admin: boolean }>("/api/platform/access");
  const { data, loading, refetch } = useApiQuery<BillingResponse>(
    access?.is_platform_admin ? "/api/admin/billing" : null,
  );
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterOrgType, setFilterOrgType] = useState<(typeof ORG_TYPE_FILTERS)[number]>("all");
  const [filterSubscription, setFilterSubscription] = useState<string>("all");
  const [selectedOrg, setSelectedOrg] = useState<BillingOrg | null>(null);
  const [billingDetails, setBillingDetails] = useState<OrgBillingDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creditDelta, setCreditDelta] = useState(0);
  const [creditType, setCreditType] = useState<"unlock" | "job">("unlock");
  const [creditReason, setCreditReason] = useState("");
  const [creditActionLoading, setCreditActionLoading] = useState(false);
  const [llmPeriodView, setLlmPeriodView] = useState<"rolling_30d" | string>("rolling_30d");

  const allOrgs = data?.organisations ?? [];
  const totals = data?.totals;
  const costPeriodSuffix =
    llmPeriodView === "rolling_30d"
      ? "(30d rolling)"
      : `(${formatUtcMonthLabel(llmPeriodView)} UTC)`;
  const llmColumnLabel = `LLM ${costPeriodSuffix}`;
  const whatsappColumnLabel = `WhatsApp ${costPeriodSuffix}`;
  const bolnaColumnLabel = `Voice / Bolna ${costPeriodSuffix}`;

  if (access && !access.is_platform_admin) {
    return (
      <>
        <PageHeader
          title="Billing"
          subtitle="Companies and agencies: subscriptions, wallets, and main COGS — LLM (Anthropic), WhatsApp (Meta), and voice/Bolna — with rolling 30d or UTC monthly views. Client-job ledger rows use the hiring company org; agencies get linked-client rollups."
        />
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-sm text-white/70">
          You do not have platform admin access.
        </div>
      </>
    );
  }

  const orgs = allOrgs.filter((org) => {
    if (filterOrgType !== "all" && org.organisation_type !== filterOrgType) return false;
    if (filterPlan !== "all" && org.company_plan !== filterPlan) return false;
    if (filterSubscription !== "all") {
      if (filterSubscription === "none") {
        if (org.subscription_status) return false;
      } else if (org.subscription_status !== filterSubscription) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const nameMatch = org.name.toLowerCase().includes(q);
      const slugMatch = org.slug?.toLowerCase().includes(q);
      if (!nameMatch && !slugMatch) return false;
    }
    return true;
  });

  async function openManageBilling(org: BillingOrg) {
    setSelectedOrg(org);
    setDetailsLoading(true);
    setBillingDetails(null);
    try {
      const response = await fetch(`/api/admin/organisations/${org.id}/billing`, {
        credentials: "include",
      });
      const raw = (await response.json()) as OrgBillingDetailsResponse & {
        error?: string;
        organisationId?: string;
      };
      if (!response.ok) {
        toast({ title: raw.error ?? "Failed to load billing details", tone: "error" });
        return;
      }
      const p = raw.profile;
      const w = raw.wallet;
      setBillingDetails({
        profile: {
          billing_mode: p?.billing_mode ?? "automated",
          customer_type: p?.customer_type ?? "standard",
          unlock_credits_monthly: p?.unlock_credits_monthly ?? 0,
          job_credits_monthly: p?.job_credits_monthly ?? 0,
          allow_negative_balance: p?.allow_negative_balance ?? false,
          notes: p?.notes ?? null,
        },
        wallet: {
          unlock_balance: w?.unlock_balance ?? 0,
          job_balance: w?.job_balance ?? 0,
        },
      });
    } catch {
      toast({ title: "Failed to load billing details", tone: "error" });
    } finally {
      setDetailsLoading(false);
    }
  }

  async function saveBillingProfile() {
    if (!selectedOrg || !billingDetails) return;
    setSavingProfile(true);
    try {
      const response = await fetch(`/api/admin/organisations/${selectedOrg.id}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          billingMode: billingDetails.profile.billing_mode,
          customerType: billingDetails.profile.customer_type,
          unlockCreditsMonthly: billingDetails.profile.unlock_credits_monthly,
          jobCreditsMonthly: billingDetails.profile.job_credits_monthly,
          allowNegativeBalance: billingDetails.profile.allow_negative_balance,
          notes: billingDetails.profile.notes ?? "",
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast({ title: payload.error ?? "Failed to update billing profile", tone: "error" });
        return;
      }
      toast({ title: "Billing profile updated", tone: "success" });
      await refetch({ silent: true });
    } catch {
      toast({ title: "Failed to update billing profile", tone: "error" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function mutateCredits() {
    if (!selectedOrg || !billingDetails) return;
    if (!creditDelta || !creditReason.trim()) {
      toast({ title: "Enter delta and reason", tone: "warning" });
      return;
    }
    setCreditActionLoading(true);
    try {
      const response = await fetch(`/api/admin/organisations/${selectedOrg.id}/billing/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          creditType,
          entryType: creditDelta > 0 ? "grant" : "adjust",
          delta: creditDelta,
          reason: creditReason,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        wallet?: { unlock_balance: number; job_balance: number };
      };
      if (!response.ok || !payload.wallet) {
        toast({ title: payload.error ?? "Failed to update credits", tone: "error" });
        return;
      }
      setBillingDetails((prev) =>
        prev
          ? {
              ...prev,
              wallet: {
                unlock_balance: payload.wallet?.unlock_balance ?? prev.wallet.unlock_balance,
                job_balance: payload.wallet?.job_balance ?? prev.wallet.job_balance,
              },
            }
          : prev,
      );
      setCreditDelta(0);
      setCreditReason("");
      toast({ title: "Credits updated", tone: "success" });
      await refetch({ silent: true });
    } catch {
      toast({ title: "Failed to update credits", tone: "error" });
    } finally {
      setCreditActionLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Companies and agencies: subscriptions, wallets, and main COGS — LLM (Anthropic), WhatsApp (Meta), and voice/Bolna — with rolling 30d or UTC monthly views. Client-job ledger rows use the hiring company org; agencies get linked-client rollups."
      />
      {loading ? (
        <div className="space-y-3 rounded-xl card-lifted p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : (
        <>
          {totals && (
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Organisations"
                value={totals.totalOrgs.toLocaleString()}
                icon={<Building2 size={20} />}
              />
              <StatCard
                label="Active subscriptions"
                value={totals.activeSubscriptions.toLocaleString()}
                icon={<CreditCard size={20} />}
              />
              <StatCard
                label="By plan"
                value={
                  Object.entries(totals.byPlan)
                    .map(([p, n]) => `${PLAN_LABELS[p] ?? p}: ${n}`)
                    .join(" · ") || "—"
                }
                icon={<TrendingUp size={20} />}
              />
            </div>
          )}

          <div className="card-lifted mb-4 space-y-3 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-sm text-white/60">
                <Filter size={16} />
                Plan
              </span>
              {ALL_PLANS.map((plan) => (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setFilterPlan(plan)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    filterPlan === plan
                      ? "bg-white/[0.05] border border-white/10 font-semibold text-white"
                      : "bg-transparent border border-white/10 font-medium text-white/55 hover:text-white"
                  }`}
                >
                  {plan === "all" ? "All" : (PLAN_LABELS[plan] ?? plan)}
                </button>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-white/15 sm:inline-block" aria-hidden />
              <span className="flex items-center gap-2 text-sm text-white/60">
                <Building2 size={16} />
                Type
              </span>
              {ORG_TYPE_FILTERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterOrgType(t)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    filterOrgType === t
                      ? "bg-white/[0.05] border border-white/10 font-semibold text-white"
                      : "bg-transparent border border-white/10 font-medium text-white/55 hover:text-white"
                  }`}
                >
                  {t === "all" ? "All" : ORG_TYPE_LABELS[t]}
                </button>
              ))}
              <select
                value={filterSubscription}
                onChange={(e) => setFilterSubscription(e.target.value)}
                className="ml-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
                aria-label="Filter by subscription status"
              >
                <option value="all">All subscriptions</option>
                <option value="active">Active</option>
                <option value="canceled">Canceled</option>
                <option value="past_due">Past due</option>
                <option value="none">No subscription</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or slug..."
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-9 pr-4 py-2 text-sm text-[var(--text)] placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
              <span className="text-sm text-white/60">
                {orgs.length} of {allOrgs.length} organisation{allOrgs.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="card-lifted mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 px-4 py-3">
            <span className="text-sm font-medium text-white/70">Main COGS (USD)</span>
            <select
              value={llmPeriodView}
              onChange={(e) => setLlmPeriodView(e.target.value as "rolling_30d" | string)}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-white/30"
              aria-label="Main COGS reporting period (LLM, WhatsApp, voice)"
            >
              <option value="rolling_30d">Last 30 days (rolling, UTC)</option>
              {(totals?.llm_report_months ?? []).map((m) => (
                <option key={m} value={m}>
                  {formatUtcMonthLabel(m)}
                  {m === currentUtcMonthKey() ? " (partial)" : ""} — {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => downloadBillingMainCostsCsv(orgs, llmPeriodView)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text)] transition hover:bg-white/[0.04]"
            >
              <Download size={16} />
              Download CSV (visible rows)
            </button>
            {totals?.llm_note ? (
              <p className="w-full text-xs text-white/45 sm:w-auto sm:flex-1 sm:min-w-[12rem]">
                {totals.llm_note}
              </p>
            ) : null}
          </div>

          {(() => {
            const ua = totals?.main_costs_unassigned;
            if (!ua) return null;
            const uLlm = unassignedMainCostForPeriod(ua, llmPeriodView, "llm");
            const uWa = unassignedMainCostForPeriod(ua, llmPeriodView, "whatsapp");
            const uBolna = unassignedMainCostForPeriod(ua, llmPeriodView, "bolna_voice");
            if (uLlm <= 0 && uWa <= 0 && uBolna <= 0) return null;
            return (
              <div className="card-lifted mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm">
                <p className="font-medium text-amber-100">Not attributed to any organisation</p>
                <p className="mt-1 text-xs text-white/60">
                  Costs we only get as one platform-wide total from a vendor, so we cannot place
                  them on a single customer—for example AI usage reported for the whole Anthropic
                  account. The table above does not include this; add it when you compare to a
                  vendor dashboard.
                </p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-white/85">
                  <span>LLM: {formatUsd4(uLlm)}</span>
                  <span>WhatsApp: {formatUsd4(uWa)}</span>
                  <span>Voice / Bolna: {formatUsd4(uBolna)}</span>
                </div>
              </div>
            );
          })()}

          <div className="card-lifted overflow-x-auto rounded-xl">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {(
                    [
                      "Organisation",
                      "Type",
                      "Slug",
                      "Plan",
                      "Subscription",
                      "Provider",
                      "Mode",
                      llmColumnLabel,
                      whatsappColumnLabel,
                      bolnaColumnLabel,
                      "Unlock Credits",
                      "Job Credits",
                      "Actions",
                      "Created",
                    ] as const
                  ).map((h) => (
                    <th
                      key={h}
                      className="heading-card whitespace-nowrap px-4 py-3 text-xs font-medium tracking-wide text-white/60"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr
                    key={org.id}
                    className="card-lifted-hover border-b border-[var(--border)] last:border-b-0 transition-colors"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--text)]">
                      {org.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs ${ORG_TYPE_COLORS[org.organisation_type] ?? "bg-[var(--bg-elevated)] text-white/60"}`}
                      >
                        {ORG_TYPE_LABELS[org.organisation_type] ?? org.organisation_type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-white/60">{org.slug ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs ${PLAN_COLORS[org.company_plan] ?? PLAN_COLORS.free}`}
                      >
                        {PLAN_LABELS[org.company_plan] ?? org.company_plan}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {org.subscription_status ? (
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[org.subscription_status] ?? "bg-[var(--bg-elevated)] text-white/60"}`}
                        >
                          {org.subscription_status}
                        </span>
                      ) : (
                        <span className="text-white/60">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs uppercase tracking-wide text-white/70">
                        {org.provider}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs uppercase tracking-wide text-white/70">
                        {org.billing_mode}
                      </span>
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-white/70"
                      title={llmCellTitle(org, llmPeriodView)}
                    >
                      {formatUsd4(mainCostSpendForPeriod(org, llmPeriodView, "llm"))}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-white/70"
                      title={mainCostCellTitle("whatsapp", org, llmPeriodView)}
                    >
                      {formatUsd4(mainCostSpendForPeriod(org, llmPeriodView, "whatsapp"))}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-white/70"
                      title={mainCostCellTitle("bolna_voice", org, llmPeriodView)}
                    >
                      {formatUsd4(mainCostSpendForPeriod(org, llmPeriodView, "bolna_voice"))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-white/60">
                      {org.unlock_balance}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-white/60">{org.job_balance}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openManageBilling(org)}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)] transition hover:bg-white/[0.04]"
                      >
                        <SlidersHorizontal size={12} />
                        Manage
                      </button>
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-white/60"
                      suppressHydrationWarning
                    >
                      {formatDate(org.created_at)}
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-10 text-center text-white/60">
                      {allOrgs.length === 0
                        ? "No organisations yet."
                        : "No organisations match your filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {selectedOrg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text)]">
                Manage billing - {selectedOrg.name}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOrg(null)}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-white/70"
              >
                Close
              </button>
            </div>

            {detailsLoading || !billingDetails ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-white/60">
                    Billing mode
                    <select
                      value={billingDetails.profile.billing_mode ?? "automated"}
                      onChange={(e) =>
                        setBillingDetails((prev) =>
                          prev
                            ? {
                                ...prev,
                                profile: {
                                  ...prev.profile,
                                  billing_mode: e.target.value as "automated" | "manual",
                                },
                              }
                            : prev,
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <option value="automated">Automated</option>
                      <option value="manual">Manual</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-white/60">
                    Customer type
                    <input
                      value={billingDetails.profile.customer_type ?? ""}
                      onChange={(e) =>
                        setBillingDetails((prev) =>
                          prev
                            ? {
                                ...prev,
                                profile: { ...prev.profile, customer_type: e.target.value },
                              }
                            : prev,
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-white/60">
                    Monthly unlock policy
                    <input
                      type="number"
                      min={0}
                      value={
                        Number.isFinite(Number(billingDetails.profile.unlock_credits_monthly))
                          ? Number(billingDetails.profile.unlock_credits_monthly)
                          : 0
                      }
                      onChange={(e) =>
                        setBillingDetails((prev) =>
                          prev
                            ? {
                                ...prev,
                                profile: {
                                  ...prev.profile,
                                  unlock_credits_monthly: Number(e.target.value) || 0,
                                },
                              }
                            : prev,
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-white/60">
                    Monthly job policy
                    <input
                      type="number"
                      min={0}
                      value={
                        Number.isFinite(Number(billingDetails.profile.job_credits_monthly))
                          ? Number(billingDetails.profile.job_credits_monthly)
                          : 0
                      }
                      onChange={(e) =>
                        setBillingDetails((prev) =>
                          prev
                            ? {
                                ...prev,
                                profile: {
                                  ...prev.profile,
                                  job_credits_monthly: Number(e.target.value) || 0,
                                },
                              }
                            : prev,
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text)] sm:col-span-2">
                    <input
                      type="checkbox"
                      className="rounded border-[var(--border)]"
                      checked={Boolean(billingDetails.profile.allow_negative_balance)}
                      onChange={(e) =>
                        setBillingDetails((prev) =>
                          prev
                            ? {
                                ...prev,
                                profile: {
                                  ...prev.profile,
                                  allow_negative_balance: e.target.checked,
                                },
                              }
                            : prev,
                        )
                      }
                    />
                    Allow negative wallet balance
                  </label>
                  <label className="space-y-1 text-xs text-white/60 sm:col-span-2">
                    Internal notes
                    <textarea
                      value={billingDetails.profile.notes ?? ""}
                      onChange={(e) =>
                        setBillingDetails((prev) =>
                          prev
                            ? {
                                ...prev,
                                profile: {
                                  ...prev.profile,
                                  notes: e.target.value === "" ? null : e.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                      rows={3}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={saveBillingProfile}
                  disabled={savingProfile}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  {savingProfile ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  Save profile
                </button>

                <div className="rounded-xl border border-[var(--border)] p-4">
                  <p className="text-sm text-[var(--text)]">
                    Current wallet: unlock <strong>{billingDetails.wallet.unlock_balance}</strong> ·
                    job <strong>{billingDetails.wallet.job_balance}</strong>
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <select
                      value={creditType}
                      onChange={(e) => setCreditType(e.target.value as "unlock" | "job")}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <option value="unlock">Unlock credits</option>
                      <option value="job">Job credits</option>
                    </select>
                    <input
                      type="number"
                      value={creditDelta}
                      onChange={(e) => setCreditDelta(Number(e.target.value) || 0)}
                      placeholder="Delta (+/-)"
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                    <input
                      value={creditReason}
                      onChange={(e) => setCreditReason(e.target.value)}
                      placeholder="Reason"
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={mutateCredits}
                    disabled={creditActionLoading}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] disabled:opacity-60"
                  >
                    {creditActionLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                    Apply credit adjustment
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
