import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildTasksPageHref, resolveOperationalTaskHref } from "@/lib/tasks/tasks-page-href";

describe("tasks-page-href", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds task deep link with job scope", () => {
    expect(buildTasksPageHref({ taskId: "fb:1", jobId: "job-1" })).toBe(
      "/tasks?jobId=job-1&task=fb%3A1",
    );
  });

  it("uses tasks inbox for operational rows in plan mode", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_PLAN_DOCUMENT", "true");
    expect(
      resolveOperationalTaskHref({
        id: "iv:1",
        kind: "interviewer_assignment",
        jobId: "job-1",
        legacyHref: "/recruit/jobs/job-1/interviews",
      }),
    ).toBe("/tasks?jobId=job-1&task=iv%3A1");
  });

  it("keeps legacy href when plan document is off", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_PLAN_DOCUMENT", "false");
    expect(
      resolveOperationalTaskHref({
        id: "iv:1",
        kind: "interviewer_assignment",
        jobId: "job-1",
        legacyHref: "/recruit/jobs/job-1/interviews",
      }),
    ).toBe("/recruit/jobs/job-1/interviews");
  });
});
