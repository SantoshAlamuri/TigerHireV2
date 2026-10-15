"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  formatFreshness,
  formatUserHint,
  getSlaState,
  getSlaToneClass,
  hoursSince,
  REPORT_CARD_CLASS,
} from "./helpers";
import type { OnboardingRequest, OnboardingRequestsResponse } from "./types";

type OnboardingSectionProps = {
  isPlatformAdmin: boolean;
  onboardingLoading: boolean;
  onboardingData: OnboardingRequestsResponse | null | undefined;
  onboardingError: unknown;
  onboardingRequests: OnboardingRequest[];
  pendingOnboarding: OnboardingRequest[];
  onboardingNeedsCompletion: OnboardingRequest[];
  stalePendingOnboarding: OnboardingRequest[];
};

export function OnboardingSection({
  isPlatformAdmin,
  onboardingLoading,
  onboardingData,
  onboardingError,
  onboardingRequests,
  pendingOnboarding,
  onboardingNeedsCompletion,
  stalePendingOnboarding,
}: OnboardingSectionProps) {
  return (
    <section className={REPORT_CARD_CLASS}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="heading-section text-lg text-[var(--text)]">Onboarding queue</h2>
          <p className="mt-1 text-xs text-white/60">
            Pending approvals and approved requests needing completion steps.
          </p>
        </div>
        <Link
          href="/admin/onboarding-requests"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
        >
          Open queue
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-white/65">
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Pending:{" "}
          <span className="font-semibold text-[var(--text)]">{pendingOnboarding.length}</span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Need completion:{" "}
          <span className="font-semibold text-[var(--text)]">
            {onboardingNeedsCompletion.length}
          </span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-2 py-1">
          Pending {">"}48h:{" "}
          <span className="font-semibold text-amber-300">{stalePendingOnboarding.length}</span>
        </span>
      </div>
      {isPlatformAdmin && onboardingLoading && !onboardingData ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : isPlatformAdmin && onboardingError ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Could not load onboarding queue right now.
        </p>
      ) : !isPlatformAdmin ? (
        <p className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-xs text-white/60">
          Platform admin access required to view the onboarding queue.
        </p>
      ) : (
        <div className="space-y-2">
          {onboardingRequests
            .filter(
              (row) => row.onboarding_status === "pending" || row.onboarding_status === "approved",
            )
            .slice(0, 4)
            .map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <div>
                  <p className="text-sm text-[var(--text)]">
                    {row.company || row.name || "Unnamed request"}
                  </p>
                  <p className="text-xs text-white/60">
                    {row.onboarding_status} · created {formatFreshness(row.created_at)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-md border border-[var(--border)] bg-[var(--surface)]/60 px-1.5 py-0.5 text-xs text-white/70">
                      Assignee:{" "}
                      {formatUserHint(
                        row.onboarding_handled_by ?? row.onboarding_approved_by ?? null,
                      )}
                    </span>
                    {(() => {
                      const ageHours = hoursSince(row.created_at);
                      const state = getSlaState(ageHours, {
                        warningHours: 24,
                        breachHours: 48,
                      });
                      return (
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-xs ${getSlaToneClass(state)}`}
                        >
                          SLA 48h
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <span className="rounded-md bg-white/[0.04] px-2 py-1 text-xs uppercase tracking-wide text-white/60">
                  {row.onboarding_status}
                </span>
              </div>
            ))}
          {onboardingRequests.length === 0 ? (
            <p className="text-sm text-white/60">No onboarding queue items right now.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
