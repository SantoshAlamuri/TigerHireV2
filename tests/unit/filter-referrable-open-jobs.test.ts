import { describe, expect, it } from "vitest";
import {
  filterReferrableOpenJobs,
  isReferrableOpenJob,
} from "@/lib/jobs/filter-referrable-open-jobs";

describe("filterReferrableOpenJobs", () => {
  it("excludes internal-only IJP roles", () => {
    expect(
      isReferrableOpenJob({
        list_on_public_job_board: false,
        list_for_internal_referrals: true,
      }),
    ).toBe(false);
  });

  it("keeps public and dual-listed roles", () => {
    expect(
      filterReferrableOpenJobs([
        { id: "a", list_on_public_job_board: true, list_for_internal_referrals: false },
        { id: "b", list_on_public_job_board: true, list_for_internal_referrals: true },
        { id: "c", list_on_public_job_board: false, list_for_internal_referrals: true },
      ]),
    ).toEqual([
      { id: "a", list_on_public_job_board: true, list_for_internal_referrals: false },
      { id: "b", list_on_public_job_board: true, list_for_internal_referrals: true },
    ]);
  });
});
