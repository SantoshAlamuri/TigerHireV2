"use client";

import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";

export function RequestSummary({ wf }: { wf: OnboardingWorkflow }) {
  const { activeRequest, saving, reopenRequestToPending } = wf;
  if (!activeRequest) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-white">
        {activeRequest.company || "Unknown company"} (
        {activeRequest.onboarding_domain || "no-domain"})
      </p>
      <p className="text-xs text-white/60">
        Requester: {activeRequest.name || "Unknown"} • {activeRequest.email} •{" "}
        {activeRequest.onboarding_role_title || "Role not provided"}
      </p>
      <p className="mt-1 text-xs text-white/50">
        Current status: <span className="uppercase">{activeRequest.onboarding_status}</span>
      </p>
      {activeRequest.onboarding_status === "cancelled" ? (
        <button
          type="button"
          disabled={saving}
          onClick={reopenRequestToPending}
          className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-white/80 disabled:opacity-60"
        >
          Reopen request
        </button>
      ) : null}
      <pre className="mt-2 whitespace-pre-wrap rounded-md bg-black/20 p-3 text-xs text-white/65">
        {activeRequest.message}
      </pre>
    </div>
  );
}
