"use client";

import { ENTITLEMENT_LABELS } from "@/lib/entitlements/config";
import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";

export function CreditsOverridesStep({ wf }: { wf: OnboardingWorkflow }) {
  const { creditDraft, setCreditDraft, saving, applyCredits, featuresQuery, setFeatureOverride } =
    wf;
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <p className="mb-2 text-sm font-semibold text-white">
        Step 4 — Initial credits and overrides
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          type="number"
          value={creditDraft.unlockDelta}
          onChange={(e) =>
            setCreditDraft((prev) => ({
              ...prev,
              unlockDelta: Number(e.target.value) || 0,
            }))
          }
          placeholder="Unlock delta"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={creditDraft.jobDelta}
          onChange={(e) =>
            setCreditDraft((prev) => ({
              ...prev,
              jobDelta: Number(e.target.value) || 0,
            }))
          }
          placeholder="Job delta"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <input
          value={creditDraft.reason}
          onChange={(e) => setCreditDraft((prev) => ({ ...prev, reason: e.target.value }))}
          placeholder="Reason"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={applyCredits}
        className="mt-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-white/80 disabled:opacity-60"
      >
        Apply initial credits
      </button>

      <div className="mt-4 space-y-2">
        {(featuresQuery.data?.features ?? []).map((feature) => (
          <label
            key={feature.key}
            className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            <span className="text-white/80">
              {ENTITLEMENT_LABELS[feature.key]}{" "}
              <span className="text-xs text-white/50">
                (default: {feature.planDefault ? "on" : "off"})
              </span>
            </span>
            <input
              type="checkbox"
              checked={feature.effective}
              onChange={(e) => void setFeatureOverride(feature.key, e.target.checked)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
