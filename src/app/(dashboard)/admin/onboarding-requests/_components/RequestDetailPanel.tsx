"use client";

import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";
import { ApproveStep } from "./ApproveStep";
import { AutopilotSection } from "./AutopilotSection";
import { BillingProfileStep } from "./BillingProfileStep";
import { CompanyInfoStep } from "./CompanyInfoStep";
import { CompleteStep } from "./CompleteStep";
import { CreditsOverridesStep } from "./CreditsOverridesStep";
import { RequestSummary } from "./RequestSummary";

export function RequestDetailPanel({ wf }: { wf: OnboardingWorkflow }) {
  const { activeRequest, actionError, companyId } = wf;
  return (
    <div className="card-lifted rounded-xl p-4">
      {!activeRequest ? (
        <p className="text-sm text-white/60">Select a request to open the onboarding sequence.</p>
      ) : (
        <div className="space-y-5">
          <RequestSummary wf={wf} />

          {actionError ? <p className="text-sm text-red-300">{actionError}</p> : null}

          <AutopilotSection wf={wf} />

          <ApproveStep wf={wf} />

          <CompanyInfoStep wf={wf} />

          {companyId ? (
            <>
              <BillingProfileStep wf={wf} />

              <CreditsOverridesStep wf={wf} />

              <CompleteStep wf={wf} />
            </>
          ) : (
            <p className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-white/60">
              Complete Step 1 first to unlock billing, credits, and feature override setup.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
