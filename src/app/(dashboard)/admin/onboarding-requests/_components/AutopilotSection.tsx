"use client";

import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";

export function AutopilotSection({ wf }: { wf: OnboardingWorkflow }) {
  const {
    autopilotConfig,
    setAutopilotConfig,
    saving,
    autopilotLoading,
    runAutopilot,
    autopilotLog,
  } = wf;
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <p className="mb-2 text-sm font-semibold text-white">Autopilot — one-click onboarding</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={autopilotConfig.seedCreditsFromMonthlyPolicy}
            onChange={(e) =>
              setAutopilotConfig((prev) => ({
                ...prev,
                seedCreditsFromMonthlyPolicy: e.target.checked,
              }))
            }
          />
          Seed credits from monthly policy
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={autopilotConfig.applyRecommendedOverrides}
            onChange={(e) =>
              setAutopilotConfig((prev) => ({
                ...prev,
                applyRecommendedOverrides: e.target.checked,
              }))
            }
          />
          Apply recommended guardrails
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={autopilotConfig.autoCompleteRequest}
            onChange={(e) =>
              setAutopilotConfig((prev) => ({
                ...prev,
                autoCompleteRequest: e.target.checked,
              }))
            }
          />
          Mark complete automatically
        </label>
      </div>
      <button
        type="button"
        disabled={saving || autopilotLoading}
        onClick={runAutopilot}
        className="mt-3 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
      >
        {autopilotLoading ? "Running autopilot..." : "Run autopilot"}
      </button>
      {autopilotLog.length > 0 ? (
        <div className="mt-3 rounded-md bg-black/20 p-3 text-xs text-white/65">
          <p className="mb-1 font-semibold text-white/80">Autopilot log</p>
          <ul className="space-y-1">
            {autopilotLog.map((line, idx) => (
              <li key={`${line}-${idx}`}>- {line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
