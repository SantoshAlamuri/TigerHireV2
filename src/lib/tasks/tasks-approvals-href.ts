/** Unified Tasks inbox for approval decisions (Brief 12). */
export const TASKS_APPROVALS_HREF = "/tasks?shape=decide&category=approvals";

export function tasksApprovalDeepLink(taskId: string): string {
  return `/tasks?task=${encodeURIComponent(taskId)}&shape=decide&category=approvals`;
}
