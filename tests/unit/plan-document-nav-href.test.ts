import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/navigation/plan-document-nav-filter", () => ({
  isPlanDocumentNavActive: () => true,
}));

import { externalHrefForActionableTask } from "@/lib/tasks/actionable-task-external-href";
import { resolvePendingTaskHref } from "@/lib/tasks/resolve-pending-task-href";

describe("plan-first act hrefs", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("plan_exception opens job pipeline", () => {
    expect(
      externalHrefForActionableTask({
        kind: "plan_exception",
        job_id: "job-1",
        href: "/legacy",
      } as never),
    ).toBe("/recruit/pipeline?jobId=job-1");
  });

  it("resolvePendingTaskHref for plan_exception uses pipeline", () => {
    expect(
      resolvePendingTaskHref({
        kind: "plan_exception",
        jobId: "job-1",
        href: "/legacy",
      }),
    ).toBe("/recruit/pipeline?jobId=job-1");
  });
});
