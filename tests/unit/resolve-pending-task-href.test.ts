import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePendingTaskHref } from "@/lib/tasks/resolve-pending-task-href";

describe("resolvePendingTaskHref", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns legacy href when plan document mode is off", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "false");
    vi.stubEnv("NEXT_PUBLIC_FF_PLAN_DOCUMENT", "false");
    expect(
      resolvePendingTaskHref({
        kind: "feedback",
        jobId: "job-1",
        href: "/recruit/jobs/job-1/feedback",
      }),
    ).toBe("/recruit/jobs/job-1/feedback");
  });

  it("rewrites feedback to job-scoped pipeline when plan mode is on", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(
      resolvePendingTaskHref({
        kind: "feedback",
        jobId: "job-1",
        href: "/recruit/jobs/job-1/feedback",
      }),
    ).toBe("/recruit/pipeline?jobId=job-1");
  });

  it("rewrites plan_exception to job plan", () => {
    vi.stubEnv("FF_PLAN_DOCUMENT", "true");
    expect(
      resolvePendingTaskHref({
        kind: "plan_exception",
        jobId: "abc",
        href: "/legacy",
      }),
    ).toBe("/recruit/pipeline?jobId=abc");
  });
});
