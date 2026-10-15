"use client";

import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";

export function ApproveStep({ wf }: { wf: OnboardingWorkflow }) {
  const { approvalForm, setApprovalForm, saving, activeRequest, approveAndCreateCompany } = wf;
  if (!activeRequest) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <p className="mb-2 text-sm font-semibold text-white">Step 1 — Approve and create company</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={approvalForm.company_name}
          onChange={(e) => setApprovalForm((prev) => ({ ...prev, company_name: e.target.value }))}
          placeholder="Company name"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={approvalForm.primary_domain}
          onChange={(e) => setApprovalForm((prev) => ({ ...prev, primary_domain: e.target.value }))}
          placeholder="Domain"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <select
          value={approvalForm.plan}
          onChange={(e) =>
            setApprovalForm((prev) => ({
              ...prev,
              plan: e.target.value as "starter" | "pro" | "enterprise",
            }))
          }
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        >
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <input
          value={approvalForm.admin_email}
          onChange={(e) => setApprovalForm((prev) => ({ ...prev, admin_email: e.target.value }))}
          placeholder="Admin email"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={approvalForm.admin_first_name}
          onChange={(e) =>
            setApprovalForm((prev) => ({ ...prev, admin_first_name: e.target.value }))
          }
          placeholder="Admin first name"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={approvalForm.admin_last_name}
          onChange={(e) =>
            setApprovalForm((prev) => ({ ...prev, admin_last_name: e.target.value }))
          }
          placeholder="Admin last name"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        disabled={saving || Boolean(activeRequest.onboarding_company_id)}
        onClick={approveAndCreateCompany}
        className="mt-3 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
      >
        {activeRequest.onboarding_company_id
          ? "Company already created"
          : "Approve & create company"}
      </button>
    </div>
  );
}
