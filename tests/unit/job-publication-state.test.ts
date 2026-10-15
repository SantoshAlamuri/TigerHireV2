import { describe, expect, it } from "vitest";
import { jobPublicationState } from "@/lib/jobs/publication-state";

describe("public application availability", () => {
  it("never interprets a draft as published even with public listing enabled", () => {
    expect(
      jobPublicationState({ status: "draft", is_active: true, list_on_public_job_board: true })
        .publicApplications,
    ).toBe(false);
  });
  it("requires all public eligibility fields, not simply an open status", () => {
    for (const job of [
      undefined,
      {},
      { status: "open" },
      { status: "closed", is_active: true, list_on_public_job_board: true },
      { status: "open", is_active: false, list_on_public_job_board: true },
      { status: "open", is_active: true, list_on_public_job_board: false },
    ]) {
      expect(jobPublicationState(job).publicApplications).toBe(false);
    }
  });
  it("reports a confirmed active public role as published", () => {
    expect(
      jobPublicationState({ status: "open", is_active: true, list_on_public_job_board: true }),
    ).toMatchObject({ label: "Published", publicApplications: true });
  });
});
