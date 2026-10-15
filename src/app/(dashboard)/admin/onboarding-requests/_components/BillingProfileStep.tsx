"use client";

import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";

export function BillingProfileStep({ wf }: { wf: OnboardingWorkflow }) {
  const { billingDraft, setBillingDraft, saving, saveBillingProfile, billingQuery } = wf;
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <p className="mb-2 text-sm font-semibold text-white">
        Step 3 — Billing profile and allowances
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={billingDraft.billingMode}
          onChange={(e) =>
            setBillingDraft((prev) => ({
              ...prev,
              billingMode: e.target.value as "automated" | "manual",
            }))
          }
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        >
          <option value="automated">Automated</option>
          <option value="manual">Manual</option>
        </select>
        <input
          value={billingDraft.customerType}
          onChange={(e) => setBillingDraft((prev) => ({ ...prev, customerType: e.target.value }))}
          placeholder="Customer type"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={billingDraft.unlockCreditsMonthly}
          onChange={(e) =>
            setBillingDraft((prev) => ({
              ...prev,
              unlockCreditsMonthly: Number(e.target.value) || 0,
            }))
          }
          placeholder="Monthly unlock credits"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={billingDraft.jobCreditsMonthly}
          onChange={(e) =>
            setBillingDraft((prev) => ({
              ...prev,
              jobCreditsMonthly: Number(e.target.value) || 0,
            }))
          }
          placeholder="Monthly job credits"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={billingDraft.allowNegativeBalance}
          onChange={(e) =>
            setBillingDraft((prev) => ({
              ...prev,
              allowNegativeBalance: e.target.checked,
            }))
          }
        />
        Allow negative balance
      </label>
      <textarea
        value={billingDraft.notes}
        onChange={(e) => setBillingDraft((prev) => ({ ...prev, notes: e.target.value }))}
        rows={2}
        placeholder="Billing notes"
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={saving}
        onClick={saveBillingProfile}
        className="mt-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-white/80 disabled:opacity-60"
      >
        Save billing profile
      </button>
      <p className="mt-2 text-xs text-white/55">
        Wallet now: unlock {billingQuery.data?.wallet.unlock_balance ?? "—"} · job{" "}
        {billingQuery.data?.wallet.job_balance ?? "—"}
      </p>
    </div>
  );
}
