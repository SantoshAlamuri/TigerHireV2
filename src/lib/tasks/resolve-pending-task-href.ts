import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";
import type { OrgPendingTask, PendingTaskKind } from "./org-pending-tasks";

/**
 * Plan-first nav: legacy job sub-routes (feedback tab, etc.) are hidden;
 * deep-link to Plan, interviews, or job-scoped pipeline.
 */
export function resolvePendingTaskHref(task: {
  kind: PendingTaskKind;
  jobId: string;
  href: string;
}): string {
  if (!isPlanDocumentNavActive()) return task.href;

  switch (task.kind) {
    case "slot_picker":
      return `/recruit/jobs/${task.jobId}/interviews`;
    case "feedback":
      return `/recruit/pipeline?jobId=${encodeURIComponent(task.jobId)}`;
    case "approval":
    case "interviewer_assignment":
    case "interviewer_availability":
      return `/recruit/jobs/${task.jobId}`;
    case "plan_exception":
      return `/recruit/pipeline?jobId=${encodeURIComponent(task.jobId)}`;
    default:
      return task.href;
  }
}

export function withResolvedPendingHrefs(tasks: OrgPendingTask[]): OrgPendingTask[] {
  return tasks.map((t) => ({ ...t, href: resolvePendingTaskHref(t) }));
}
