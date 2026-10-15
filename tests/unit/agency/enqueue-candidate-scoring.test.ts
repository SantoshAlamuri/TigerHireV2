import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnqueue = vi.fn();

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("enqueueAgencyCandidateScoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueue.mockResolvedValue({ id: "evt-1" });
  });

  it("dedupes candidate ids and enqueues one event per id", async () => {
    const { enqueueAgencyCandidateScoring } =
      await import("@/lib/agency/enqueue-candidate-scoring");

    const result = await enqueueAgencyCandidateScoring(["a", "a", "b", "", "c"], {
      organisationId: "org-agency",
      userId: "user-1",
    });

    expect(result).toEqual({ queued: 3, total: 3 });
    expect(mockEnqueue).toHaveBeenCalledTimes(3);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "agency-candidate-reprocess",
      {
        candidateId: "a",
        agencyOrganisationId: "org-agency",
        triggeredByUserId: "user-1",
      },
      { id: "agency-reprocess:a" },
    );
  });

  it("returns queued 0 when Inngest send yields no id", async () => {
    mockEnqueue.mockResolvedValue({});
    const { enqueueAgencyCandidateScoring } =
      await import("@/lib/agency/enqueue-candidate-scoring");

    const result = await enqueueAgencyCandidateScoring(["x"], {
      organisationId: "org-agency",
      userId: "user-1",
    });

    expect(result).toEqual({ queued: 0, total: 1 });
  });
});

describe("filterAgencyAccessibleCandidateIds", () => {
  it("returns ids with pipeline or application on client org jobs", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "agency_clients") {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [{ client_organisation_id: "client-org-1" }],
                }),
            }),
          };
        }
        if (table === "pipeline_candidates") {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      candidate_id: "cand-1",
                      jobs: { organisation_id: "client-org-1" },
                    },
                  ],
                }),
            }),
          };
        }
        if (table === "applications") {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: [] }),
            }),
          };
        }
        return { select: () => ({ in: () => Promise.resolve({ data: [] }) }) };
      }),
    };

    const { filterAgencyAccessibleCandidateIds } =
      await import("@/lib/agency/enqueue-candidate-scoring");

    const ids = await filterAgencyAccessibleCandidateIds(
      admin as never,
      ["cand-1", "cand-other"],
      "agency-org-1",
    );

    expect(ids).toEqual(["cand-1"]);
  });
});
