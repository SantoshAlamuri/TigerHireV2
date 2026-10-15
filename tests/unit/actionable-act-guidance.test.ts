import { describe, expect, it } from "vitest";
import { actTaskButtonLabel, actTaskGuidance } from "@/lib/tasks/actionable-act-guidance";
import type { ActionableTask } from "@/lib/tasks/actionable-task-types";

function task(partial: Partial<ActionableTask>): ActionableTask {
  return {
    id: "t1",
    kind: "plan_exception",
    category: "plan",
    phase: 2,
    title: "Test",
    assignee_id: "u1",
    href: "/tasks",
    action: "view",
    created_at: new Date().toISOString(),
    urgency: "normal",
    completable: false,
    ...partial,
  };
}

describe("actionable-act-guidance", () => {
  it("routes plan_exception guidance to pipeline action", () => {
    const t = task({ kind: "plan_exception" });
    expect(actTaskGuidance(t)).toContain("pipeline");
    expect(actTaskButtonLabel("plan_exception")).toBe("Open pipeline");
  });

  it("routes slot_picker to scheduling label", () => {
    expect(actTaskButtonLabel("slot_picker")).toBe("Open scheduling");
  });
});
