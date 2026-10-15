"use client";

import { useMemo } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { hoursSince, isWorkflowComplete } from "./helpers";
import { buildAttentionCards } from "./attention-cards";
import type {
  AgentsResponse,
  AnalyticsData,
  BillingDataResponse,
  FitScoreObservabilityResponse,
  OnboardingRequestsResponse,
  UsageSummaryResponse,
  WhatsAppSessionsResponse,
} from "./types";

export function useAdminHome(section = "Overview") {
  const { data: access } = useApiQuery<{ is_platform_admin: boolean }>("/api/platform/access");
  const isPlatformAdmin = access?.is_platform_admin === true;

  const {
    data,
    loading,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useApiQuery<AnalyticsData>(section === "Reports" ? "/api/admin/analytics" : null);
  const {
    data: onboardingData,
    loading: onboardingLoading,
    error: onboardingError,
  } = useApiQuery<OnboardingRequestsResponse>(
    isPlatformAdmin && ["Overview", "Onboarding"].includes(section)
      ? "/api/admin/onboarding-requests"
      : null,
  );
  const {
    data: billingData,
    loading: billingLoading,
    error: billingError,
  } = useApiQuery<BillingDataResponse>(
    isPlatformAdmin && ["Overview", "Billing"].includes(section) ? "/api/admin/billing" : null,
  );
  const {
    data: sessionsData,
    loading: sessionsLoading,
    error: sessionsError,
  } = useApiQuery<WhatsAppSessionsResponse>(
    ["Overview", "Support"].includes(section) ? "/api/admin/whatsapp-sessions" : null,
    {
      handover: "1",
      limit: 20,
    },
  );
  const {
    data: agentsData,
    loading: agentsLoading,
    error: agentsError,
  } = useApiQuery<AgentsResponse>(section === "System health" ? "/api/admin/agents" : null, {
    limit: 50,
  });
  const {
    data: observabilityData,
    loading: observabilityLoading,
    error: observabilityError,
  } = useApiQuery<FitScoreObservabilityResponse>(
    section === "System health" ? "/api/admin/fitscore-observability" : null,
  );
  const {
    data: usageSummaryData,
    loading: usageSummaryLoading,
    error: usageSummaryError,
  } = useApiQuery<UsageSummaryResponse>(section === "Reports" ? "/api/usage/summary" : null);

  const t = data?.totals;
  const onboardingRequests = onboardingData?.requests ?? [];
  const billingRows = billingData?.organisations ?? [];
  const handoverSessions = sessionsData?.sessions ?? [];
  const agentLogs = agentsData?.logs ?? [];

  const pendingOnboarding = onboardingRequests.filter((row) => row.onboarding_status === "pending");
  const approvedOnboarding = onboardingRequests.filter(
    (row) => row.onboarding_status === "approved",
  );
  const onboardingNeedsCompletion = approvedOnboarding.filter(
    (row) => !row.onboarding_company_id || !isWorkflowComplete(row.onboarding_admin_payload),
  );
  const stalePendingOnboarding = pendingOnboarding.filter((row) => {
    const ageHours = hoursSince(row.created_at);
    return ageHours != null && ageHours >= 48;
  });

  const billingRowsAtRisk = billingRows.filter(
    (row) =>
      row.subscription_status !== "active" ||
      row.unlock_balance <= 0 ||
      row.job_balance <= 0 ||
      row.billing_mode === "manual",
  );
  const inactiveSubscriptions = billingRows.filter((row) => row.subscription_status !== "active");
  const lowCreditRows = billingRows.filter(
    (row) => row.unlock_balance <= 0 || row.job_balance <= 0,
  );

  const handoversStale = handoverSessions.filter((row) => {
    const lastSignalAt = row.last_candidate_message_at ?? row.last_message_at;
    const ageHours = hoursSince(lastSignalAt);
    return ageHours != null && ageHours >= 2;
  });
  const humanTakeoversActive = handoverSessions.filter(
    (row) => row.context?.human_takeover_active === true,
  );

  const failedAgentRuns = agentLogs.filter(
    (log) => log.status === "failed" || log.status === "error" || log.status === "cancelled",
  );
  const longRunningAgentRuns = agentLogs.filter((log) => {
    if (log.status !== "running") return false;
    const ageHours = hoursSince(log.created_at ?? null);
    return ageHours != null && ageHours >= 0.5;
  });

  const observabilityMetrics = observabilityData?.metrics;
  const cacheHitLow =
    observabilityMetrics != null && Number.isFinite(observabilityMetrics.cacheHitRatePct)
      ? observabilityMetrics.cacheHitRatePct < 20
      : false;
  const evidencePassLow =
    observabilityMetrics != null &&
    Number.isFinite(observabilityMetrics.evidenceQuoteValidationPassRatePct)
      ? observabilityMetrics.evidenceQuoteValidationPassRatePct < 80
      : false;
  const batchAtLimit =
    observabilityMetrics != null &&
    observabilityMetrics.batchConcurrencyConfiguredLimit > 0 &&
    observabilityMetrics.batchConcurrencyHighWaterMark >=
      observabilityMetrics.batchConcurrencyConfiguredLimit;
  const reliabilitySignalsCount =
    (cacheHitLow ? 1 : 0) + (evidencePassLow ? 1 : 0) + (batchAtLimit ? 1 : 0);

  const attentionCards = useMemo(
    () =>
      buildAttentionCards({
        onboardingLoaded: Boolean(onboardingData),
        onboardingError,
        pendingOnboarding: pendingOnboarding.length,
        onboardingNeedsCompletion: onboardingNeedsCompletion.length,
        billingLoaded: Boolean(billingData),
        billingError,
        billingRowsAtRisk: billingRowsAtRisk.length,
        inactiveSubscriptions: inactiveSubscriptions.length,
        lowCreditRows: lowCreditRows.length,
        sessionsLoaded: Boolean(sessionsData),
        sessionsError,
        handoverSessions: handoverSessions.length,
        handoversStale: handoversStale.length,
      }),
    // Dependency list kept exactly as before the extraction.
    [
      onboardingData,
      onboardingError,
      billingData,
      billingError,
      sessionsData,
      sessionsError,
      billingRowsAtRisk.length,
      failedAgentRuns.length,
      handoverSessions.length,
      handoversStale.length,
      humanTakeoversActive.length,
      inactiveSubscriptions.length,
      longRunningAgentRuns.length,
      lowCreditRows.length,
      onboardingNeedsCompletion.length,
      pendingOnboarding.length,
      reliabilitySignalsCount,
    ],
  );

  const reliabilityWatchItems = [
    cacheHitLow ? "Cache hit rate under 20% in the last 24h." : null,
    evidencePassLow ? "Evidence quote validation pass rate under 80%." : null,
    batchAtLimit ? "Batch concurrency touched configured limit." : null,
  ].filter(Boolean) as string[];

  return {
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
  };
}
