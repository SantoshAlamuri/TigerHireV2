"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { getSlaState, getSlaToneClass, hoursSince, REPORT_CARD_CLASS } from "./helpers";
import type { BillingDataResponse, BillingOrganisationRow } from "./types";

type CommercialSectionProps = {
  isPlatformAdmin: boolean;
  billingLoading: boolean;
  billingData: BillingDataResponse | null | undefined;
  billingError: unknown;
  billingRowsAtRisk: BillingOrganisationRow[];
  inactiveSubscriptions: BillingOrganisationRow[];
  lowCreditRows: BillingOrganisationRow[];
};

export function CommercialSection({
  isPlatformAdmin,
  billingLoading,
  billingData,
  billingError,
  billingRowsAtRisk,
  inactiveSubscriptions,
  lowCreditRows,
}: CommercialSectionProps) {
  const countsAvailable = isPlatformAdmin && !billingLoading && !billingError && !!billingData;
  return (
    <section className={REPORT_CARD_CLASS}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="heading-section text-lg text-[var(--text)]">Commercial attention</h2>
          <p className="mt-1 text-xs text-white/60">
            Inactive subscriptions and credit wallets that can block hiring actions.
          </p>
        </div>
        <Link
          href="/admin/billing"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
        >
          Open billing
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-white/65">
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Revenue-risk orgs:{" "}
          <span className="font-semibold text-[var(--text)]">
            {countsAvailable ? billingRowsAtRisk.length : "—"}
          </span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Inactive subscriptions:{" "}
          <span className="font-semibold text-amber-300">
            {countsAvailable ? inactiveSubscriptions.length : "—"}
          </span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Low/empty credits:{" "}
          <span className="font-semibold text-amber-300">
            {countsAvailable ? lowCreditRows.length : "—"}
          </span>
        </span>
      </div>
      {isPlatformAdmin && billingLoading && !billingData ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : isPlatformAdmin && billingError ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Could not load billing attention list right now.
        </p>
      ) : !isPlatformAdmin ? (
        <p className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-xs text-white/60">
          Platform admin access required to view billing attention.
        </p>
      ) : (
        <div className="space-y-2">
          {billingRowsAtRisk.slice(0, 4).map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <div>
                <p className="text-sm text-[var(--text)]">{row.name}</p>
                <p className="text-xs text-white/60">
                  {row.subscription_status ?? "no subscription"} · unlock {row.unlock_balance} · job{" "}
                  {row.job_balance}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="rounded-md border border-[var(--border)] bg-[var(--surface)]/60 px-1.5 py-0.5 text-xs text-white/70">
                    Assignee: Unassigned
                  </span>
                  {(() => {
                    const ageHours = hoursSince(row.created_at ?? null);
                    const state = getSlaState(ageHours, {
                      warningHours: 72,
                      breachHours: 168,
                    });
                    return (
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-xs ${getSlaToneClass(state)}`}
                      >
                        SLA 7d
                      </span>
                    );
                  })()}
                </div>
              </div>
              <span className="rounded-md bg-white/[0.04] px-2 py-1 text-xs uppercase tracking-wide text-white/60">
                {row.billing_mode}
              </span>
            </div>
          ))}
          {billingRowsAtRisk.length === 0 ? (
            <p className="text-sm text-white/60">No billing risk signals at the moment.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
