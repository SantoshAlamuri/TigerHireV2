"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { AttentionSection } from "./_home/AttentionSection";
import { CommercialSection } from "./_home/CommercialSection";
import { FlowLookupSection } from "./_home/FlowLookupSection";
import { OnboardingSection } from "./_home/OnboardingSection";
import { ReliabilitySection } from "./_home/ReliabilitySection";
const RoleChart = dynamic(() => import("./_home/RoleChart").then((module) => module.RoleChart), {
  ssr: false,
});
import { StatCardsGrid } from "./_home/StatCardsGrid";
import { SupportSection } from "./_home/SupportSection";
import { UsageSection } from "./_home/UsageSection";
import { useAdminHome } from "./_home/useAdminHome";

const sections = [
  "Overview",
  "Onboarding",
  "Support",
  "Billing",
  "System health",
  "Reports",
] as const;
type Section = (typeof sections)[number];

export default function AdminOverviewPage() {
  const [section, setSection] = useState<Section>("Overview");
  const {
    isPlatformAdmin,
    data,
    loading,
    t,
    analyticsError,
    refetchAnalytics,
    attentionCards,
    onboardingData,
    onboardingLoading,
    onboardingError,
    onboardingRequests,
    pendingOnboarding,
    onboardingNeedsCompletion,
    stalePendingOnboarding,
    billingData,
    billingLoading,
    billingError,
    billingRowsAtRisk,
    inactiveSubscriptions,
    lowCreditRows,
    sessionsData,
    sessionsLoading,
    sessionsError,
    handoverSessions,
    handoversStale,
    humanTakeoversActive,
    agentsData,
    agentsLoading,
    agentsError,
    observabilityData,
    observabilityLoading,
    observabilityError,
    failedAgentRuns,
    longRunningAgentRuns,
    reliabilitySignalsCount,
    reliabilityWatchItems,
    usageSummaryData,
    usageSummaryLoading,
    usageSummaryError,
  } = useAdminHome(section);

  return (
    <>
      <PageHeader
        title="Platform overview"
        subtitle="Manage companies, support and system health."
      />
      <nav aria-label="Platform operations" className="mb-5 flex flex-wrap gap-2">
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={section === item ? "page" : undefined}
            onClick={() => setSection(item)}
            className={`rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${section === item ? "bg-[var(--surface)] text-[var(--text)]" : "text-[var(--text-muted)] hover:bg-white/5"}`}
          >
            {item}
          </button>
        ))}
      </nav>
      {section === "Reports" && loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={`admin-stat-skeleton-${idx}`} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : section === "Reports" && analyticsError ? (
        <p role="alert" className="text-sm text-[var(--text-muted)]">
          Could not load reports.{" "}
          <button type="button" className="ml-2 underline" onClick={() => void refetchAnalytics()}>
            Retry
          </button>
        </p>
      ) : (
        <div className="space-y-6">
          {section === "Overview" && <AttentionSection attentionCards={attentionCards} />}

          <>
            {section === "Onboarding" && (
              <OnboardingSection
                isPlatformAdmin={isPlatformAdmin}
                onboardingLoading={onboardingLoading}
                onboardingData={onboardingData}
                onboardingError={onboardingError}
                onboardingRequests={onboardingRequests}
                pendingOnboarding={pendingOnboarding}
                onboardingNeedsCompletion={onboardingNeedsCompletion}
                stalePendingOnboarding={stalePendingOnboarding}
              />
            )}

            {section === "Billing" && (
              <CommercialSection
                isPlatformAdmin={isPlatformAdmin}
                billingLoading={billingLoading}
                billingData={billingData}
                billingError={billingError}
                billingRowsAtRisk={billingRowsAtRisk}
                inactiveSubscriptions={inactiveSubscriptions}
                lowCreditRows={lowCreditRows}
              />
            )}
          </>

          <>
            {section === "Support" && (
              <SupportSection
                sessionsLoading={sessionsLoading}
                sessionsData={sessionsData}
                sessionsError={sessionsError}
                handoverSessions={handoverSessions}
                handoversStale={handoversStale}
                humanTakeoversActive={humanTakeoversActive}
              />
            )}

            {section === "System health" && (
              <ReliabilitySection
                agentsLoading={agentsLoading}
                agentsData={agentsData}
                agentsError={agentsError}
                observabilityLoading={observabilityLoading}
                observabilityData={observabilityData}
                observabilityError={observabilityError}
                failedAgentRuns={failedAgentRuns}
                longRunningAgentRuns={longRunningAgentRuns}
                reliabilitySignalsCount={reliabilitySignalsCount}
                reliabilityWatchItems={reliabilityWatchItems}
              />
            )}
          </>

          <>
            {section === "Reports" && (
              <UsageSection
                usageSummaryLoading={usageSummaryLoading}
                usageSummaryData={usageSummaryData}
                usageSummaryError={usageSummaryError}
              />
            )}

            {section === "Support" && <FlowLookupSection />}
          </>

          {section === "Reports" && <StatCardsGrid t={t} />}

          {section === "Reports" && data?.roleCounts && Object.keys(data.roleCounts).length > 0 && (
            <RoleChart roleCounts={data.roleCounts} />
          )}
        </div>
      )}
    </>
  );
}
