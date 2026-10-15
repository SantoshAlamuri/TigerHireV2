import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

/**
 * Role x reachability matrix for the single candidate scope resolver.
 *
 * Every candidate surface (list, detail, resume, data agent) routes through
 * assertCandidateReachable. Before it existed each one re-derived the rule and
 * they drifted — hiring managers got org-level reach on three of the four, and
 * recruiters had their agencies flattened into a plain org list on two. This
 * matrix is what makes the next drift fail a test instead of an audit.
 */

vi.mock("@/lib/api-helpers", () => ({
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
}));

const mockAssertForOrgs = vi.fn();
vi.mock("@/lib/security/tenancy", () => ({
  assertCandidateAccessForOrgs: (...args: unknown[]) => mockAssertForOrgs(...args),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
    constructor(msg: string) {
      super(msg);
      this.name = "ForbiddenError";
    }
  },
}));

import { assertCandidateReachable } from "@/lib/security/candidate-scope";

const ctxFor = (role: string, organisationId: string | null = "org-1") => ({
  userId: "user-1",
  role,
  organisationId,
});

/** World where the HM owns job-1 and the candidate is reachable through it. */
function hmWorld({ jobs = [{ id: "job-1" }], applications = [], pipeline = [] } = {}) {
  return createMockSupabase({
    jobs: createMockQueryBuilder({ data: jobs }),
    applications: createMockQueryBuilder({ data: applications }),
    pipeline_candidates: createMockQueryBuilder({ data: pipeline }),
  });
}

describe("assertCandidateReachable — role matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertForOrgs.mockResolvedValue(undefined);
  });

  it("super_admin reaches any candidate without an org check", async () => {
    const supabase = createMockSupabase({});
    const access = await assertCandidateReachable(supabase, ctxFor("super_admin", null), "cand-1");
    expect(access.organisationIds).toEqual([]);
    expect(mockAssertForOrgs).not.toHaveBeenCalled();
  });

  it.each([["candidate_free"], ["candidate_pro"], ["employee"]])(
    "%s cannot reach a candidate through this path",
    async (role) => {
      const supabase = createMockSupabase({});
      await expect(assertCandidateReachable(supabase, ctxFor(role), "cand-1")).rejects.toThrow(
        "Forbidden",
      );
    },
  );

  describe("hiring_manager — scoped to jobs they own, never the whole org", () => {
    it("denies when they have no organisation", async () => {
      await expect(
        assertCandidateReachable(hmWorld(), ctxFor("hiring_manager", null), "cand-1"),
      ).rejects.toThrow("Forbidden");
    });

    it("denies when they are assigned no jobs", async () => {
      await expect(
        assertCandidateReachable(hmWorld({ jobs: [] }), ctxFor("hiring_manager"), "cand-1"),
      ).rejects.toThrow("Forbidden");
    });

    it("denies a candidate in the org but not in their funnel", async () => {
      await expect(
        assertCandidateReachable(hmWorld(), ctxFor("hiring_manager"), "cand-1"),
      ).rejects.toThrow("Forbidden");
    });

    it("allows a candidate who applied to a job they own", async () => {
      const access = await assertCandidateReachable(
        hmWorld({ applications: [{ id: "app-1" }] }),
        ctxFor("hiring_manager"),
        "cand-1",
      );
      expect(access.organisationIds).toEqual(["org-1"]);
    });

    it("allows a candidate on their pipeline with no application behind it", async () => {
      const access = await assertCandidateReachable(
        hmWorld({ pipeline: [{ id: "pc-1" }] }),
        ctxFor("hiring_manager"),
        "cand-1",
      );
      expect(access.organisationIds).toEqual(["org-1"]);
    });

    it("never delegates the decision to the org-level check", async () => {
      await assertCandidateReachable(
        hmWorld({ applications: [{ id: "app-1" }] }),
        ctxFor("hiring_manager"),
        "cand-1",
      );
      expect(mockAssertForOrgs).not.toHaveBeenCalled();
    });
  });

  describe("recruiter / leadership — agencies are delegated, not owned", () => {
    it.each([["recruiter"], ["leadership"]])(
      "%s scopes agency reach to jobs marked as their work",
      async (role) => {
        const supabase = createMockSupabase({
          agency_clients: createMockQueryBuilder({
            data: [{ agency_organisation_id: "org-agency" }],
          }),
        });

        const access = await assertCandidateReachable(supabase, ctxFor(role), "cand-1");

        expect(mockAssertForOrgs).toHaveBeenCalledWith("cand-1", {
          ownOrganisationId: "org-1",
          delegatedAgencyOrganisationIds: ["org-agency"],
        });
        // The agency's own unlocks and screening runs are not this company's.
        expect(access.organisationIds).toEqual(["org-1"]);
      },
    );

    it("denies when the caller has no organisation", async () => {
      await expect(
        assertCandidateReachable(createMockSupabase({}), ctxFor("recruiter", null), "cand-1"),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("agency — owns its clients' work, so a flat org list is correct", () => {
    it("passes its own org plus every client org", async () => {
      const supabase = createMockSupabase({
        agency_clients: createMockQueryBuilder({
          data: [
            { client_organisation_id: "org-client-a" },
            { client_organisation_id: "org-client-b" },
          ],
        }),
      });

      const access = await assertCandidateReachable(supabase, ctxFor("agency"), "cand-1");

      expect(mockAssertForOrgs).toHaveBeenCalledWith("cand-1", [
        "org-1",
        "org-client-a",
        "org-client-b",
      ]);
      expect(access.organisationIds).toEqual(["org-1", "org-client-a", "org-client-b"]);
    });

    it("falls back to its own org when it has no clients", async () => {
      const supabase = createMockSupabase({
        agency_clients: createMockQueryBuilder({ data: [] }),
      });
      await assertCandidateReachable(supabase, ctxFor("agency"), "cand-1");
      expect(mockAssertForOrgs).toHaveBeenCalledWith("cand-1", ["org-1"]);
    });
  });
});
