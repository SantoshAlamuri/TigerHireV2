import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";
import type { ActionableTask } from "./actionable-task-types";

/** Where to send the user when they explicitly open an act-type task off the /tasks page. */
export function externalHrefForActionableTask(task: ActionableTask): string {
  if (!isPlanDocumentNavActive()) return task.href;

  const jobId = task.job_id;
  if (!jobId) return task.href;

  switch (task.kind) {
    case "feedback":
      return `/recruit/pipeline?jobId=${encodeURIComponent(jobId)}`;
    case "slot_picker":
    case "interviewer_assignment":
    case "interviewer_availability":
      return `/recruit/jobs/${jobId}/interviews`;
    case "plan_exception":
      return `/recruit/pipeline?jobId=${encodeURIComponent(jobId)}`;
    case "approval_shortlist":
      return `/recruit/jobs/${jobId}/candidates`;
    default:
      return `/recruit/jobs/${jobId}`;
  }
}
