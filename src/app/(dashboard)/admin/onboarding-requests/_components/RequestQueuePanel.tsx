"use client";

import type { OnboardingWorkflow } from "../_hooks/useOnboardingWorkflow";

export function RequestQueuePanel({ wf }: { wf: OnboardingWorkflow }) {
  const { data, loading, error, refetch, activeId, setActiveId } = wf;
  return (
    <div className="card-lifted rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-white/60">Incoming requests</p>
        <button
          type="button"
          onClick={() => refetch({ silent: false })}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-white/70 transition hover:bg-[var(--surface)]"
        >
          Refresh
        </button>
      </div>
      {loading ? <p className="text-sm text-white/60">Loading queue…</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!loading && !error && (data?.requests?.length ?? 0) === 0 ? (
        <p className="text-sm text-white/60">No onboarding requests yet.</p>
      ) : null}
      <div className="space-y-2">
        {(data?.requests ?? []).map((row) => {
          const isActive = row.id === activeId;
          const statusTone =
            row.onboarding_status === "handled"
              ? "bg-emerald-500/20 text-emerald-300"
              : row.onboarding_status === "cancelled"
                ? "bg-zinc-500/20 text-zinc-300"
                : row.onboarding_status === "approved"
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-amber-500/20 text-amber-300";
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setActiveId(row.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                isActive
                  ? "border-[var(--accent)] bg-[var(--bg)]"
                  : "border-[var(--border)] bg-[var(--bg)]/60 hover:bg-[var(--bg)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  {row.company || "Unknown company"}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone}`}>
                  {row.onboarding_status}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/65">{row.email}</p>
              <p className="text-xs text-white/50">{row.onboarding_domain || "No domain"}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
