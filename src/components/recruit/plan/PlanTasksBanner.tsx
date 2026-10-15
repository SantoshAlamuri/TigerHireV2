"use client";

import Link from "next/link";
import { ListTodo } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApiQuery } from "@/lib/hooks/use-api";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import type { ActionableTasksMeta } from "@/lib/tasks/actionable-task-types";

type Response = { tasks: unknown[]; meta: ActionableTasksMeta };

/** Plan page entry to the org-wide tasks inbox (filtered to this role). */
export function PlanTasksBanner({ jobId }: { jobId: string }) {
  const planMode = isPlanDocumentUiEnabled();
  const { data, loading, error } = useApiQuery<Response>(
    planMode ? `/api/jobs/${jobId}/plan/pending` : null,
  );

  if (!planMode) return null;

  const total = data?.meta.total;
  if (!loading && !error && total === 0) return null;
  const tasksHref = `/tasks?jobId=${encodeURIComponent(jobId)}`;

  return (
    <section className="card-lifted flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <ListTodo className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Your tasks</h2>
          <p className="mt-0.5 text-xs text-white/55">Decisions and follow-ups assigned to you.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : total !== undefined && total > 0 ? (
          <StatusBadge tone="info" size="sm">
            {total} pending
          </StatusBadge>
        ) : (
          <span className="text-xs text-white/45">Task count unavailable</span>
        )}
        <Link
          href={tasksHref}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black hover:opacity-90"
        >
          Open tasks
        </Link>
      </div>
    </section>
  );
}
