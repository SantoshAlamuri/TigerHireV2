"use client";

import type { WorkflowCtx } from "./types";

export async function saveBillingProfile(ctx: WorkflowCtx) {
  const {
    companyId,
    setSaving,
    setActionError,
    billingDraft,
    billingQuery,
    activeRequest,
    patchRequest,
    adminPayload,
    toast,
  } = ctx;
  if (!companyId) return;
  setSaving(true);
  setActionError("");
  try {
    const response = await fetch(`/api/admin/organisations/${companyId}/billing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        billingMode: billingDraft.billingMode,
        customerType: billingDraft.customerType,
        unlockCreditsMonthly: billingDraft.unlockCreditsMonthly,
        jobCreditsMonthly: billingDraft.jobCreditsMonthly,
        allowNegativeBalance: billingDraft.allowNegativeBalance,
        notes: billingDraft.notes,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not save billing profile.");
    await billingQuery.refetch({ silent: true });
    if (activeRequest) {
      await patchRequest({
        row: activeRequest,
        onboardingStatus: activeRequest.onboarding_status,
        payload: {
          ...adminPayload,
          workflow: { ...adminPayload.workflow, billingProfileSaved: true },
        },
      });
    }
    toast({ title: "Billing profile saved", tone: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save billing profile.";
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setSaving(false);
  }
}

export async function applyCreditAction(
  ctx: WorkflowCtx,
  type: "unlock" | "job",
  delta: number,
  reason: string,
) {
  const { companyId } = ctx;
  if (!companyId || !delta) return;
  const response = await fetch(`/api/admin/organisations/${companyId}/billing/credits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      creditType: type,
      entryType: delta > 0 ? "grant" : "adjust",
      delta,
      reason,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Failed to apply ${type} credits`);
}

export async function applyCredits(ctx: WorkflowCtx) {
  const {
    companyId,
    setSaving,
    setActionError,
    applyCredit,
    creditDraft,
    billingQuery,
    activeRequest,
    patchRequest,
    adminPayload,
    setCreditDraft,
    toast,
  } = ctx;
  if (!companyId) return;
  setSaving(true);
  setActionError("");
  try {
    await applyCredit("unlock", creditDraft.unlockDelta, creditDraft.reason);
    await applyCredit("job", creditDraft.jobDelta, creditDraft.reason);
    await billingQuery.refetch({ silent: true });
    if (activeRequest) {
      await patchRequest({
        row: activeRequest,
        onboardingStatus: activeRequest.onboarding_status,
        payload: {
          ...adminPayload,
          workflow: { ...adminPayload.workflow, creditsConfigured: true },
        },
      });
    }
    setCreditDraft((prev) => ({ ...prev, unlockDelta: 0, jobDelta: 0 }));
    toast({ title: "Credits updated", tone: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not apply credits.";
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setSaving(false);
  }
}

export async function setFeatureOverrideAction(
  ctx: WorkflowCtx,
  featureKey: string,
  enabled: boolean,
) {
  const {
    companyId,
    setSaving,
    setActionError,
    featuresQuery,
    activeRequest,
    patchRequest,
    adminPayload,
    toast,
  } = ctx;
  if (!companyId) return;
  setSaving(true);
  setActionError("");
  try {
    const response = await fetch(`/api/admin/organisations/${companyId}/features`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ featureKey, enabled, reason: "Onboarding workflow configuration" }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Failed to update feature override.");
    await featuresQuery.refetch({ silent: true });
    if (activeRequest) {
      await patchRequest({
        row: activeRequest,
        onboardingStatus: activeRequest.onboarding_status,
        payload: {
          ...adminPayload,
          workflow: { ...adminPayload.workflow, overridesReviewed: true },
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update feature override.";
    setActionError(message);
    toast({ title: message, tone: "error" });
  } finally {
    setSaving(false);
  }
}
