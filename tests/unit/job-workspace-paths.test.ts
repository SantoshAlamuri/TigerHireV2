import { describe, expect, it } from "vitest";
import {
  jobsBasePath,
  pipelineBasePath,
  jobPipelineHref,
} from "@/lib/navigation/job-workspace-paths";
import type { UserRole } from "@/types";

// Every role the workspace can be reached as, to lock the role × path matrix
// (Bug Report: Jobs #10/#11/#8). These are link targets only — never an
// access decision; server RBAC stays the gate.
const ROLES: UserRole[] = [
  "super_admin",
  "leadership",
  "recruiter",
  "hiring_manager",
  "agency",
  "interviewer",
  "finance",
  "employee",
  "candidate_free",
  "candidate_pro",
];

describe("jobsBasePath", () => {
  const expected: Partial<Record<UserRole, string>> = {
    recruiter: "/recruit/jobs",
    hiring_manager: "/company/my-jobs",
    // Leadership moved onto the redesigned list with the recruiter: the Jobs
    // tab resolves there now, so a "back to jobs" link that still returned
    // /company/jobs landed on the pre-redesign table instead. The dashboard
    // route policy has admitted this role to /recruit/jobs since Brief 11.
    leadership: "/recruit/jobs",
    super_admin: "/recruit/jobs",
  };
  for (const role of ROLES) {
    it(`maps ${role} to its authorized Jobs base`, () => {
      expect(jobsBasePath(role)).toBe(expected[role] ?? "/company/jobs");
    });
  }
  it("never returns a /recruit path for hiring_manager (server would bounce it)", () => {
    expect(jobsBasePath("hiring_manager")).not.toContain("/recruit");
  });
  it("defaults safely for null/undefined", () => {
    expect(jobsBasePath(null)).toBe("/company/jobs");
    expect(jobsBasePath(undefined)).toBe("/company/jobs");
  });
});

describe("pipelineBasePath", () => {
  for (const role of ROLES) {
    it(`maps ${role} to its authorized Pipeline base`, () => {
      expect(pipelineBasePath(role)).toBe(
        role === "hiring_manager" ? "/company/my-pipeline" : "/recruit/pipeline",
      );
    });
  }
  it("never points hiring_manager at /recruit/pipeline (the reported redirect-to-Home bug)", () => {
    expect(pipelineBasePath("hiring_manager")).toBe("/company/my-pipeline");
  });
});

describe("jobPipelineHref", () => {
  it("scopes the pipeline link to the role base and encodes the jobId", () => {
    expect(jobPipelineHref("recruiter", "abc 123")).toBe("/recruit/pipeline?jobId=abc%20123");
    expect(jobPipelineHref("hiring_manager", "j1")).toBe("/company/my-pipeline?jobId=j1");
  });
});
