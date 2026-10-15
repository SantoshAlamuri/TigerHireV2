import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";

/** Deep link to a row on the unified /tasks inbox (preserves job filter when scoped). */
export function buildTasksPageHref(params: {
  taskId: string;
  jobId?: string | null;
  shape?: string;
  category?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.jobId) sp.set("jobId", params.jobId);
  if (params.shape) sp.set("shape", params.shape);
  if (params.category) sp.set("category", params.category);
  sp.set("task", params.taskId);
  return `/tasks?${sp.toString()}`;
}

/** Plan mode: operational work stays on /tasks; legacy mode uses job sub-routes. */
export function resolveOperationalTaskHref(task: {
  id: string;
  kind: string;
  jobId: string;
  legacyHref: string;
}): string {
  if (!isPlanDocumentNavActive()) return task.legacyHref;

  return buildTasksPageHref({ taskId: task.id, jobId: task.jobId });
}
