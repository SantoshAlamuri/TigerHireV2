import { describe, expect, it } from "vitest";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";
import { reprocessAgencyCandidate } from "@/lib/agency/reprocess-candidate";

const CANDIDATE = {
  id: "cand-1",
  name: "Victim Candidate",
  email: "v@example.com",
  phone: "+919812345678",
  cv_url: "https://storage/cv.pdf",
  resume_url: null,
};

/**
 * Access boundary: reprocessAgencyCandidate must not score a candidate that has
 * no pipeline row and no application on one of the agency's client orgs — otherwise
 * an arbitrary candidateId gets scored against every open client job (cross-agency
 * data exposure). These cases return before any CV download / scoring.
 */
describe("reprocessAgencyCandidate — access boundary", () => {
  it("blocks a candidate with no pipeline and no client application", async () => {
    const admin = createMockSupabase({
      candidates: createMockQueryBuilder({ data: CANDIDATE }),
      pipeline_candidates: createMockQueryBuilder({ data: [] }),
      applications: createMockQueryBuilder({ data: [] }),
    });

    const result = await reprocessAgencyCandidate(admin as never, {
      candidateId: "cand-1",
      agencyOrganisationId: "agency-1",
      clientOrgIds: ["client-a", "client-b"],
    });

    expect(result).toEqual({
      candidateId: "cand-1",
      success: false,
      error: "Candidate is not in your pipeline",
    });
  });

  it("blocks when the only application is on an org outside the agency's clients", async () => {
    const admin = createMockSupabase({
      candidates: createMockQueryBuilder({ data: CANDIDATE }),
      pipeline_candidates: createMockQueryBuilder({ data: [] }),
      applications: createMockQueryBuilder({
        data: [{ id: "app-1", jobs: { organisation_id: "other-agency-client" } }],
      }),
    });

    const result = await reprocessAgencyCandidate(admin as never, {
      candidateId: "cand-1",
      agencyOrganisationId: "agency-1",
      clientOrgIds: ["client-a", "client-b"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Candidate is not in your pipeline");
  });
});
