"use client";

import type { OnboardingRequestRow, PatchRequestParams, WorkflowCtx } from "./types";

export async function patchRequestAction(
  ctx: WorkflowCtx,
  params: PatchRequestParams,
): Promise<OnboardingRequestRow> {
  const { completionNotes, mergeData } = ctx;
  try {
    const response = await fetch("/api/admin/onboarding-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id: params.row.id,
        onboardingStatus: params.onboardingStatus,
        onboardingCompanyId: params.onboardingCompanyId ?? params.row.onboarding_company_id ?? null,
        adminPayload: params.payload ?? params.row.onboarding_admin_payload ?? null,
        handledNotes: params.handledNotes ?? completionNotes,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      request?: OnboardingRequestRow;
    };
    if (!response.ok || !payload.request) {
      throw new Error(payload.error ?? "Could not update request status.");
    }

    mergeData((prev) => {
      const requests = prev?.requests ?? [];
      return {
        requests: requests.map((item) =>
          item.id === payload.request!.id ? payload.request! : item,
        ),
      };
    });
    return payload.request;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Could not update request status.");
  }
}

export async function approveAndCreateCompany(ctx: WorkflowCtx) {
  const {
    activeRequest,
    setSaving,
    setActionError,
    approvalForm,
    patchRequest,
    adminPayload,
    toast,
  } = ctx;
  if (!activeRequest) return;
  setSaving(true);
  setActionError("");
  try {
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
      throw new Error(payload.error ?? "Could not approve and create company.");
    }
    await patchRequest({
      row: activeRequest,
      onboardingStatus: "approved",
      onboardingCompanyId: payload.company_id,
      payload: adminPayload,
    });
    toast({ title: "Company approved and created", tone: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not approve request.";
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setSaving(false);
  }
}

export async function saveCompanyInfo(ctx: WorkflowCtx) {
  const {
    activeRequest,
    adminPayload,
    setCompanyInfoValidationError,
    setSaving,
    setActionError,
    patchRequest,
    toast,
  } = ctx;
  if (!activeRequest) return;
  const legalName = adminPayload.legalCompanyName.trim();
  const spocName = adminPayload.billingSpocName.trim();
  const spocEmail = adminPayload.billingSpocEmail.trim();
  if (!legalName || !spocName || !spocEmail) {
    setCompanyInfoValidationError(
      "Legal company name, billing SPOC name, and billing SPOC email are required.",
    );
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(spocEmail)) {
    setCompanyInfoValidationError("Billing SPOC email must be valid.");
    return;
  }
  setCompanyInfoValidationError("");
  setSaving(true);
  setActionError("");
  try {
    await patchRequest({
      row: activeRequest,
      onboardingStatus: activeRequest.onboarding_status,
      payload: {
        ...adminPayload,
        legalCompanyName: legalName,
        billingSpocName: spocName,
        billingSpocEmail: spocEmail,
        workflow: { ...adminPayload.workflow, companyInfoSaved: true },
      },
    });
    toast({ title: "Company and billing SPOC info saved", tone: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save details.";
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setSaving(false);
  }
}

export async function markWorkflowHandled(ctx: WorkflowCtx) {
  const {
    activeRequest,
    setSaving,
    setActionError,
    patchRequest,
    adminPayload,
    completionNotes,
    toast,
  } = ctx;
  if (!activeRequest) return;
  setSaving(true);
  setActionError("");
  try {
    await patchRequest({
      row: activeRequest,
      onboardingStatus: "handled",
      payload: adminPayload,
      handledNotes: completionNotes || "Onboarding completed in unified admin workflow.",
    });
    toast({ title: "Onboarding marked complete", tone: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete workflow.";
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setSaving(false);
  }
}

export async function cancelRequest(ctx: WorkflowCtx) {
  const {
    activeRequest,
    setSaving,
    setActionError,
    patchRequest,
    adminPayload,
    completionNotes,
    toast,
  } = ctx;
  if (!activeRequest) return;
  setSaving(true);
  setActionError("");
  try {
    await patchRequest({
      row: activeRequest,
      onboardingStatus: "cancelled",
      payload: adminPayload,
      handledNotes: completionNotes || "Cancelled during onboarding review.",
    });
    toast({ title: "Request cancelled", tone: "warning" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel request.";
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setSaving(false);
  }
}

export async function reopenRequestToPending(ctx: WorkflowCtx) {
  const { activeRequest, setSaving, setActionError, patchRequest, adminPayload, toast } = ctx;
  if (!activeRequest) return;
  setSaving(true);
  setActionError("");
  try {
    await patchRequest({
      row: activeRequest,
      onboardingStatus: "pending",
      payload: adminPayload,
    });
    toast({ title: "Request reopened to pending", tone: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reopen request.";
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setSaving(false);
  }
}
