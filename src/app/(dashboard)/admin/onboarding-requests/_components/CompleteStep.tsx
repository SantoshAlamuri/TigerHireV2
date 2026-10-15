"use client";

import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";

export function CompleteStep({ wf }: { wf: OnboardingWorkflow }) {
  const {
    completionNotes,
    setCompletionNotes,
    saving,
    canCompleteWorkflow,
    markWorkflowHandled,
    cancelRequest,
    activeRequest,
  } = wf;
  if (!activeRequest) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <p className="mb-2 text-sm font-semibold text-white">Step 5 — Complete onboarding</p>
      <textarea
        value={completionNotes}
        onChange={(e) => setCompletionNotes(e.target.value)}
        rows={2}
        placeholder="Completion notes"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={saving || !canCompleteWorkflow}
        onClick={markWorkflowHandled}
        className="mt-3 rounded-md bg-emerald-500/80 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        Mark workflow complete
      </button>
      <button
        type="button"
        disabled={saving || activeRequest.onboarding_status === "cancelled"}
        onClick={cancelRequest}
        className="ml-2 mt-3 rounded-md border border-zinc-500/40 px-3 py-2 text-sm text-zinc-200 disabled:opacity-60"
      >
        Cancel request
      </button>
      {!canCompleteWorkflow ? (
        <p className="mt-2 text-xs text-white/50">
          Complete all prior steps and required company/SPOC fields before completion.
        </p>
      ) : null}
    </div>
  );
}
