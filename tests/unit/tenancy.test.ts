import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

const mockCreateAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateAdmin(),
}));

import {
  ForbiddenError,
  assertJobOwnership,
  assertCandidateAccess,
  assertCandidateAccessForOrgs,
  assertFitScoreAccess,
} from "@/lib/security/tenancy";

describe("ForbiddenError", () => {
  it("has status 403 and correct name", () => {
    const err = new ForbiddenError("nope");
    expect(err.status).toBe(403);
    expect(err.name).toBe("ForbiddenError");
    expect(err.message).toBe("nope");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("assertJobOwnership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when job belongs to the company", async () => {
    const builder = createMockQueryBuilder({
      data: { organisation_id: "org-1" },
    });
    mockCreateAdmin.mockReturnValue({ from: () => builder });

    await expect(assertJobOwnership("job-1", "org-1")).resolves.toBeUndefined();
  });

  it("throws ForbiddenError when job belongs to a different company", async () => {
    const builder = createMockQueryBuilder({
      data: { organisation_id: "org-other" },
    });
    mockCreateAdmin.mockReturnValue({ from: () => builder });

    await expect(assertJobOwnership("job-1", "org-1")).rejects.toThrow(ForbiddenError);
    await expect(assertJobOwnership("job-1", "org-1")).rejects.toThrow(
      "Job does not belong to your company",
    );
  });

  it("throws ForbiddenError when job is not found", async () => {
    const builder = createMockQueryBuilder({ data: null });
    mockCreateAdmin.mockReturnValue({ from: () => builder });

    await expect(assertJobOwnership("job-missing", "org-1")).rejects.toThrow(ForbiddenError);
  });
});

describe("assertCandidateAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when candidate is unlocked for the company", async () => {
    const unlockBuilder = createMockQueryBuilder({
      data: { id: "unlock-1" },
    });
    const fitBuilder = createMockQueryBuilder({ data: [] });

    mockCreateAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === "candidate_unlocks") return unlockBuilder;
        if (table === "fit_scores") return fitBuilder;
        return createMockQueryBuilder();
      },
    });

    await expect(assertCandidateAccess("cand-1", "org-1")).resolves.toBeUndefined();
  });

  it("passes when candidate has a fit score for a company job", async () => {
    const unlockBuilder = createMockQueryBuilder({ data: null });
    const jobsBuilder = createMockQueryBuilder({
      data: [{ id: "j1" }],
    });
    const fitBuilder = createMockQueryBuilder();
    fitBuilder.then = vi
      .fn()
      .mockImplementation((resolve: (v: unknown) => void) =>
        resolve({ data: [{ id: "fs-1" }], error: null }),
      );

    mockCreateAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === "candidate_unlocks") return unlockBuilder;
        if (table === "jobs") return jobsBuilder;
        if (table === "fit_scores") return fitBuilder;
        return createMockQueryBuilder();
      },
    });

    await expect(assertCandidateAccess("cand-1", "org-1")).resolves.toBeUndefined();
  });

  it("throws ForbiddenError when no unlock and no fit score", async () => {
    const unlockBuilder = createMockQueryBuilder({ data: null });
    const fitBuilder = createMockQueryBuilder();
    fitBuilder.then = vi
      .fn()
      .mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [], error: null }));

    mockCreateAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === "candidate_unlocks") return unlockBuilder;
        if (table === "fit_scores") return fitBuilder;
        return createMockQueryBuilder();
      },
    });

    await expect(assertCandidateAccess("cand-1", "org-1")).rejects.toThrow(ForbiddenError);
    await expect(assertCandidateAccess("cand-1", "org-1")).rejects.toThrow(
      "Candidate not accessible to your company",
    );
  });

  it("throws ForbiddenError when fit_scores returns null", async () => {
    const unlockBuilder = createMockQueryBuilder({ data: null });
    const fitBuilder = createMockQueryBuilder();
    fitBuilder.then = vi
      .fn()
      .mockImplementation((resolve: (v: unknown) => void) => resolve({ data: null, error: null }));

    mockCreateAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === "candidate_unlocks") return unlockBuilder;
        if (table === "fit_scores") return fitBuilder;
        return createMockQueryBuilder();
      },
    });

    await expect(assertCandidateAccess("cand-1", "org-1")).rejects.toThrow(ForbiddenError);
  });
});

describe("assertFitScoreAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when fit score belongs to the company", async () => {
    const builder = createMockQueryBuilder({
      data: { id: "fs-1", jobs: { organisation_id: "org-1" } },
    });
    mockCreateAdmin.mockReturnValue({ from: () => builder });

    await expect(assertFitScoreAccess("fs-1", "org-1")).resolves.toBeUndefined();
  });

  it("throws ForbiddenError when fit score not accessible", async () => {
    const builder = createMockQueryBuilder({ data: null });
    mockCreateAdmin.mockReturnValue({ from: () => builder });

    await expect(assertFitScoreAccess("fs-missing", "org-1")).rejects.toThrow(ForbiddenError);
    await expect(assertFitScoreAccess("fs-missing", "org-1")).rejects.toThrow(
      "FitScore not accessible to your company",
    );
  });
});

describe("ForbiddenError – additional", () => {
  it("is catchable as an Error instance", () => {
    try {
      throw new ForbiddenError("denied");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as ForbiddenError).status).toBe(403);
    }
  });

  it("preserves custom message in stack trace", () => {
    const err = new ForbiddenError("custom message");
    expect(err.stack).toContain("custom message");
  });
});

describe("assertJobOwnership – query parameters", () => {
  it("queries the jobs table with correct jobId and companyId", async () => {
    const builder = createMockQueryBuilder({
      data: { organisation_id: "org-1" },
    });
    const fromFn = vi.fn().mockReturnValue(builder);
    mockCreateAdmin.mockReturnValue({ from: fromFn });

    await assertJobOwnership("job-abc", "org-1");

    expect(fromFn).toHaveBeenCalledWith("jobs");
    expect(builder.select).toHaveBeenCalledWith("organisation_id");
    expect(builder.eq).toHaveBeenCalledWith("id", "job-abc");
  });
});

describe("assertCandidateAccess – query parameters", () => {
  it("queries candidate_unlocks with correct candidate and org", async () => {
    const unlockBuilder = createMockQueryBuilder({
      data: { id: "u-1" },
    });
    const fitBuilder = createMockQueryBuilder({ data: [] });

    const fromFn = vi.fn((table: string) => {
      if (table === "candidate_unlocks") return unlockBuilder;
      if (table === "fit_scores") return fitBuilder;
      return createMockQueryBuilder();
    });
    mockCreateAdmin.mockReturnValue({ from: fromFn });

    await assertCandidateAccess("cand-42", "org-99");

    expect(fromFn).toHaveBeenCalledWith("candidate_unlocks");
    expect(unlockBuilder.eq).toHaveBeenCalledWith("candidate_id", "cand-42");
    expect(unlockBuilder.in).toHaveBeenCalledWith("organisation_id", ["org-99"]);
  });

  it("only queries fit_scores if unlock is not found", async () => {
    const unlockBuilder = createMockQueryBuilder({ data: null });
    const jobsBuilder = createMockQueryBuilder({
      data: [{ id: "j1" }],
    });
    const fitBuilder = createMockQueryBuilder();
    fitBuilder.then = vi
      .fn()
      .mockImplementation((resolve: (v: unknown) => void) =>
        resolve({ data: [{ id: "fs-1" }], error: null }),
      );

    const fromFn = vi.fn((table: string) => {
      if (table === "candidate_unlocks") return unlockBuilder;
      if (table === "jobs") return jobsBuilder;
      if (table === "fit_scores") return fitBuilder;
      return createMockQueryBuilder();
    });
    mockCreateAdmin.mockReturnValue({ from: fromFn });

    await assertCandidateAccess("cand-1", "org-1");

    expect(fromFn).toHaveBeenCalledWith("fit_scores");
  });
});

describe("assertFitScoreAccess – query parameters", () => {
  it("queries fit_scores with inner join on jobs", async () => {
    const builder = createMockQueryBuilder({
      data: { id: "fs-1", jobs: { organisation_id: "org-1" } },
    });
    const fromFn = vi.fn().mockReturnValue(builder);
    mockCreateAdmin.mockReturnValue({ from: fromFn });

    await assertFitScoreAccess("fs-1", "org-1");

    expect(fromFn).toHaveBeenCalledWith("fit_scores");
    expect(builder.select).toHaveBeenCalledWith("id, jobs!inner(organisation_id)");
    expect(builder.eq).toHaveBeenCalledWith("id", "fs-1");
    expect(builder.eq).toHaveBeenCalledWith("jobs.organisation_id", "org-1");
  });
});

describe("assertCandidateAccessForOrgs — agency delegation scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** No unlock, and jobs resolve to nothing, so the call always denies —
   *  what we assert on is HOW the jobs were scoped. */
  function mockAdminWithNoAccess() {
    const jobs = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({
      candidate_unlocks: createMockQueryBuilder({ data: null }),
      jobs,
    });
    mockCreateAdmin.mockReturnValue(supabase);
    return { jobs, supabase };
  }

  it("scopes agency delegation to jobs the agency marked as this client's work", async () => {
    const { jobs } = mockAdminWithNoAccess();

    await expect(
      assertCandidateAccessForOrgs("cand-1", {
        ownOrganisationId: "org-client",
        delegatedAgencyOrganisationIds: ["org-agency-a", "org-agency-b"],
      }),
    ).rejects.toThrow(ForbiddenError);

    const orArg = jobs.or.mock.calls[0]?.[0] ?? "";
    expect(orArg).toContain("organisation_id.eq.org-client");
    expect(orArg).toContain("client_organisation_id.eq.org-client");
    expect(orArg).toContain("organisation_id.in.(org-agency-a,org-agency-b)");

    // The leak this replaced: agencies flattened into a plain org list, which
    // reaches every job they own including other clients' roles.
    for (const call of jobs.in.mock.calls) {
      if (call[0] === "organisation_id") {
        expect(call[1]).not.toContain("org-agency-a");
      }
    }
  });

  it("never lets an agency's own unlock stand in for the client's access", async () => {
    const unlocks = createMockQueryBuilder({ data: null });
    mockCreateAdmin.mockReturnValue(
      createMockSupabase({
        candidate_unlocks: unlocks,
        jobs: createMockQueryBuilder({ data: [] }),
      }),
    );

    await expect(
      assertCandidateAccessForOrgs("cand-1", {
        ownOrganisationId: "org-client",
        delegatedAgencyOrganisationIds: ["org-agency-a"],
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(unlocks.in).toHaveBeenCalledWith("organisation_id", ["org-client"]);
  });

  it("falls back to a plain own-org match when the client has no agencies", async () => {
    const { jobs } = mockAdminWithNoAccess();

    await expect(
      assertCandidateAccessForOrgs("cand-1", {
        ownOrganisationId: "org-client",
        delegatedAgencyOrganisationIds: [],
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(jobs.eq).toHaveBeenCalledWith("organisation_id", "org-client");
    expect(jobs.or).not.toHaveBeenCalled();
  });

  it("keeps the flat array form for agencies, which do own their clients' work", async () => {
    const { jobs } = mockAdminWithNoAccess();

    await expect(
      assertCandidateAccessForOrgs("cand-1", ["org-agency", "org-client-1", "org-client-2"]),
    ).rejects.toThrow(ForbiddenError);

    expect(jobs.in).toHaveBeenCalledWith("organisation_id", [
      "org-agency",
      "org-client-1",
      "org-client-2",
    ]);
    expect(jobs.or).not.toHaveBeenCalled();
  });
});
