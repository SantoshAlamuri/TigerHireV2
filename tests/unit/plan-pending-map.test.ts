import { describe, it, expect } from "vitest";
import {
  buildPlanPendingMeta,
  sortPlanPendingTasks,
  type PlanPendingTaskDto,
} from "@/lib/tasks/plan-pending-types";

describe("plan pending sort and meta", () => {
  it("sorts by urgency then created_at desc", () => {
    const tasks: PlanPendingTaskDto[] = [
      {
        kind: "approval",
        title: "A",
        href: "/a",
        created_at: "2026-05-12T00:00:00.000Z",
        urgency: "normal",
      },
      {
        kind: "feedback",
        title: "B",
        href: "/b",
        created_at: "2026-05-11T00:00:00.000Z",
        urgency: "overdue",
      },
      {
        kind: "slot_picker",
        title: "C",
        href: "/c",
        created_at: "2026-05-13T00:00:00.000Z",
        urgency: "due_today",
      },
    ];
    const sorted = sortPlanPendingTasks(tasks);
    expect(sorted.map((t) => t.title)).toEqual(["B", "C", "A"]);
  });

  it("builds meta with by_kind and flags_active", () => {
    const tasks: PlanPendingTaskDto[] = [
      {
        kind: "approval",
        title: "A",
        href: "/a",
        created_at: "2026-05-12T00:00:00.000Z",
        urgency: "normal",
      },
      {
        kind: "approval",
        title: "B",
        href: "/b",
        created_at: "2026-05-11T00:00:00.000Z",
        urgency: "normal",
      },
      {
        kind: "feedback",
        title: "C",
        href: "/c",
        created_at: "2026-05-13T00:00:00.000Z",
        urgency: "normal",
      },
    ];
    const meta = buildPlanPendingMeta(tasks, true);
    expect(meta).toEqual({
      total: 3,
      by_kind: { approval: 2, feedback: 1 },
      flags_active: true,
    });
  });
});
