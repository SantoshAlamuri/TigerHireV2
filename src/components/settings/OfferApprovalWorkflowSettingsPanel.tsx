"use client";

import { CheckCircle2 } from "lucide-react";

export function OfferApprovalWorkflowSettingsPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text)]">Offer approval workflow</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Offers use one fixed, sequential approval lane to keep behavior deterministic.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <p className="text-sm font-medium text-[var(--text)]">Fixed sequence</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {["Draft", "Pending Admin Approval", "Approved", "Sent"].map((step) => (
            <span
              key={step}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[var(--text-muted)]"
            >
              <CheckCircle2 size={12} />
              {step}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          This flow is intentionally non-configurable. Approval tasks appear in the approver inbox
          by role, and only the required role sees each pending step.
        </p>
      </div>
    </div>
  );
}
