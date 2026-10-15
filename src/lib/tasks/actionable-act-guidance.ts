import type { ActionableTask, ActionableTaskKind } from "./actionable-task-types";

export function actTaskGuidance(task: ActionableTask): string {
  switch (task.kind) {
    case "plan_exception":
      return "This candidate has been in a plan stage longer than target dwell. Move them in pipeline or complete the next step (e.g. schedule interview).";
    case "slot_picker":
      return "Open Scheduling for this role to manage slot picker or book an interview manually.";
    case "interviewer_assignment":
      return "Assign a primary interviewer in Plan stage setup, or open Scheduling once configured.";
    case "interviewer_availability":
      return "Add availability windows so slot picker can offer times to candidates.";
    case "feedback":
      return "Submit interview feedback from the pipeline or feedback flow for this candidate.";
    default:
      return "Complete this on the linked page. Your action is recorded in audit and plan activity where applicable.";
  }
}

export function actTaskButtonLabel(kind: ActionableTaskKind): string {
  switch (kind) {
    case "plan_exception":
      return "Open pipeline";
    case "slot_picker":
    case "interviewer_assignment":
    case "interviewer_availability":
      return "Open scheduling";
    case "feedback":
      return "Open pipeline";
    default:
      return "Open";
  }
}
