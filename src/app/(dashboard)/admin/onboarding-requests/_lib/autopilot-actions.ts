"use client";

import { recommendedMonthlyCredits, recommendedOverridesForPlan } from "./constants";
import type { AdminPayload, WorkflowCtx } from "./types";

export async function runAutopilot(ctx: WorkflowCtx) {
  const {
    activeRequest,
    setAutopilotLoading,
    setActionError,
    setAutopilotLog,
    adminPayload,
    patchRequest,
    approvalForm,
    billingDraft,
    applyCredit,
    autopilotConfig,
    setFeatureOverride,
    completionNotes,
    refetch,
    billingQuery,
    featuresQuery,
    toast,
  } = ctx;
  const addAutopilotLog = (message: string) => setAutopilotLog((prev) => [...prev, message]);
  if (!activeRequest) return;
  setAutopilotLoading(true);
  setActionError("");
  setAutopilotLog([]);
  try {
    let workingRequest = activeRequest;
    let workingCompanyId = workingRequest.onboarding_company_id;
    addAutopilotLog("Starting autopilot workflow.");

    if (workingRequest.onboarding_status === "cancelled") {
      addAutopilotLog("Reopening cancelled request.");
      const reopened = await patchRequest({
        row: workingRequest,
        onboardingStatus: "pending",
        payload: adminPayload,
      });
      if (reopened) workingRequest = reopened;
    }

    if (!workingCompanyId) {
      addAutopilotLog("Creating company from request details.");
      const response = await fetch("/api/platform/companies/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(approvalForm),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        company_id?: string;
      };
      if (!response.ok || !payload.company_id) {
        throw new Error(payload.error ?? "Autopilot could not create company.");
      }
      workingCompanyId = payload.company_id;
      addAutopilotLog(`Company created: ${workingCompanyId}`);
    }

    const finalPayload: AdminPayload = {
      ...adminPayload,
      legalCompanyName: adminPayload.legalCompanyName.trim() || approvalForm.company_name,
      billingSpocName:
        adminPayload.billingSpocName.trim() ||
        activeRequest.name?.trim() ||
        `${approvalForm.admin_first_name} ${approvalForm.admin_last_name}`.trim(),
      billingSpocEmail: adminPayload.billingSpocEmail.trim() || approvalForm.admin_email,
      workflow: {
        ...adminPayload.workflow,
        companyInfoSaved: true,
        billingProfileSaved: true,
        creditsConfigured: true,
        overridesReviewed: true,
      },
    };

    const approved = await patchRequest({
      row: workingRequest,
      onboardingStatus: "approved",
      onboardingCompanyId: workingCompanyId,
      payload: finalPayload,
    });
    if (approved) workingRequest = approved;
    addAutopilotLog("Request moved to approved status.");

    const monthlyDefaults = recommendedMonthlyCredits(approvalForm.plan);
    const billingProfilePayload = {
      billingMode: billingDraft.billingMode,
      customerType:
        billingDraft.customerType.trim() ||
        (approvalForm.plan === "starter" ? "smb" : approvalForm.plan),
      unlockCreditsMonthly: Math.max(billingDraft.unlockCreditsMonthly, monthlyDefaults.unlock),
      jobCreditsMonthly: Math.max(billingDraft.jobCreditsMonthly, monthlyDefaults.job),
      allowNegativeBalance: billingDraft.allowNegativeBalance,
      notes: billingDraft.notes || "Autopilot setup from onboarding request",
    };

    addAutopilotLog("Saving billing profile with recommended defaults.");
    const billingResponse = await fetch(`/api/admin/organisations/${workingCompanyId}/billing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(billingProfilePayload),
    });
    const billingResult = (await billingResponse.json().catch(() => ({}))) as { error?: string };
    if (!billingResponse.ok) {
      throw new Error(billingResult.error ?? "Autopilot failed to save billing profile.");
    }

    if (autopilotConfig.seedCreditsFromMonthlyPolicy) {
      addAutopilotLog("Applying initial credits from monthly policy.");
      await applyCredit(
        "unlock",
        billingProfilePayload.unlockCreditsMonthly,
        "Autopilot onboarding: initial unlock credits",
      );
      await applyCredit(
        "job",
        billingProfilePayload.jobCreditsMonthly,
        "Autopilot onboarding: initial job credits",
      );
    } else {
      addAutopilotLog("Skipped initial credits (per autopilot config).");
    }

    if (autopilotConfig.applyRecommendedOverrides) {
      const recommendedOverrides = recommendedOverridesForPlan(approvalForm.plan);
      if (recommendedOverrides.length > 0) {
        addAutopilotLog("Applying recommended feature guardrails.");
        for (const override of recommendedOverrides) {
          await setFeatureOverride(override.featureKey, override.enabled);
        }
      } else {
        addAutopilotLog("No feature guardrails needed for selected plan.");
      }
    } else {
      addAutopilotLog("Skipped feature guardrails (per autopilot config).");
    }

    const doneNotes =
      completionNotes || `Autopilot completed by platform admin for ${approvalForm.plan} plan.`;
    if (autopilotConfig.autoCompleteRequest) {
      addAutopilotLog("Marking workflow as complete.");
      await patchRequest({
        row: workingRequest,
        onboardingStatus: "handled",
        onboardingCompanyId: workingCompanyId,
        payload: finalPayload,
        handledNotes: doneNotes,
      });
    } else {
      addAutopilotLog("Autopilot finished without final completion.");
    }

    await Promise.all([
      refetch({ silent: true }),
      billingQuery.refetch({ silent: true }),
      featuresQuery.refetch({ silent: true }),
    ]);
    addAutopilotLog("Autopilot workflow completed successfully.");
    toast({ title: "Autopilot onboarding completed", tone: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Autopilot run failed.";
    addAutopilotLog(`Autopilot error: ${message}`);
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setAutopilotLoading(false);
  }
}
