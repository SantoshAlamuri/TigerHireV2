"use client";

import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";

export function CompanyInfoStep({ wf }: { wf: OnboardingWorkflow }) {
  const { adminPayload, setAdminPayload, saving, saveCompanyInfo, companyInfoValidationError } = wf;
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <p className="mb-2 text-sm font-semibold text-white">
        Step 2 — Company + billing SPOC information
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={adminPayload.legalCompanyName}
          onChange={(e) =>
            setAdminPayload((prev) => ({ ...prev, legalCompanyName: e.target.value }))
          }
          placeholder="Legal company name"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={adminPayload.website}
          onChange={(e) => setAdminPayload((prev) => ({ ...prev, website: e.target.value }))}
          placeholder="Website"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={adminPayload.billingSpocName}
          onChange={(e) =>
            setAdminPayload((prev) => ({ ...prev, billingSpocName: e.target.value }))
          }
          placeholder="Billing SPOC name"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={adminPayload.billingSpocEmail}
          onChange={(e) =>
            setAdminPayload((prev) => ({ ...prev, billingSpocEmail: e.target.value }))
          }
          placeholder="Billing SPOC email"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={adminPayload.billingSpocPhone}
          onChange={(e) =>
            setAdminPayload((prev) => ({ ...prev, billingSpocPhone: e.target.value }))
          }
          placeholder="Billing SPOC phone"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={adminPayload.gstin}
          onChange={(e) => setAdminPayload((prev) => ({ ...prev, gstin: e.target.value }))}
          placeholder="GSTIN / Tax ID"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
      </div>
      <textarea
        value={adminPayload.billingAddress}
        onChange={(e) => setAdminPayload((prev) => ({ ...prev, billingAddress: e.target.value }))}
        placeholder="Billing address"
        rows={2}
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
      />
      <textarea
        value={adminPayload.notes}
        onChange={(e) => setAdminPayload((prev) => ({ ...prev, notes: e.target.value }))}
        placeholder="Internal notes"
        rows={2}
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={saving}
        onClick={saveCompanyInfo}
        className="mt-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-white/80 disabled:opacity-60"
      >
        Save company info
      </button>
      {companyInfoValidationError ? (
        <p className="mt-2 text-xs text-rose-300">{companyInfoValidationError}</p>
      ) : null}
    </div>
  );
}
