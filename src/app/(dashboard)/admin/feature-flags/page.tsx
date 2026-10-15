"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import type { CustomerBillingRelation, FeatureFlagCategory } from "@/lib/feature-flags/catalog";

interface FlagCatalogPayload {
  displayName: string;
  shortDescription: string | null;
  category: FeatureFlagCategory;
  customerBilling: CustomerBillingRelation;
  meterKey?: string;
  billingNotes?: string;
  complianceSensitive: boolean;
}

interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  description?: string | null;
  updated_at?: string | null;
  displayName: string;
  catalog: FlagCatalogPayload;
  descriptionForAdmin: string | null;
}

interface FlagsResponse {
  flags: FeatureFlagRow[];
}

interface UsageMeterRow {
  id: string;
  displayName: string;
  description: string;
  defaultUnit: string;
}

interface MetersResponse {
  meters: UsageMeterRow[];
}

function formatCategory(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function billingRelationLabel(rel: CustomerBillingRelation): string {
  switch (rel) {
    case "none":
      return "Not a direct customer line item";
    case "plan_entitlement_related":
      return "Plan / entitlement kill switch (see billing_plans + overrides)";
    case "usage_meter_ready":
      return "Usage meter — billable units can be recorded";
    case "platform_cost_only":
      return "Platform cost only (ledger), not a separate SKU toggle";
    default:
      return rel;
  }
}

export default function FeatureFlagsPage() {
  const { data, loading, refetch } = useApiQuery<FlagsResponse>("/api/admin/feature-flags");
  const { data: metersData, loading: metersLoading } = useApiQuery<MetersResponse>(
    "/api/admin/billing/usage-meters",
  );
  const { mutate: toggleFlag, loading: toggling } = useOptimisticMutation<
    { key: string; enabled: boolean },
    { key: string; enabled: boolean }
  >("/api/admin/feature-flags", { method: "PATCH" });

  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const flags = data?.flags ?? [];
  const meters = metersData?.meters ?? [];

  async function handleToggle(key: string, enabled: boolean) {
    setTogglingKey(key);
    setOptimisticOverrides((prev) => ({ ...prev, [key]: enabled }));
    const result = await toggleFlag({ key, enabled });
    setOptimisticOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setTogglingKey(null);
    if (result) {
      toast({
        title: `${key} ${enabled ? "enabled" : "disabled"}`,
        tone: "success",
      });
      void refetch({ silent: true });
      return;
    }
    toast({
      title: `Failed to update ${key}`,
      tone: "error",
    });
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title="Feature Flags"
          subtitle="Global defaults with catalog names and billing hints"
        />
        <div className="space-y-2 rounded-xl card-lifted p-4">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Feature Flags"
        subtitle="Global defaults with catalog names and billing hints"
      />
      <p className="card-lifted mb-3 rounded-xl px-4 py-3 text-xs text-white/60">
        Runtime toggles in <code className="text-white/80">feature_flags</code>. Per-organisation
        overrides live under Admin → Organisations.{" "}
        <strong className="text-white/80">Entitlements</strong> (plan features) are separate — see
        billing_plans and <code className="text-white/80">/api/entitlements</code> (includes a
        feature catalog for labels).
      </p>
      <div className="card-lifted rounded-xl">
        {flags.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-white/60">
            No feature flags configured
          </div>
        ) : (
          flags.map((flag) => {
            const isToggling = toggling && togglingKey === flag.key;
            const enabled = optimisticOverrides[flag.key] ?? flag.enabled;
            const c = flag.catalog;
            return (
              <div
                key={flag.key}
                className="card-lifted-hover flex flex-col gap-2 border-b border-[var(--border)] px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                      {formatCategory(c.category)}
                    </span>
                    {c.complianceSensitive ? (
                      <span className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                        Compliance
                      </span>
                    ) : null}
                  </div>
                  <p className="text-body font-semibold text-[var(--text)]">{flag.displayName}</p>
                  <p className="font-mono text-[11px] text-white/40">{flag.key}</p>
                  {flag.descriptionForAdmin ? (
                    <p className="text-sm text-white/65">{flag.descriptionForAdmin}</p>
                  ) : null}
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/60">
                    <p className="font-medium text-white/75">Billing</p>
                    <p className="mt-0.5">{billingRelationLabel(c.customerBilling)}</p>
                    {c.meterKey ? (
                      <p className="mt-1 font-mono text-[11px] text-[var(--accent)]">
                        Meter: {c.meterKey}
                      </p>
                    ) : null}
                    {c.billingNotes ? (
                      <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                        {c.billingNotes}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:ml-4 sm:pt-1">
                  {isToggling && (
                    <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled ? "true" : "false"}
                    aria-label={`Toggle ${flag.displayName} ${enabled ? "off" : "on"}`}
                    onClick={() => handleToggle(flag.key, !enabled)}
                    disabled={isToggling}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? "bg-[var(--accent)]" : "bg-[var(--border-interactive)]"}`}
                  >
                    <span
                      className={`mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                    />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <details className="card-lifted mt-6 rounded-xl border border-[var(--border)] px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text)]">
          Customer usage meters (billing reference)
        </summary>
        <p className="mt-2 text-xs text-white/55">
          Canonical meter ids for{" "}
          <code className="text-white/70">recordCustomerUsageMeterEvent</code> — rows land in{" "}
          <code className="text-white/70">platform_cost_events</code> with provider{" "}
          <code className="text-white/70">tigerhire</code>. See
          docs/internal/customer-usage-meters.md.
        </p>
        {metersLoading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {meters.map((m) => (
              <li key={m.id} className="py-3 first:pt-0">
                <p className="font-mono text-xs text-[var(--accent)]">{m.id}</p>
                <p className="text-sm font-medium text-[var(--text)]">{m.displayName}</p>
                <p className="text-xs text-white/55">{m.description}</p>
                <p className="mt-0.5 text-[11px] text-white/40">Default unit: {m.defaultUnit}</p>
              </li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}
