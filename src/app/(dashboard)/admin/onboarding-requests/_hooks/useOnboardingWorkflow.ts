"use client";

import { useEffect, useMemo, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useToast } from "@/components/ui/Toast";
import { EMPTY_ADMIN_PAYLOAD } from "../_lib/constants";
import {
  approveAndCreateCompany as approveAndCreateCompanyAction,
  cancelRequest as cancelRequestAction,
  markWorkflowHandled as markWorkflowHandledAction,
  patchRequestAction,
  reopenRequestToPending as reopenRequestToPendingAction,
  saveCompanyInfo as saveCompanyInfoAction,
} from "../_lib/request-actions";
import {
  applyCredits as applyCreditsAction,
  applyCreditAction,
  saveBillingProfile as saveBillingProfileAction,
  setFeatureOverrideAction,
} from "../_lib/billing-actions";
import { runAutopilot as runAutopilotAction } from "../_lib/autopilot-actions";
import type {
  AdminPayload,
  BillingDetailsResponse,
  FeaturesResponse,
  OnboardingRequestRow,
  WorkflowCtx,
} from "../_lib/types";

export function useOnboardingWorkflow() {
  const { toast } = useToast();
  const { data: access } = useApiQuery<{ is_platform_admin: boolean }>("/api/platform/access");
  const { data, loading, error, refetch, mergeData } = useApiQuery<{
    requests: OnboardingRequestRow[];
  }>(access?.is_platform_admin ? "/api/admin/onboarding-requests" : null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const activeRequest = useMemo(
    () => (data?.requests ?? []).find((row) => row.id === activeId) ?? null,
    [activeId, data?.requests],
  );

  const [approvalForm, setApprovalForm] = useState({
    company_name: "",
    primary_domain: "",
    plan: "starter" as "starter" | "pro" | "enterprise",
    admin_email: "",
    admin_first_name: "",
    admin_last_name: "",
  });
  const [adminPayload, setAdminPayload] = useState<AdminPayload>(EMPTY_ADMIN_PAYLOAD);
  const [completionNotes, setCompletionNotes] = useState("");
  const [companyInfoValidationError, setCompanyInfoValidationError] = useState("");
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [autopilotLog, setAutopilotLog] = useState<string[]>([]);
  const [autopilotConfig, setAutopilotConfig] = useState({
    autoCompleteRequest: true,
    seedCreditsFromMonthlyPolicy: true,
    applyRecommendedOverrides: true,
  });

  const companyId = activeRequest?.onboarding_company_id ?? null;
  const billingQuery = useApiQuery<BillingDetailsResponse>(
    companyId ? `/api/admin/organisations/${companyId}/billing` : null,
  );
  const featuresQuery = useApiQuery<FeaturesResponse>(
    companyId ? `/api/admin/organisations/${companyId}/features` : null,
  );
  const [billingDraft, setBillingDraft] = useState({
    billingMode: "manual" as "automated" | "manual",
    customerType: "enterprise",
    unlockCreditsMonthly: 0,
    jobCreditsMonthly: 0,
    allowNegativeBalance: false,
    notes: "",
  });
  const [creditDraft, setCreditDraft] = useState({
    unlockDelta: 0,
    jobDelta: 0,
    reason: "Initial onboarding credit allocation",
  });

  useEffect(() => {
    if (!activeRequest) return;
    const [firstName = "", ...rest] = (activeRequest.name ?? "").trim().split(" ");
    setApprovalForm({
      company_name: activeRequest.company ?? "",
      primary_domain: activeRequest.onboarding_domain ?? "",
      plan: "starter",
      admin_email: activeRequest.email,
      admin_first_name: firstName,
      admin_last_name: rest.join(" "),
    });
    setAdminPayload({
      ...EMPTY_ADMIN_PAYLOAD,
      ...(activeRequest.onboarding_admin_payload ?? {}),
      workflow: {
        ...EMPTY_ADMIN_PAYLOAD.workflow,
        ...(activeRequest.onboarding_admin_payload?.workflow ?? {}),
      },
    });
    setCompletionNotes(activeRequest.onboarding_handled_notes ?? "");
  }, [activeRequest?.id]);

  useEffect(() => {
    if (!billingQuery.data?.profile) return;
    const profile = billingQuery.data.profile;
    setBillingDraft({
      billingMode: profile.billing_mode,
      customerType: profile.customer_type,
      unlockCreditsMonthly: profile.unlock_credits_monthly,
      jobCreditsMonthly: profile.job_credits_monthly,
      allowNegativeBalance: profile.allow_negative_balance,
      notes: profile.notes ?? "",
    });
  }, [billingQuery.data?.profile]);

  const pendingCount = useMemo(
    () => (data?.requests ?? []).filter((row) => row.onboarding_status === "pending").length,
    [data?.requests],
  );

  const canCompleteWorkflow = Boolean(
    companyId &&
    adminPayload.workflow.companyInfoSaved &&
    adminPayload.workflow.billingProfileSaved &&
    adminPayload.workflow.creditsConfigured &&
    adminPayload.workflow.overridesReviewed &&
    adminPayload.legalCompanyName.trim() &&
    adminPayload.billingSpocName.trim() &&
    adminPayload.billingSpocEmail.trim(),
  );

  const ctx: WorkflowCtx = {
    activeRequest,
    companyId,
    approvalForm,
    adminPayload,
    completionNotes,
    billingDraft,
    creditDraft,
    autopilotConfig,
    setSaving,
    setActionError,
    setCompanyInfoValidationError,
    setAutopilotLoading,
    setAutopilotLog,
    setCreditDraft,
    toast,
    refetch,
    mergeData,
    billingQuery,
    featuresQuery,
    patchRequest: (params) => patchRequestAction(ctx, params),
    applyCredit: (type, delta, reason) => applyCreditAction(ctx, type, delta, reason),
    setFeatureOverride: (featureKey, enabled) => setFeatureOverrideAction(ctx, featureKey, enabled),
  };

  return {
    access,
    data,
    loading,
    error,
    refetch,
    billingQuery,
    featuresQuery,
    activeId,
    setActiveId,
    saving,
    actionError,
    approvalForm,
    setApprovalForm,
    adminPayload,
    setAdminPayload,
    completionNotes,
    setCompletionNotes,
    companyInfoValidationError,
    autopilotLoading,
    autopilotLog,
    autopilotConfig,
    setAutopilotConfig,
    billingDraft,
    setBillingDraft,
    creditDraft,
    setCreditDraft,
    activeRequest,
    pendingCount,
    companyId,
    canCompleteWorkflow,
    approveAndCreateCompany: () => approveAndCreateCompanyAction(ctx),
    saveCompanyInfo: () => saveCompanyInfoAction(ctx),
    saveBillingProfile: () => saveBillingProfileAction(ctx),
    applyCredits: () => applyCreditsAction(ctx),
    setFeatureOverride: ctx.setFeatureOverride,
    markWorkflowHandled: () => markWorkflowHandledAction(ctx),
    runAutopilot: () => runAutopilotAction(ctx),
    cancelRequest: () => cancelRequestAction(ctx),
    reopenRequestToPending: () => reopenRequestToPendingAction(ctx),
  };
}

export type OnboardingWorkflow = ReturnType<typeof useOnboardingWorkflow>;
