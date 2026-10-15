import { describe, it, expect } from "vitest";
import {
  enrichActionableTaskDisplay,
  taskActionShape,
  taskTypeLabel,
} from "@/lib/tasks/task-display";
import type { ActionableTask } from "@/lib/tasks/actionable-task-types";

describe("task-display", () => {
  it("classifies approval kinds as decide", () => {
    expect(taskActionShape("approval_requisition")).toBe("decide");
    expect(taskActionShape("feedback")).toBe("act");
  });

  it("enriches display fields on actionable tasks", () => {
    const base: ActionableTask = {
      id: "requisition:1",
      kind: "approval_requisition",
      category: "approvals",
      phase: 1,
      title: "Requisition — Engineer",
      assignee_id: "u1",
      href: "/tasks?task=requisition:1",
      action: "approve",
      created_at: "2026-05-10T10:00:00.000Z",
      urgency: "normal",
      completable: true,
      subject_label: "Engineer",
      context_label: "REQ-1 · Engineering",
      requested_by_name: "Alex HM",
    };
    const enriched = enrichActionableTaskDisplay(base);
    expect(enriched.type_label).toBe(taskTypeLabel("approval_requisition"));
    expect(enriched.action_shape).toBe("decide");
    expect(enriched.action_label).toBe("Decide");
    expect(enriched.requested_by_name).toBe("Alex HM");
  });
});
